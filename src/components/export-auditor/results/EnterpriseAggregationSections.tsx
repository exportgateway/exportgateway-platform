"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Info } from "lucide-react";
import type { ExportAuditReport, HsAggregationReport, PreferenceAggregationRow } from "@/lib/export-auditor/types";
import { NON_PREFERENTIAL_EXPORT_LABEL } from "@/lib/export-auditor/hs-aggregation-engine";
import { formatOriginCountriesList } from "@/lib/export-auditor/origin-countries-summary";
import { formatInvoiceValueDisplay } from "@/lib/export-auditor/parse-locale-number";
import { prepareReportForDeclarationExport } from "@/lib/export-auditor/declaration-description-client";
import {
  DECLARATION_LANGUAGE_LABELS,
  DECLARATION_LANGUAGES,
  getExportLanguage,
  setExportLanguageOverride,
} from "@/lib/export-auditor/declaration-language-prefs";
import type { DeclarationLanguage } from "@/lib/export-auditor/types";
import {
  downloadMrnCsv,
  downloadMrnExcel,
  isMrnExportReady,
} from "@/lib/export-auditor/mrn-export";
import { formatDeclarationDescriptionSource } from "@/lib/export-auditor/declaration-description-display";
import { AiDescriptionHealthSection } from "@/components/export-auditor/results/AiDescriptionHealthSection";
import { AdminOnly } from "@/components/admin/AdminOnly";
import { Button } from "@/components/ui/Button";

const EXPORT_DESCRIPTION_TOOLTIP =
  "Product descriptions are exported to assist customs declaration preparation. Always verify the final declaration wording before filing.";

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const WEIGHT_ALLOCATION_UNAVAILABLE = "Weight allocation unavailable";

function formatPreferenceWeight(row: Pick<PreferenceAggregationRow, "totalNetWeight" | "weightAllocationUnavailable">): string {
  if (row.weightAllocationUnavailable) {
    return WEIGHT_ALLOCATION_UNAVAILABLE;
  }
  return formatNumber(row.totalNetWeight, 3);
}

function AggregationTable({
  title,
  headers,
  rows,
  emptyMessage,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-xl border border-surface-border bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left">
                {headers.map((header) => (
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
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-surface-border/60 last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-3 py-2.5 font-medium text-slate-800 tabular-nums"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NonPreferentialExportSection({
  row,
  currency,
  originCountriesDetected,
}: {
  row: PreferenceAggregationRow;
  currency: string;
  originCountriesDetected: string | null;
}) {
  const label = row.displayLabel ?? NON_PREFERENTIAL_EXPORT_LABEL;
  return (
    <section className="rounded-xl border border-surface-border bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</h3>
      {originCountriesDetected && (
        <p className="mt-2 text-xs text-slate-600">
          Origin Countries Detected: {originCountriesDetected}
        </p>
      )}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Quantity
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {row.totalQuantity}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Value</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {currency} {formatNumber(row.totalValue)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Weight</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {row.weightAllocationUnavailable
              ? WEIGHT_ALLOCATION_UNAVAILABLE
              : row.totalNetWeight != null
                ? `${formatNumber(row.totalNetWeight, 3)} kg`
                : WEIGHT_ALLOCATION_UNAVAILABLE}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Source Positions
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {row.sourcePositions.join(", ")}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function LineMarkerAllocationSection({
  title,
  quantity,
  value,
  weight,
  currency,
}: {
  title: string;
  quantity: number;
  value: number;
  weight: number | null;
  currency: string;
}) {
  return (
    <section className="rounded-xl border border-surface-border bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Quantity
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{quantity}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Value</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {currency} {formatNumber(value)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Weight</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {weight != null ? `${formatNumber(weight, 3)} kg` : WEIGHT_ALLOCATION_UNAVAILABLE}
          </dd>
        </div>
      </dl>
    </section>
  );
}

interface EnterpriseAggregationSectionsProps {
  auditReport: ExportAuditReport;
  /** When true, export buttons are rendered by DeclarationExportActions toolbar. */
  hideExportActions?: boolean;
}

export function EnterpriseAggregationSections({
  auditReport,
  hideExportActions = false,
}: EnterpriseAggregationSectionsProps) {
  const { hsAggregationReport, invoiceSummary, preferenceOrigin } = auditReport;
  const currency = invoiceSummary.currency;
  const { preferentialSummary, nonPreferentialSummary, mrnSummary, nonPreferentialExportSummary, originCountriesDetected } =
    hsAggregationReport;
  const allocation =
    preferenceOrigin.mixedOriginTotals ?? preferenceOrigin.preferentialAllocation;
  const showLineMarkerAllocation =
    preferenceOrigin.mixedOrigin && allocation != null && allocation.isMixed;
  const showNonPreferentialExport =
    preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT" &&
    nonPreferentialExportSummary != null;
  const exportReady = isMrnExportReady(auditReport);
  const lineCount = auditReport.hsAggregationReport?.traceabilityLines?.length ?? 0;
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [exportLanguage, setExportLanguage] = useState<DeclarationLanguage>("en");

  useEffect(() => {
    setExportLanguage(getExportLanguage());
  }, []);

  const descriptionSourceSummary = useMemo(() => {
    const entries = auditReport.declarationDescriptions ?? [];
    if (entries.length === 0) return null;
    const counts = entries.reduce<Record<string, number>>((acc, entry) => {
      const label = formatDeclarationDescriptionSource(entry.source);
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([label, count]) => `${label}: ${count}`)
      .join(" · ");
  }, [auditReport.declarationDescriptions]);

  const runExport = async (format: "csv" | "xlsx") => {
    setExporting(format);
    setExportProgress("Preparing declaration export...");
    try {
      if (lineCount >= 500) {
        setExportProgress("Preparing declaration export... (large invoice, 500+ lines)");
      } else if (lineCount >= 100) {
        setExportProgress("Preparing declaration export... (100+ lines)");
      } else if (lineCount >= 50) {
        setExportProgress("Preparing declaration export... (50+ lines)");
      }
      const enriched = await prepareReportForDeclarationExport(auditReport, exportLanguage);
      setExportProgress(
        format === "csv" ? "Generating CSV export..." : "Generating Excel export..."
      );
      const options = { language: exportLanguage };
      if (format === "csv") {
        await downloadMrnCsv(enriched, options);
      } else {
        await downloadMrnExcel(enriched, options);
      }
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  const handleCsvExport = async () => {
    await runExport("csv");
  };

  const handleExcelExport = async () => {
    await runExport("xlsx");
  };

  const handleExportLanguageChange = (language: DeclarationLanguage) => {
    setExportLanguage(language);
    setExportLanguageOverride(language);
  };

  return (
    <div className="space-y-6">
      <AdminOnly flag="testUtilities">
        <AiDescriptionHealthSection auditReport={auditReport} exportLanguage={exportLanguage} />
      </AdminOnly>
      {showNonPreferentialExport && nonPreferentialExportSummary ? (
        <NonPreferentialExportSection
          row={nonPreferentialExportSummary}
          currency={currency}
          originCountriesDetected={originCountriesDetected}
        />
      ) : showLineMarkerAllocation && allocation ? (
        <>
          <LineMarkerAllocationSection
            title="Preferential Goods"
            quantity={allocation.preferentialQuantity}
            value={allocation.preferentialValue}
            weight={allocation.preferentialWeight}
            currency={currency}
          />
          <LineMarkerAllocationSection
            title="Non-Preferential Goods"
            quantity={allocation.nonPreferentialQuantity}
            value={allocation.nonPreferentialValue}
            weight={allocation.nonPreferentialWeight}
            currency={currency}
          />
        </>
      ) : (
        <>
          <AggregationTable
            title="Preferential Origin Summary"
            headers={["HS Code", "Value", "Weight"]}
            emptyMessage={
              showNonPreferentialExport
                ? "No preferential-origin goods detected."
                : "No preferential-origin goods detected."
            }
            rows={preferentialSummary.map((row) => [
              row.displayLabel ?? row.hsCode,
              `${currency} ${formatNumber(row.totalValue)}`,
              formatPreferenceWeight(row),
            ])}
          />

          <AggregationTable
            title="Non-Preferential Origin Summary"
            headers={["HS Code", "Value", "Weight"]}
            emptyMessage={
              showNonPreferentialExport
                ? NON_PREFERENTIAL_EXPORT_LABEL
                : "No non-preferential goods detected."
            }
            rows={
              showNonPreferentialExport && nonPreferentialExportSummary
                ? [
                    [
                      nonPreferentialExportSummary.displayLabel ??
                        nonPreferentialExportSummary.hsCode,
                      `${currency} ${formatNumber(nonPreferentialExportSummary.totalValue)}`,
                      formatPreferenceWeight(nonPreferentialExportSummary),
                    ],
                  ]
                : nonPreferentialSummary.map((row) => [
                    row.displayLabel ?? row.hsCode,
                    `${currency} ${formatNumber(row.totalValue)}`,
                    formatPreferenceWeight(row),
                  ])
            }
          />
        </>
      )}

      {showLineMarkerAllocation && (preferentialSummary.length > 0 || nonPreferentialSummary.length > 0) && (
        <>
          <AggregationTable
            title="Preferential Origin Summary (HS)"
            headers={["HS Code", "Value", "Weight"]}
            emptyMessage="No preferential-origin goods detected."
            rows={preferentialSummary.map((row) => [
              row.hsCode,
              `${currency} ${formatNumber(row.totalValue)}`,
              formatPreferenceWeight(row),
            ])}
          />
          <AggregationTable
            title="Non-Preferential Origin Summary (HS)"
            headers={["HS Code", "Value", "Weight"]}
            emptyMessage="No non-preferential goods detected."
            rows={nonPreferentialSummary.map((row) => [
              row.hsCode,
              `${currency} ${formatNumber(row.totalValue)}`,
              formatPreferenceWeight(row),
            ])}
          />
        </>
      )}

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Declaration Preparation Summary
          </h3>
          {exportReady && !hideExportActions && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <span className="font-medium">Export Language</span>
                <select
                  value={exportLanguage}
                  onChange={(event) =>
                    handleExportLanguageChange(event.target.value as DeclarationLanguage)
                  }
                  disabled={exporting !== null}
                  className="rounded-md border border-surface-border bg-white px-2 py-1 text-xs font-medium text-slate-800"
                  aria-label="Export language for declaration descriptions"
                >
                  {DECLARATION_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {DECLARATION_LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={exporting !== null}
                onClick={handleCsvExport}
                className="inline-flex items-center gap-2"
                title={EXPORT_DESCRIPTION_TOOLTIP}
              >
                <Download className="h-4 w-4" aria-hidden />
                {exporting === "csv" ? "Exporting…" : "Export CSV"}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={exporting !== null}
                onClick={handleExcelExport}
                className="inline-flex items-center gap-2"
                title={EXPORT_DESCRIPTION_TOOLTIP}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
              </Button>
              <span
                className="inline-flex items-center text-slate-400"
                title={EXPORT_DESCRIPTION_TOOLTIP}
              >
                <Info className="h-4 w-4" aria-hidden />
                <span className="sr-only">{EXPORT_DESCRIPTION_TOOLTIP}</span>
              </span>
              {exportProgress && (
                <p className="w-full text-xs font-medium text-slate-600" role="status" aria-live="polite">
                  {exportProgress}
                </p>
              )}
            </div>
          )}
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { label: "Total Net Weight", value: formatNumber(mrnSummary.totalNetWeight, 3) },
            { label: "Gross Weight", value: formatNumber(mrnSummary.totalGrossWeight, 3) },
            { label: "Total Goods Lines", value: String(mrnSummary.totalGoodsLines) },
            { label: "Unique HS Codes", value: String(mrnSummary.uniqueHsCodes) },
            {
              label: "Invoice Value",
              value: formatInvoiceValueDisplay(
                invoiceSummary.invoiceValue,
                currency
              ),
            },
            {
              label: "Countries of Origin",
              value: formatOriginCountriesList(mrnSummary.countriesOfOrigin),
            },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>
        {auditReport.mrnExportReady && (
          <p className="mt-4 text-xs text-brand-700 font-medium">
            Declaration export ready — aggregation data includes full source position traceability.
          </p>
        )}
        {descriptionSourceSummary && (
          <p className="mt-2 text-xs text-slate-500" title="Description generation sources">
            Description sources: {descriptionSourceSummary}
          </p>
        )}
      </section>
    </div>
  );
}

export type { HsAggregationReport };
