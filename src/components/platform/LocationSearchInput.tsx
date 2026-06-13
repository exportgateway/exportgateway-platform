"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { searchLocations } from "@/lib/geocoding";
import type { ResolvedLocation } from "@/lib/location-types";
import { cn } from "@/lib/utils";

interface LocationSearchInputProps {
  id?: string;
  label: string;
  placeholder?: string;
  value: ResolvedLocation | null;
  onChange: (location: ResolvedLocation | null) => void;
  accent?: "brand" | "cyan" | "emerald";
  disabled?: boolean;
}

const accentStyles = {
  brand: "text-brand-500",
  cyan: "text-cyan-500",
  emerald: "text-emerald-500",
};

export function LocationSearchInput({
  id,
  label,
  placeholder = "City, postal code, or address",
  value,
  onChange,
  accent = "brand",
  disabled = false,
}: LocationSearchInputProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<ResolvedLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    if (value?.label === query) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const response = await searchLocations(trimmed, 6);
      setSuggestions(response.results);
      setIsOpen(response.results.length > 0);
      setActiveIndex(-1);
      setIsSearching(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [query, value?.label]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectLocation = useCallback(
    (location: ResolvedLocation) => {
      onChange(location);
      setQuery(location.label);
      setSuggestions([]);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange]
  );

  function handleClear() {
    onChange(null);
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectLocation(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="label-text flex items-center gap-2">
        <MapPin className={cn("h-4 w-4", accentStyles[accent])} />
        {label}
      </label>
      <div className="relative mt-0">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value && e.target.value !== value.label) {
              onChange(null);
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "input-field pr-10",
            value && "border-brand-300 bg-brand-50/30"
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {value && !isSearching && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md p-1 text-slate-400 hover:bg-surface-muted hover:text-slate-600"
              aria-label="Clear location"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-surface-border bg-white py-1 shadow-lg shadow-slate-900/10"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="option" aria-selected={activeIndex === index}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectLocation(suggestion)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                  activeIndex === index
                    ? "bg-brand-50 text-brand-900"
                    : "text-slate-700 hover:bg-surface-muted"
                )}
              >
                <MapPin className={cn("mt-0.5 h-4 w-4 shrink-0", accentStyles[accent])} />
                <span>{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function formatRouteLabel(
  origin: ResolvedLocation | null,
  destination: ResolvedLocation | null
): string | null {
  if (!origin || !destination) return null;
  const from = origin.city || origin.label.split(",")[0];
  const to = destination.city || destination.label.split(",")[0];
  return `${from} → ${to}`;
}
