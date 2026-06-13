"use client";

import { ArrowDown } from "lucide-react";
import type { ResolvedLocation } from "@/lib/location-types";

interface RouteSummaryCardProps {
  origin: ResolvedLocation | null;
  destination: ResolvedLocation | null;
  distanceKm?: number;
  compact?: boolean;
}

function locationLine(location: ResolvedLocation): string {
  if (location.city && location.country) {
    return location.postal_code
      ? `${location.postal_code} ${location.city}, ${location.country}`
      : `${location.city}, ${location.country}`;
  }
  return location.label;
}

export function RouteSummaryCard({
  origin,
  destination,
  distanceKm,
  compact = false,
}: RouteSummaryCardProps) {
  if (!origin || !destination) return null;

  return (
    <div
      className={`rounded-xl border border-surface-border bg-gradient-to-br from-white to-slate-50/80 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center pt-1">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-600 ring-4 ring-brand-100" />
          <span className="my-1 h-8 w-px bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 ring-4 ring-cyan-100" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pickup</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{locationLine(origin)}</p>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <ArrowDown className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Delivery</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{locationLine(destination)}</p>
          </div>
        </div>
      </div>
      {distanceKm != null && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-surface-border">
          <span className="text-slate-500">Distance</span>
          <span className="font-bold text-slate-900 tabular-nums">{Math.round(distanceKm)} km</span>
        </div>
      )}
    </div>
  );
}
