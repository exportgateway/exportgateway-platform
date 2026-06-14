/**
 * Customs extraction integrity — validates HS aggregation and traceability invariants.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractGenericHsCodes } from "@/lib/export-auditor/hs-code-extraction-engine";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import {
  reconcilePositionCounts,
  countOcrSourcePositions,
  POSITION_COUNT_MISMATCH_THRESHOLD,
} from "@/lib/export-auditor/position-count-reconciliation";
import { corpusContainsVisibleHsLabels } from "@/lib/export-auditor/position-block-extraction";
import { extractHsCodes, normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import {
  filterGoodsLines,
  normalizeAggregationItems,
  runHsAggregationEngine,
} from "@/lib/export-auditor/hs-aggregation-engine";
import { buildPositionTraceability } from "@/lib/export-auditor/position-traceability";
import type { AuditIssue } from "@/lib/export-auditor/types";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import {
  DUPLICATE_LINE_EXTRACTION,
  DUPLICATE_LINE_EXTRACTION_MESSAGE,
  estimateSourceCommercialLineCount,
  LINE_COUNT_OVERFLOW_THRESHOLD,
} from "@/lib/export-auditor/commercial-line-deduplication";
import { runPositionCertification } from "@/lib/export-auditor/position-reconciliation-engine";
import { POSITION_DATA_OVERWRITE_ATTEMPT } from "@/lib/export-auditor/position-lock-engine";

export const HS_AGGREGATION_MISSING = "HS_AGGREGATION_MISSING";
export const TRACEABILITY_MISSING = "TRACEABILITY_MISSING";
export const EXTRACTION_INTEGRITY_ERROR = "EXTRACTION_INTEGRITY_ERROR";
export const EXTRACTION_LINE_COUNT_MISMATCH = "EXTRACTION_LINE_COUNT_MISMATCH";
export const HS_EXTRACTION_FAILURE = "HS_EXTRACTION_FAILURE";

export const HS_AGGREGATION_MISSING_MESSAGE =
  "HS codes detected on invoice but aggregation was not generated";

export const TRACEABILITY_MISSING_MESSAGE =
  "Line items extracted but position traceability table is empty";

export const EXTRACTION_LINE_COUNT_MISMATCH_MESSAGE =
  "Structured line item count differs from position rows detected in OCR text by more than 5%";

export const DUPLICATE_LINE_OVERFLOW_MESSAGE =
  "Extracted commercial line count exceeds source document line count by more than 10%";

export { DUPLICATE_LINE_EXTRACTION, DUPLICATE_LINE_EXTRACTION_MESSAGE } from "@/lib/export-auditor/commercial-line-deduplication";

export const HS_EXTRACTION_FAILURE_MESSAGE =
  "HS/tariff codes are visible on the invoice document but were not extracted to line items";

export interface ExtractionIntegrityResult {
  lineItemsWithHs: number;
  corpusHsDetected: number;
  hsAggregationRows: number;
  traceabilityRows: number;
  flags: Record<string, boolean | string>;
  issues: AuditIssue[];
  failed: boolean;
}

function countLineItemsWithHs(invoice: NormalizedInvoice): number {
  return (invoice.items ?? []).filter((item) => normalizeHsToken(item.hs_code) != null).length;
}

function countCorpusHs(invoice: NormalizedInvoice): number {
  const corpus = buildInvoiceTextCorpus(invoice);
  return extractGenericHsCodes(corpus).length;
}

/** @deprecated Use countOcrSourcePositions from position-count-reconciliation. */
export function countCorpusPositionLines(corpus: string): number {
  return countOcrSourcePositions(corpus);
}

/** Emit structured forensic trace when integrity validation fails. */
export function logExtractionIntegrityForensic(
  invoice: NormalizedInvoice,
  result: ExtractionIntegrityResult,
  fileName?: string
): void {
  if (!result.failed) return;

  const corpus = buildInvoiceTextCorpus(invoice);
  const lineItemCount = invoice.items?.length ?? 0;
  const reconciliation = reconcilePositionCounts(corpus, invoice.items, lineItemCount);
  const corpusPositionLines = reconciliation.ocrPositionCount;
  const visibleHsLabels = corpusContainsVisibleHsLabels(corpus);
  const extractedHsCount = Math.max(
    countLineItemsWithHs(invoice),
    extractHsCodes(invoice).length
  );

  if (result.flags[HS_EXTRACTION_FAILURE]) {
    console.warn("[EXPORT-AUDITOR-FORENSIC] HS_EXTRACTION_FAILURE", {
      fileName: fileName ?? invoice.invoice_number ?? "—",
      visibleHsLabels,
      extractedHsCount,
      lineItemCount,
      corpusHsDetected: countCorpusHs(invoice),
      corpusPreview: corpus.slice(0, 600),
    });
  }

  if (result.flags[EXTRACTION_LINE_COUNT_MISMATCH]) {
    const reconciliation = reconcilePositionCounts(corpus, invoice.items);
    console.warn("[EXPORT-AUDITOR-FORENSIC] EXTRACTION_LINE_COUNT_MISMATCH", {
      fileName: fileName ?? invoice.invoice_number ?? "—",
      lineItemCount,
      ocrPositionCount: reconciliation.ocrPositionCount,
      traceabilityRows: reconciliation.traceabilityRowCount,
      mismatchPct: Math.round(reconciliation.mismatchRatio * 100),
      thresholdPct: Math.round(POSITION_COUNT_MISMATCH_THRESHOLD * 100),
      signals: reconciliation.signals,
      parserItems: (invoice.items ?? []).slice(0, 5).map((item) => ({
        position: item.position_number ?? null,
        description: item.description?.slice(0, 50),
        hs: item.hs_code ?? null,
      })),
    });
  }
}

export function validateCustomsExtractionIntegrity(
  invoice: NormalizedInvoice,
  options?: { invoiceTotalValue?: number }
): ExtractionIntegrityResult {
  const lineItemsWithHs = countLineItemsWithHs(invoice);
  const corpusHsDetected = countCorpusHs(invoice);
  const hsCodesOnDocument = extractHsCodes(invoice).length;
  const hasHsSignal = lineItemsWithHs > 0 || corpusHsDetected > 0 || hsCodesOnDocument > 0;

  const invoiceTotal = options?.invoiceTotalValue ?? resolveInvoiceValue(invoice);
  const aggregation = runHsAggregationEngine(invoice, { invoiceTotalValue: invoiceTotal });
  const hsAggregationRows = aggregation.hs_aggregation.length;

  const normalized = normalizeAggregationItems(invoice);
  const goodsLines = filterGoodsLines(normalized);
  const traceabilityRows = buildPositionTraceability(invoice).length;
  const lineItemCount = invoice.items?.length ?? 0;
  const corpus = buildInvoiceTextCorpus(invoice);
  const reconciliation = reconcilePositionCounts(corpus, invoice.items, traceabilityRows, invoice);

  const issues: AuditIssue[] = [];
  const flags: Record<string, boolean | string> = {};

  if (reconciliation.mismatch) {
    flags[EXTRACTION_LINE_COUNT_MISMATCH] = true;
    issues.push({
      id: EXTRACTION_LINE_COUNT_MISMATCH,
      type: "warning",
      message: EXTRACTION_LINE_COUNT_MISMATCH_MESSAGE,
      field: EXTRACTION_LINE_COUNT_MISMATCH,
    });
  }

  const visibleHsLabels = corpusContainsVisibleHsLabels(corpus);
  const extractedHsCount = Math.max(lineItemsWithHs, hsCodesOnDocument);
  if (visibleHsLabels && extractedHsCount === 0 && lineItemCount > 0) {
    flags[HS_EXTRACTION_FAILURE] = true;
    flags[EXTRACTION_INTEGRITY_ERROR] = true;
    issues.push({
      id: HS_EXTRACTION_FAILURE,
      type: "error",
      message: HS_EXTRACTION_FAILURE_MESSAGE,
      field: HS_EXTRACTION_FAILURE,
    });
  }

  if (hasHsSignal && hsAggregationRows === 0 && goodsLines.some((line) => line.hs_code.length > 0)) {
    flags[HS_AGGREGATION_MISSING] = true;
    flags[EXTRACTION_INTEGRITY_ERROR] = true;
    issues.push({
      id: HS_AGGREGATION_MISSING,
      type: "error",
      message: HS_AGGREGATION_MISSING_MESSAGE,
      field: HS_AGGREGATION_MISSING,
    });
  } else if (hasHsSignal && lineItemsWithHs > 0 && hsAggregationRows === 0) {
    flags[HS_AGGREGATION_MISSING] = true;
    flags[EXTRACTION_INTEGRITY_ERROR] = true;
    issues.push({
      id: HS_AGGREGATION_MISSING,
      type: "error",
      message: HS_AGGREGATION_MISSING_MESSAGE,
      field: HS_AGGREGATION_MISSING,
    });
  }

  if (lineItemCount > 0 && traceabilityRows === 0) {
    flags[TRACEABILITY_MISSING] = true;
    flags[EXTRACTION_INTEGRITY_ERROR] = true;
    issues.push({
      id: TRACEABILITY_MISSING,
      type: "error",
      message: TRACEABILITY_MISSING_MESSAGE,
      field: TRACEABILITY_MISSING,
    });
  }

  const duplicateLinesRemoved = Number(invoice.document_flags?.duplicate_lines_removed ?? 0);
  const sourceCommercialLines = estimateSourceCommercialLineCount(invoice);
  const deduplicationResolved = Boolean(invoice.document_flags?.commercial_lines_deduplicated);
  const lineCountOverflow =
    sourceCommercialLines > 0 &&
    lineItemCount > sourceCommercialLines * (1 + LINE_COUNT_OVERFLOW_THRESHOLD);

  if (lineCountOverflow && !(deduplicationResolved && lineItemCount <= sourceCommercialLines * (1 + LINE_COUNT_OVERFLOW_THRESHOLD))) {
    flags[DUPLICATE_LINE_EXTRACTION] = true;
    issues.push({
      id: DUPLICATE_LINE_EXTRACTION,
      type: "warning",
      message: `${DUPLICATE_LINE_OVERFLOW_MESSAGE} (${lineItemCount} extracted vs ${sourceCommercialLines} source)`,
      field: DUPLICATE_LINE_EXTRACTION,
    });
  }

  const positionCert = runPositionCertification(invoice);
  for (const mismatch of positionCert.issues) {
    flags[mismatch.code] = true;
    issues.push({
      id: mismatch.code,
      type: "error",
      message: mismatch.message,
      field: mismatch.code,
    });
  }

  if (Number(invoice.document_flags?.position_overwrite_attempts ?? 0) > 0) {
    flags[POSITION_DATA_OVERWRITE_ATTEMPT] = true;
    issues.push({
      id: POSITION_DATA_OVERWRITE_ATTEMPT,
      type: "error",
      message: `Locked position commercial fields overwrite attempted (${invoice.document_flags?.position_overwrite_attempts} attempt(s))`,
      field: POSITION_DATA_OVERWRITE_ATTEMPT,
    });
  }

  const failed = issues.length > 0;

  return {
    lineItemsWithHs,
    corpusHsDetected,
    hsAggregationRows,
    traceabilityRows,
    flags,
    issues,
    failed,
  };
}
