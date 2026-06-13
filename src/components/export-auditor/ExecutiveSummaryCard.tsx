import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { formatInvoiceValueDisplay } from "@/lib/export-auditor/parse-locale-number";
import {
  countIssuesBySeverity,
  calculateExportReadinessScore,
  getReadinessVerdict,
} from "@/lib/export-auditor/readiness-score";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ExecutiveSummaryCardProps {
  report: ExportAuditReport;
}

export function ExecutiveSummaryCard({ report }: ExecutiveSummaryCardProps) {
  const displayScore = calculateExportReadinessScore(report);
  const verdict = getReadinessVerdict(report, displayScore);
  const counts = countIssuesBySeverity(report.issues);
  const { invoiceSummary, hsCodesDetected } = report;

  const items = [
    {
      label: "Invoice Value",
      value: formatInvoiceValueDisplay(invoiceSummary.invoiceValue, invoiceSummary.currency),
    },
    {
      label: "Destination",
      value: invoiceSummary.destinationCountry,
    },
    {
      label: "HS Codes",
      value: `${hsCodesDetected.length} detected`,
    },
    {
      label: "Issues",
      value:
        counts.critical + counts.warning + counts.information === 0
          ? "None"
          : [
              counts.critical > 0 && `${counts.critical} critical`,
              counts.warning > 0 && `${counts.warning} warnings`,
              counts.information > 0 && `${counts.information} info`,
            ]
              .filter(Boolean)
              .join(" · "),
    },
    {
      label: "Export Status",
      value: verdict.exportStatus,
      highlight: true,
    },
  ];

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Executive Summary
      </h3>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {item.label}
            </dt>
            <dd
              className={cn(
                "mt-1 text-sm font-semibold tabular-nums text-slate-900",
                item.highlight &&
                  (verdict.isReady ? "text-emerald-700" : "text-amber-700")
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface ExportReadinessScoreCardProps {
  report: ExportAuditReport;
}

export function ExportReadinessScoreCard({ report }: ExportReadinessScoreCardProps) {
  const displayScore = calculateExportReadinessScore(report);
  const verdict = getReadinessVerdict(report, displayScore);
  const StatusIcon = verdict.isReady ? CheckCircle2 : AlertTriangle;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border-2 shadow-sm",
        verdict.isReady
          ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"
          : "border-amber-300 bg-gradient-to-br from-amber-50/80 to-white"
      )}
    >
      <div className="px-6 py-6 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
          Export Readiness Score
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <p className="text-5xl font-extrabold tabular-nums tracking-tight text-slate-900 sm:text-6xl">
            {verdict.score}
            <span className="text-2xl font-semibold text-slate-400 sm:text-3xl"> / 100</span>
          </p>
          <div className="h-3 flex-1 min-w-[120px] max-w-xs overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                verdict.isReady ? "bg-emerald-500" : verdict.score >= 75 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${verdict.score}%` }}
            />
          </div>
        </div>
        <div className="mt-5 flex items-start gap-3">
          <StatusIcon
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              verdict.isReady ? "text-emerald-600" : "text-amber-600"
            )}
            aria-hidden
          />
          <div>
            <p className="text-base font-bold text-slate-900">{verdict.statusLabel}</p>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">{verdict.statusMessage}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
