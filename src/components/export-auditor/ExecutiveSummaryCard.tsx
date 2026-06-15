import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { formatInvoiceValueDisplay } from "@/lib/export-auditor/parse-locale-number";
import {
  countIssuesBySeverity,
  calculateExportReadinessScore,
  getReadinessVerdict,
} from "@/lib/export-auditor/readiness-score";
import { AUDITOR_RESULT_CARD_SHADOW } from "@/components/export-auditor/auditor-ui";
import { cn } from "@/lib/utils";

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
      label: "Extraction Accuracy",
      value: `${report.extractionAccuracy?.score ?? "—"}/100`,
      highlight: true,
    },
    {
      label: "Customs Readiness",
      value: `${report.customsReadinessScore?.score ?? report.readinessScore}/100`,
      highlight: true,
    },
    {
      label: "Readiness Status",
      value: report.customsReadiness?.label ?? "—",
    },
  ];

  return (
    <section className={AUDITOR_RESULT_CARD_SHADOW}>
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

export { ExportReadinessScoreCard } from "@/components/export-auditor/DualScoreCards";
