"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  MapPin,
  Route,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import type { IntrastatResponse } from "@/lib/platform-api";
import { calculateIntrastatAllocation } from "@/lib/intrastat-allocation-client";
import type { ResolvedLocation } from "@/lib/location-types";
import { addPlatformHistoryEntry } from "@/lib/platform-history";
import { intrastatPresets } from "@/lib/intrastat-presets";
import { readFreightImport, clearFreightImport } from "@/lib/intrastat-freight-bridge";
import { parseIntrastatQueryImport } from "@/lib/intrastat-query-import";
import { LocationSearchInput } from "@/components/platform/LocationSearchInput";
import { IntrastatVisualization } from "@/components/platform/IntrastatVisualization";
import { cn } from "@/lib/utils";

const COMING_SOON_COUNTRIES = ["Italy", "Austria", "Germany", "Netherlands"];

export function IntrastatAllocationForm() {
  const searchParams = useSearchParams();
  const defaultPreset = intrastatPresets[0];

  const [origin, setOrigin] = useState<ResolvedLocation | null>(defaultPreset.from);
  const [destination, setDestination] = useState<ResolvedLocation | null>(defaultPreset.to);
  const [reportingCountry, setReportingCountry] = useState(defaultPreset.reporting_country);
  const [totalCost, setTotalCost] = useState(defaultPreset.total_cost);
  const [showFreightBanner, setShowFreightBanner] = useState(false);
  const [freightBannerDetail, setFreightBannerDetail] = useState<string | null>(null);
  const [multiCountryOpen, setMultiCountryOpen] = useState(false);
  const [result, setResult] = useState<IntrastatResponse | null>(null);
  const [calculatedAt, setCalculatedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const imported = parseIntrastatQueryImport(searchParams);
    if (!imported.source) return;

    if (imported.origin) setOrigin(imported.origin);
    if (imported.destination) setDestination(imported.destination);
    if (imported.totalCost) setTotalCost(imported.totalCost);

    const reporting =
      imported.destination?.country ||
      readFreightImport()?.destination.country ||
      defaultPreset.reporting_country;
    setReportingCountry(reporting);

    const isFreightFlow =
      imported.source === "freight-session" || searchParams.get("import") === "freight";
    if (isFreightFlow) {
      setShowFreightBanner(true);
      const session = readFreightImport();
      if (session) {
        setFreightBannerDetail(
          `${session.origin.city} → ${session.destination.city} · €${session.freightCost.toLocaleString("de-DE")}`
        );
      } else if (imported.origin && imported.destination && imported.totalCost) {
        setFreightBannerDetail(
          `${imported.origin.city} → ${imported.destination.city} · €${parseFloat(imported.totalCost).toLocaleString("de-DE")}`
        );
      }
    }

    setResult(null);
  }, [searchParams, defaultPreset.reporting_country]);

  function dismissFreightBanner() {
    clearFreightImport();
    setShowFreightBanner(false);
    setFreightBannerDetail(null);
  }

  function applyPreset(presetId: string) {
    const preset = intrastatPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setOrigin(preset.from);
    setDestination(preset.to);
    setTotalCost(preset.total_cost);
    setReportingCountry(preset.reporting_country);
    setResult(null);
    dismissFreightBanner();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !destination) return;

    setResult(null);
    setCalculatedAt(null);

    startTransition(async () => {
      const response = await calculateIntrastatAllocation({
        origin,
        destination,
        totalCost: parseFloat(totalCost) || 0,
        reportingCountry,
      });

      setResult(response);
      setCalculatedAt(new Date());

      if (response.success) {
        const route = `${origin.city} → ${destination.city}`;
        addPlatformHistoryEntry({
          tool: "intrastat",
          route,
          summary: `€${response.domestic_cost?.toFixed(0) ?? "0"} reporting · ${response.domestic_percent?.toFixed(0) ?? "0"}%`,
          href: "/platform/intrastat",
        });
        window.dispatchEvent(new Event("platform-history-updated"));
      }
    });
  }

  const canSubmit = Boolean(origin && destination);
  const parsedTotalCost = parseFloat(totalCost) || 0;

  return (
    <div className="grid gap-6 xl:grid-cols-5 xl:gap-8">
      <form onSubmit={handleSubmit} className="xl:col-span-2 space-y-5">
        {showFreightBanner && (
          <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-900">Imported from Freight Calculator</p>
              {freightBannerDetail && (
                <p className="mt-0.5 text-xs text-brand-800/80">{freightBannerDetail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={dismissFreightBanner}
              className="shrink-0 rounded p-1 text-brand-600 hover:bg-brand-100"
              aria-label="Dismiss import"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div>
          <label className="label-text">Quick routes</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {intrastatPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-4 shadow-sm sm:p-5">
          <LocationSearchInput
            id="intrastat-pickup"
            label="Pickup Location"
            placeholder="Berlin, Rotterdam, Paris…"
            value={origin}
            onChange={setOrigin}
            accent="brand"
          />
          <LocationSearchInput
            id="intrastat-delivery"
            label="Delivery Location"
            placeholder="Ljubljana, Milan, Madrid…"
            value={destination}
            onChange={setDestination}
            accent="emerald"
          />
        </div>

        <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-4 shadow-sm sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Globe className="h-4 w-4 text-emerald-500" />
            Allocation parameters
          </h3>
          <div className="grid gap-4">
            <div>
              <label htmlFor="reporting_country" className="label-text">
                Reporting country
              </label>
              <input
                id="reporting_country"
                value={reportingCountry}
                onChange={(e) => setReportingCountry(e.target.value)}
                className="input-field"
                placeholder="Slovenia"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Country where transport cost will be reported for Intrastat.
              </p>
            </div>
            <div>
              <label htmlFor="total_cost" className="label-text">
                Total freight cost (€)
              </label>
              <input
                id="total_cost"
                type="number"
                min="0.01"
                step="0.01"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-surface-border bg-surface-muted/10">
          <button
            type="button"
            onClick={() => setMultiCountryOpen(!multiCountryOpen)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 sm:px-5"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-400" />
              Advanced Allocation (Coming Soon)
            </span>
            {multiCountryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {multiCountryOpen && (
            <div className="border-t border-surface-border px-4 pb-4 pt-3 sm:px-5">
              <p className="text-xs text-slate-500">
                Future country-by-country allocation — beyond reporting country vs. non-reporting
                countries:
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {COMING_SOON_COUNTRIES.map((country) => (
                  <li
                    key={country}
                    className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-xs text-slate-600"
                  >
                    {country}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className={cn("btn-primary w-full sm:w-auto", !canSubmit && "opacity-50 cursor-not-allowed")}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating…
            </>
          ) : (
            "Calculate Allocation"
          )}
        </button>

        <Link
          href="/platform/freight"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Estimate Freight First →
        </Link>
      </form>

      <div className="xl:col-span-3">
        <IntrastatResultPanel
          result={result}
          loading={isPending}
          reportingCountry={reportingCountry}
          totalCost={parsedTotalCost}
          origin={origin}
          destination={destination}
          calculatedAt={calculatedAt}
        />
      </div>
    </div>
  );
}

function IntrastatResultPanel({
  result,
  loading,
  reportingCountry,
  totalCost,
  origin,
  destination,
  calculatedAt,
}: {
  result: IntrastatResponse | null;
  loading: boolean;
  reportingCountry: string;
  totalCost: number;
  origin: ResolvedLocation | null;
  destination: ResolvedLocation | null;
  calculatedAt: Date | null;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-500" />
          Computing route allocation…
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div
        className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 via-white to-slate-50/50 p-8"
        data-screenshot="intrastat-empty"
      >
        <div className="max-w-md text-center">
          <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-emerald-100/80" />
            <Route className="relative h-9 w-9 text-emerald-600" aria-hidden />
            <MapPin className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-white p-0.5 text-brand-500 shadow-sm" />
          </div>
          <p className="text-base font-semibold text-slate-800">Calculate your Intrastat transport value</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Enter pickup, delivery and freight cost to calculate the amount reportable in your Intrastat
            declaration.
          </p>
        </div>
      </div>
    );
  }

  if (!result.success && result.detail) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-semibold text-red-800">Allocation failed</h3>
        <p className="mt-2 text-sm text-red-700">{result.detail}</p>
      </div>
    );
  }

  return (
    <IntrastatVisualization
      result={result}
      reportingCountry={reportingCountry}
      totalCost={totalCost}
      origin={origin}
      destination={destination}
      calculatedAt={calculatedAt ?? new Date()}
    />
  );
}
