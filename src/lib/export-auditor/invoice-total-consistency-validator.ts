/**
 * Invoice total consistency — compare grand total, line sum, and customs disposition values.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { resolveInvoiceValue, sumLineTotals } from "@/lib/export-auditor/parse-locale-number";
import type { AuditIssue } from "@/lib/export-auditor/types";

export const TOTAL_MISMATCH = "TOTAL_MISMATCH";
export const INCONSISTENT_INVOICE_TOTAL = "INCONSISTENT_INVOICE_TOTAL";

export const TOTAL_MISMATCH_MESSAGE =
  "Invoice total differs by more than 1% from line-item sum or customs disposition value";

const DEFAULT_TOLERANCE_RATIO = 0.01;

export interface InvoiceTotalSource {
  id: string;
  value: number;
}

export interface InvoiceTotalConsistencyResult {
  sources: InvoiceTotalSource[];
  canonicalValue: number;
  maxDeviationRatio: number;
  inconsistent: boolean;
  flags: Record<string, boolean | string>;
  issues: AuditIssue[];
}

function relativeDeviation(a: number, b: number): number {
  if (a <= 0 && b <= 0) return 0;
  const base = Math.max(Math.abs(a), Math.abs(b), 0.01);
  return Math.abs(a - b) / base;
}

function lineSumAlignsWithGrandTotal(grandTotal: number, lineSum: number): boolean {
  if (grandTotal <= 0 || lineSum <= 0) return false;
  const ratio = lineSum / grandTotal;
  return ratio >= 0.85 && ratio <= 1.15;
}

function parserTotalLikelyTruncated(grandTotal: number, lineSum: number): boolean {
  return lineSum > 0 && grandTotal > 0 && grandTotal < lineSum * 0.5;
}

/** Collect comparable invoice total sources without overwriting any value. */
export function collectInvoiceTotalSources(
  invoice: NormalizedInvoice,
  options?: { customsDispositionValue?: number | null }
): InvoiceTotalSource[] {
  const sources: InvoiceTotalSource[] = [];
  const grandTotal = resolveInvoiceValue(invoice);
  const lineSum = sumLineTotals(invoice.items);
  const disposition = options?.customsDispositionValue;

  if (grandTotal > 0) {
    sources.push({ id: "invoice_grand_total", value: grandTotal });
  }

  if (lineSum != null && lineSum > 0) {
    const includeLineSum =
      parserTotalLikelyTruncated(grandTotal, lineSum) ||
      lineSumAlignsWithGrandTotal(grandTotal, lineSum);
    if (includeLineSum) {
      sources.push({ id: "line_item_sum", value: lineSum });
    }
  }

  if (disposition != null && disposition > 0) {
    sources.push({ id: "customs_disposition", value: disposition });
  }

  const parserTotal = invoice.total_value_numeric ?? invoice.total_value;
  if (parserTotal != null) {
    const parsed =
      typeof parserTotal === "number" ? parserTotal : parseFloat(String(parserTotal).replace(",", "."));
    if (
      Number.isFinite(parsed) &&
      parsed > 0 &&
      Math.abs(parsed - grandTotal) > 0.001 &&
      sources.every((source) => Math.abs(source.value - parsed) > 0.001)
    ) {
      sources.push({ id: "parser_total", value: parsed });
    }
  }

  return sources;
}

/**
 * Validate invoice totals across sources. Never silently overwrites totals — only flags mismatch.
 */
export function validateInvoiceTotalConsistency(
  invoice: NormalizedInvoice,
  options?: {
    customsDispositionValue?: number | null;
    toleranceRatio?: number;
  }
): InvoiceTotalConsistencyResult {
  const tolerance = options?.toleranceRatio ?? DEFAULT_TOLERANCE_RATIO;
  const grandTotal = resolveInvoiceValue(invoice);
  const lineSum = sumLineTotals(invoice.items);
  const disposition = options?.customsDispositionValue ?? null;
  const sources = collectInvoiceTotalSources(invoice, options);

  let maxDeviationRatio = 0;
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      maxDeviationRatio = Math.max(
        maxDeviationRatio,
        relativeDeviation(sources[i].value, sources[j].value)
      );
    }
  }

  let inconsistent = maxDeviationRatio > tolerance;

  if (
    disposition != null &&
    disposition > 0 &&
    grandTotal > 0 &&
    relativeDeviation(grandTotal, disposition) > tolerance
  ) {
    inconsistent = true;
  }

  if (
    !inconsistent &&
    lineSum != null &&
    lineSum > 0 &&
    disposition != null &&
    disposition > 0 &&
    relativeDeviation(lineSum, disposition) <= tolerance &&
    relativeDeviation(grandTotal, disposition) > tolerance
  ) {
    inconsistent = true;
  }

  if (
    !inconsistent &&
    parserTotalLikelyTruncated(grandTotal, lineSum ?? 0) &&
    lineSum != null &&
    lineSum > 0
  ) {
    inconsistent = true;
    maxDeviationRatio = Math.max(maxDeviationRatio, relativeDeviation(grandTotal, lineSum));
  }

  const issues: AuditIssue[] = [];
  const flags: Record<string, boolean | string> = {};

  if (inconsistent) {
    flags[TOTAL_MISMATCH] = true;
    flags[INCONSISTENT_INVOICE_TOTAL] = true;
    const detail = sources.map((source) => `${source.id}=${source.value.toFixed(2)}`).join("; ");
    issues.push({
      id: TOTAL_MISMATCH,
      type: "error",
      message: `${TOTAL_MISMATCH_MESSAGE} (${detail})`,
      field: TOTAL_MISMATCH,
    });
  }

  return {
    sources,
    canonicalValue: grandTotal,
    maxDeviationRatio,
    inconsistent,
    flags,
    issues,
  };
}
