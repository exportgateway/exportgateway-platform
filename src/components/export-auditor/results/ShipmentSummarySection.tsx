"use client";

import type {
  ShipmentExtractionDiagnostics,
  ShipmentExtractionSourceLabel,
} from "@/lib/export-auditor/shipment-extraction-diagnostics";
import type { ShipmentSummary } from "@/lib/export-auditor/types";

interface ShipmentSummarySectionProps {
  summary: ShipmentSummary;
  extractionDiagnostics?: ShipmentExtractionDiagnostics;
}

function displayValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function formatWeight(
  total: number | null | undefined,
  unit: string | null | undefined
): string {
  if (total == null) return "—";
  return `${total}${unit ? ` ${unit}` : ""}`;
}

function SourceBadge({ label, active }: { label: ShipmentExtractionSourceLabel; active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
          : "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400"
      }
    >
      {label}
    </span>
  );
}

export function ShipmentSummarySection({
  summary,
  extractionDiagnostics,
}: ShipmentSummarySectionProps) {
  const rows: { label: string; value: string }[] = [
    { label: "Gross Weight", value: formatWeight(summary.grossWeightTotal, summary.grossWeightUnit) },
    { label: "Net Weight", value: formatWeight(summary.netWeightTotal, summary.netWeightUnit) },
    ...(summary.packageCount != null
      ? [{ label: "Packages (Colli)", value: displayValue(summary.packageCount) }]
      : []),
    ...(summary.palletCount != null
      ? [{ label: "Pallets", value: displayValue(summary.palletCount) }]
      : []),
    {
      label: "Declaration Package Count",
      value: displayValue(summary.declarationPackageCount),
    },
    {
      label: "Declaration Package Type",
      value: displayValue(summary.declarationPackageType),
    },
  ];

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Shipment Summary
      </h3>

      {extractionDiagnostics && (
        <div className="mt-4 rounded-lg border border-surface-border/80 bg-slate-50/80 p-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Shipment Source
          </h4>
          <p className="mt-2 text-sm font-medium text-slate-800">
            Primary: {extractionDiagnostics.primarySource}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              ["OCR Structured", "OCR Text", "PDF Text", "Not Available"] as const
            ).map((label) => (
              <SourceBadge
                key={label}
                label={label}
                active={extractionDiagnostics.availableSources.includes(label)}
              />
            ))}
          </div>
          {extractionDiagnostics.providerMessage && (
            <p className="mt-3 text-sm text-slate-600">{extractionDiagnostics.providerMessage}</p>
          )}
        </div>
      )}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {row.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
