import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { countLineItems } from "@/lib/export-auditor/invoice-fields";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import type { ExportAuditReport } from "@/lib/export-auditor/types";

export interface ResolvedCommercialSummary {
  invoiceValue: number;
  goodsLineCount: number;
  parsingSucceeded: boolean;
}

/** True when invoice line items were successfully parsed. */
export function hasParsedInvoiceLines(invoice: NormalizedInvoice): boolean {
  return countLineItems(invoice) > 0;
}

/**
 * Resolve commercial summary values for enterprise / overview sections.
 * Never returns invoice value 0 or goods line count 0 when parsing succeeded.
 */
export function resolveCommercialSummary(
  invoice: NormalizedInvoice,
  dispositionTotalItems?: number | null
): ResolvedCommercialSummary {
  const parsedCount = countLineItems(invoice);
  const parsingSucceeded = parsedCount > 0;
  const goodsLineCount = Math.max(parsedCount, dispositionTotalItems ?? 0);
  const canonicalValue = resolveInvoiceValue(invoice);

  return {
    parsingSucceeded,
    goodsLineCount: parsingSucceeded ? Math.max(goodsLineCount, 1) : goodsLineCount,
    invoiceValue:
      parsingSucceeded && canonicalValue <= 0
        ? Math.max(canonicalValue, resolveInvoiceValue(invoice))
        : canonicalValue,
  };
}

/** Apply commercial summary guardrails to a mapped export report. */
export function applyEnterpriseCommercialSummary(
  report: ExportAuditReport,
  invoice: NormalizedInvoice,
  dispositionTotalItems?: number | null
): ExportAuditReport {
  const commercial = resolveCommercialSummary(invoice, dispositionTotalItems);
  if (!commercial.parsingSucceeded) {
    return report;
  }

  const invoiceValue =
    commercial.invoiceValue > 0
      ? commercial.invoiceValue
      : report.invoiceSummary.invoiceValue;

  const goodsLines = Math.max(
    commercial.goodsLineCount,
    report.hsAggregationReport.mrnSummary.totalGoodsLines,
    report.invoiceSummary.lineItemCount
  );

  return {
    ...report,
    invoiceSummary: {
      ...report.invoiceSummary,
      invoiceValue: invoiceValue > 0 ? invoiceValue : report.invoiceSummary.invoiceValue,
      lineItemCount: goodsLines,
    },
    hsAggregationReport: {
      ...report.hsAggregationReport,
      mrnSummary: {
        ...report.hsAggregationReport.mrnSummary,
        totalGoodsLines: goodsLines,
        totalInvoiceValue:
          invoiceValue > 0
            ? invoiceValue
            : report.hsAggregationReport.mrnSummary.totalInvoiceValue,
      },
    },
  };
}
