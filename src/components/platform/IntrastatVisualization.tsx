"use client";

import { CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import type { IntrastatResponse } from "@/lib/platform-api";
import { exportIntrastatCsv, exportIntrastatPdf } from "@/lib/intrastat-export";
import { NON_REPORTING_LABEL, reportingCountryLabel } from "@/lib/intrastat-labels";
import { LazyMapboxRouteMap } from "@/components/platform/LazyMapboxRouteMap";
import type { ResolvedLocation } from "@/lib/location-types";
import { cn } from "@/lib/utils";

interface IntrastatVisualizationProps {
  result: IntrastatResponse;
  reportingCountry: string;
  totalCost: number;
  origin?: ResolvedLocation | null;
  destination?: ResolvedLocation | null;
  calculatedAt: Date;
}

const COLORS = {
  reporting: "#059669",
  nonReporting: "#2563eb",
};

const MAP_HEIGHT = 288;

export function IntrastatVisualization({
  result,
  reportingCountry,
  totalCost,
  origin,
  destination,
  calculatedAt,
}: IntrastatVisualizationProps) {
  const segmentLayers =
    result.route_segments?.map((seg, i) => ({
      id: `seg-${i}`,
      segment_type: seg.segment_type,
      coordinates: seg.coordinates,
      color: seg.segment_type === "domestic" ? COLORS.reporting : COLORS.nonReporting,
    })) ?? [];

  const routeLabel =
    result.route_summary != null
      ? `${result.route_summary.pickup} → ${result.route_summary.delivery}`
      : origin && destination
        ? `${origin.city} → ${destination.city}`
        : "Route";

  const exportContext = { routeLabel, reportingCountry, totalCost, calculatedAt };
  const reportingLabel = reportingCountryLabel(reportingCountry);
  const reportingValue = result.domestic_cost ?? 0;

  return (
    <div className="space-y-4" data-screenshot="intrastat-result">
      <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm">
        <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 px-5 py-6 text-white sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200/80">
              Intrastat Allocation Result
            </p>
            <div className="flex flex-wrap gap-2">
              <ExportBadge icon={Download} label="PDF Report" />
              <ExportBadge icon={FileSpreadsheet} label="Excel Export" />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border-2 border-emerald-300/50 bg-emerald-950/50 px-5 py-8 text-center sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
              Report for Intrastat
            </p>
            <p className="mt-4 text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl lg:text-7xl">
              €{reportingValue.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="mt-3 text-base font-semibold text-emerald-50 sm:text-lg">
              Transport Value Reportable in {reportingCountry}
            </p>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-200/70">
              Total Freight Cost
            </p>
            <p className="text-xl font-bold tabular-nums text-emerald-50/95 sm:text-2xl">
              €{totalCost.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <PortionHero
              label="Reporting Country Allocation"
              sublabel={reportingCountry}
              amount={result.domestic_cost}
              percent={result.domestic_percent}
              variant="reporting"
            />
            <PortionHero
              label={`${NON_REPORTING_LABEL} Allocation`}
              amount={result.foreign_cost}
              percent={result.foreign_percent}
              variant="nonReporting"
            />
          </div>
        </div>

        <div className="border-t border-surface-border px-5 py-4 sm:px-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Distance Allocation
          </h4>
          <AllocationTable
            rows={[
              {
                label: reportingLabel,
                km: result.domestic_km ?? 0,
                percent: result.domestic_percent ?? 0,
                highlight: true,
              },
              {
                label: NON_REPORTING_LABEL,
                km: result.foreign_km ?? 0,
                percent: result.foreign_percent ?? 0,
              },
            ]}
            totalKm={result.total_km ?? 0}
            totalLabel="Total Route"
          />
        </div>

        <div className="border-t border-surface-border px-5 py-4 sm:px-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Cost Allocation
          </h4>
          <AllocationTable
            rows={[
              {
                label: reportingLabel,
                km: result.domestic_cost ?? 0,
                percent: result.domestic_percent ?? 0,
                highlight: true,
              },
              {
                label: NON_REPORTING_LABEL,
                km: result.foreign_cost ?? 0,
                percent: result.foreign_percent ?? 0,
              },
            ]}
            totalKm={totalCost}
            totalLabel="Total Freight Cost"
            formatAsEuro
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-surface-border bg-slate-50/80 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => exportIntrastatPdf(result, exportContext)}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-800"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download Allocation Report (PDF)
          </button>
          <button
            type="button"
            onClick={() => exportIntrastatCsv(result, exportContext)}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-800"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
            Export to Excel
          </button>
        </div>

        <p className="border-t border-surface-border bg-emerald-50/30 px-5 py-3 text-xs leading-relaxed text-slate-600 sm:px-6">
          Allocation based on actual route distance and country segmentation using Mapbox routing.
        </p>
      </div>

      {segmentLayers.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-sm">
          <div className="border-b border-surface-border px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Route map</p>
            <p className="text-xs text-slate-500">
              Green = reporting country · Blue = non-reporting countries ·{" "}
              {Math.round(result.total_km ?? 0)} km total route
            </p>
          </div>
          <LazyMapboxRouteMap segments={segmentLayers} distanceKm={result.total_km} height={MAP_HEIGHT} />
          <div className="flex flex-wrap gap-4 border-t border-surface-border bg-slate-50 px-4 py-3.5 text-xs font-medium">
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="h-3 w-8 rounded-full shadow-sm"
                style={{ backgroundColor: COLORS.reporting }}
              />
              Reporting country · {result.domestic_percent?.toFixed(1)}%
            </span>
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="h-3 w-8 rounded-full shadow-sm"
                style={{ backgroundColor: COLORS.nonReporting }}
              />
              {NON_REPORTING_LABEL} · {result.foreign_percent?.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        This allocation is an estimate based on route analysis and country segmentation. Always verify
        reporting requirements with your customs broker, tax advisor, or competent authority.
      </p>
    </div>
  );
}

function ExportBadge({
  icon: Icon,
  label,
}: {
  icon: typeof Download;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
      <CheckCircle2 className="h-3 w-3 text-emerald-300" aria-hidden />
      <Icon className="h-3 w-3 text-emerald-200/80" aria-hidden />
      {label}
    </span>
  );
}

function PortionHero({
  label,
  sublabel,
  amount,
  percent,
  variant,
}: {
  label: string;
  sublabel?: string;
  amount?: number;
  percent?: number;
  variant: "reporting" | "nonReporting";
}) {
  const isReporting = variant === "reporting";
  return (
    <div
      className={cn(
        "rounded-xl px-4 py-3",
        isReporting ? "bg-emerald-500/25 ring-1 ring-emerald-400/40" : "bg-white/10 ring-1 ring-white/15"
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-100/80">{label}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs font-medium text-emerald-100/90">{sublabel}</p>
      )}
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
        €{(amount ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-100">
        {(percent ?? 0).toFixed(1)}%
      </p>
    </div>
  );
}

function AllocationTable({
  rows,
  totalKm,
  totalLabel,
  formatAsEuro = false,
}: {
  rows: Array<{ label: string; km: number; percent: number; highlight?: boolean }>;
  totalKm: number;
  totalLabel: string;
  formatAsEuro?: boolean;
}) {
  function formatValue(value: number, asEuro?: boolean): string {
    if (asEuro) {
      return `€${value.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `${Math.round(value)} km`;
  }

  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <th className="pb-2 font-semibold">Portion</th>
          <th className="pb-2 text-right font-semibold">{formatAsEuro ? "Amount" : "Distance"}</th>
          <th className="pb-2 text-right font-semibold">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className={cn(
              "border-b border-surface-border",
              row.highlight && "font-semibold text-emerald-800"
            )}
          >
            <td className="py-2.5 pr-4 text-slate-700">{row.label}</td>
            <td className="py-2.5 text-right tabular-nums text-slate-900">
              {formatValue(row.km, formatAsEuro)}
            </td>
            <td className="py-2.5 text-right tabular-nums text-slate-600">
              {row.percent.toFixed(1)}%
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-slate-200 font-semibold">
          <td className="py-2.5 text-slate-900">{totalLabel}</td>
          <td className="py-2.5 text-right tabular-nums text-slate-900">
            {formatValue(totalKm, formatAsEuro)}
          </td>
          <td className="py-2.5 text-right tabular-nums text-slate-600">100%</td>
        </tr>
      </tbody>
    </table>
  );
}
