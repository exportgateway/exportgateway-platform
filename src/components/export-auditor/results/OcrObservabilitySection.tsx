"use client";

import type { ExportAuditReport } from "@/lib/export-auditor/types";

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

interface OcrObservabilitySectionProps {
  auditReport: ExportAuditReport;
}

export function OcrObservabilitySection({ auditReport }: OcrObservabilitySectionProps) {
  const observability = auditReport.ocrObservability;
  const session = auditReport.ocrSessionMetrics;

  if (!observability) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-surface-border bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          OCR Diagnostics
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "OCR Provider", value: observability.ocrProvider },
            { label: "OCR Pages", value: String(observability.pageCount) },
            {
              label: "Data Extraction Completeness",
              value: `${observability.dataExtractionCompleteness ?? observability.ocrQualityScore}%`,
            },
            { label: "OCR Cost", value: formatUsd(observability.estimatedOcrCostUsd) },
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
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-surface-border/60 pt-4">
          {[
            { label: "Extraction Source", value: observability.extractionSource },
            { label: "OCR Text Length", value: observability.ocrTextLength.toLocaleString() },
            { label: "Items Extracted", value: String(observability.itemsExtracted) },
            {
              label: "Cost Per Page",
              value: formatUsd(observability.costPerPageUsd),
            },
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
        <dl className="mt-4 grid gap-3 sm:grid-cols-3 border-t border-surface-border/60 pt-4">
          {[
            { label: "Items With HS Code", value: String(observability.itemsWithHsCode) },
            {
              label: "Items With Country of Origin",
              value: String(observability.itemsWithCountryOfOrigin),
            },
            { label: "Items With Line Total", value: String(observability.itemsWithLineTotal) },
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
      </section>

      {session && (
        <section className="rounded-xl border border-surface-border bg-white p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            OCR Session Metrics
          </h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total OCR Pages", value: String(session.totalOcrPages) },
              { label: "Total OCR Cost", value: formatUsd(session.totalOcrCostUsd) },
              {
                label: "Avg Cost Per Invoice",
                value: formatUsd(session.averageOcrCostPerInvoiceUsd),
              },
              { label: "Average Extraction Completeness", value: `${session.averageOcrQuality}%` },
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
        </section>
      )}
    </div>
  );
}

interface OcrObservabilitySummaryProps {
  observability?: ExportAuditReport["ocrObservability"];
}

/** Compact OCR summary for the overview tab. */
export function OcrObservabilitySummary({ observability }: OcrObservabilitySummaryProps) {
  if (!observability) return null;

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        OCR Summary
      </h3>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Pages", value: String(observability.pageCount) },
          { label: "Completeness", value: `${observability.dataExtractionCompleteness ?? observability.ocrQualityScore}%` },
          { label: "Est. Cost", value: formatUsd(observability.estimatedOcrCostUsd) },
          { label: "Provider", value: observability.ocrProvider },
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
