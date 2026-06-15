import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { formatOriginCountriesList } from "@/lib/export-auditor/origin-countries-summary";

interface HsOriginSummarySectionProps {
  report: ExportAuditReport;
}

function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null) return "—";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Compact HS & origin summary for broker workflow. */
export function HsOriginSummarySection({ report }: HsOriginSummarySectionProps) {
  const { hsCodesDetected, hsAggregationReport, preferenceOrigin } = report;
  const mrn = hsAggregationReport.mrnSummary;
  const hsRows = hsAggregationReport.hsAggregation.slice(0, 12);

  return (
    <section className="rounded-xl border border-surface-border bg-white p-4 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        HS &amp; Origin Summary
      </h3>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Unique HS Codes
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {formatNumber(mrn.uniqueHsCodes)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Goods Lines
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {formatNumber(mrn.totalGoodsLines)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Countries of Origin
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">
            {formatOriginCountriesList(mrn.countriesOfOrigin)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Preferential Status
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">
            {preferenceOrigin.preferentialOriginStatus.replace(/_/g, " ")}
          </dd>
        </div>
      </dl>

      {hsRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left">
                {["HS Code", "Qty", "Value", "Origin"].map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hsRows.map((row, index) => (
                <tr
                  key={`${row.hsCode}-${row.preferentialOrigin}-${index}`}
                  className="border-b border-surface-border/60 last:border-0"
                >
                  <td className="px-3 py-2 font-medium tabular-nums text-slate-800">{row.hsCode}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">
                    {formatNumber(row.totalQuantity, 0)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">
                    {formatNumber(row.totalValue, 2)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.countriesOfOrigin?.join(", ") ?? row.countryOfOrigin ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hsAggregationReport.hsAggregation.length > hsRows.length && (
            <p className="mt-2 text-xs text-slate-500">
              Showing {hsRows.length} of {hsAggregationReport.hsAggregation.length} aggregated HS
              rows.
            </p>
          )}
        </div>
      )}

      {hsCodesDetected.length > 0 && hsRows.length === 0 && (
        <p className="text-sm text-slate-600">
          Detected HS: {hsCodesDetected.filter(Boolean).join(", ")}
        </p>
      )}
    </section>
  );
}
