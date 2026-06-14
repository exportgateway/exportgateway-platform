"use client";

import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { formatFieldRecoveryStatus } from "@/lib/export-auditor/data-recovery-diagnostics";

interface DataRecoveryDiagnosticsSectionProps {
  auditReport: ExportAuditReport;
}

function statusTone(status: "parsed" | "recovered" | "missing"): string {
  switch (status) {
    case "parsed":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "recovered":
      return "text-amber-800 bg-amber-50 border-amber-200";
    case "missing":
      return "text-rose-700 bg-rose-50 border-rose-200";
    default:
      return "text-slate-700 bg-slate-50 border-slate-200";
  }
}

export function DataRecoveryDiagnosticsSection({
  auditReport,
}: DataRecoveryDiagnosticsSectionProps) {
  const diagnostics = auditReport.dataRecoveryDiagnostics;
  if (!diagnostics) return null;

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Data Recovery Diagnostics
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Distinguishes parser success, OCR fallback recovery, and remaining extraction gaps.
          </p>
        </div>
        {diagnostics.highRecoveryRisk && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            High recovery risk (&gt;30%)
          </span>
        )}
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Fields Parsed Normally", value: String(diagnostics.fieldsParsedNormally) },
          { label: "Fields Recovered", value: String(diagnostics.fieldsRecovered) },
          { label: "Fields Missing", value: String(diagnostics.fieldsMissing) },
          { label: "Recovery Count", value: String(diagnostics.recoveryCount) },
          { label: "Recovery Percentage", value: `${diagnostics.recoveryPercentage}%` },
        ].map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {row.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 overflow-hidden rounded-lg border border-surface-border/70">
        <table className="min-w-full divide-y divide-surface-border/70 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Field
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Status
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Original
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Recovered
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border/60 bg-white">
            {diagnostics.fieldStatuses.map((row) => (
              <tr key={row.field}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.label}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone(row.status)}`}
                  >
                    {formatFieldRecoveryStatus(row)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.original_value ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.status === "recovered"
                    ? (row.recovered_value ?? row.display_value ?? "—")
                    : (row.display_value ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Compact recovery summary for overview tab. */
export function DataRecoverySummary({
  auditReport,
}: {
  auditReport: ExportAuditReport;
}) {
  const diagnostics = auditReport.dataRecoveryDiagnostics;
  if (!diagnostics) return null;

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Parser Recovery
      </h3>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Parsed", value: String(diagnostics.fieldsParsedNormally) },
          { label: "Recovered", value: String(diagnostics.fieldsRecovered) },
          { label: "Missing", value: String(diagnostics.fieldsMissing) },
          { label: "Recovery %", value: `${diagnostics.recoveryPercentage}%` },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {item.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
