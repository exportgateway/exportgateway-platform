import type { ExportAuditReport } from "@/lib/export-auditor/types";

interface HsCodesSectionProps {
  codes: string[];
}

export function HsCodesSection({ codes }: HsCodesSectionProps) {
  if (codes.length === 0) {
    return (
      <section className="rounded-xl border border-surface-border bg-slate-50/50 p-4 text-sm text-slate-500">
        No HS / tariff codes detected on this document.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-700">
          HS / Tariff Codes Detected
        </h3>
        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-800">
          {codes.length} detected
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {codes.map((code) => (
          <span
            key={code}
            className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-900"
          >
            {code}
          </span>
        ))}
      </div>
    </section>
  );
}

interface ExportReportSectionProps {
  report: ExportAuditReport;
}

function formatWeight(
  total: number | null | undefined,
  unit: string | null | undefined
): string {
  if (total == null) return "—";
  return `${total.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })}${unit ? ` ${unit}` : ""}`;
}

export function ExportReportSection({ report }: ExportReportSectionProps) {
  const { shipmentSummary, hsAggregationReport } = report;
  const netWeight =
    shipmentSummary.netWeightTotal ?? hsAggregationReport.mrnSummary.totalNetWeight;
  const netWeightUnit =
    shipmentSummary.netWeightUnit ??
    (netWeight != null ? "kg" : null);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-700">
          Customs Shipment Weights
        </h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Gross Weight
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {formatWeight(shipmentSummary.grossWeightTotal, shipmentSummary.grossWeightUnit)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Net Weight
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {formatWeight(netWeight, netWeightUnit)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-600">
          Net weight is recommended for customs preparation and MRN filing. When line-item weights
          are unavailable, shipment-level net weight is used.
        </p>
      </section>

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Export Summary
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{report.exportSummary}</p>
      </section>

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Filing Recommendations
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {report.filingRecommendations.map((rec) => (
            <li key={rec} className="leading-relaxed">
              {rec}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
