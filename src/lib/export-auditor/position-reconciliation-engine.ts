/**
 * Source-to-report position reconciliation, sequence chain, and aggregation traceability.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractStyleCodeFromItem } from "@/lib/export-auditor/commercial-line-deduplication";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import { runHsAggregationEngine } from "@/lib/export-auditor/hs-aggregation-engine";
import { parseApparelStyleRows } from "@/lib/export-auditor/line-value-recovery-engine";
import { parseLocaleNumber, resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import type { ExportAuditReport, HsAggregationRow } from "@/lib/export-auditor/types";

export const POSITION_QTY_MISMATCH = "POSITION_QTY_MISMATCH";
export const POSITION_UNIT_PRICE_MISMATCH = "POSITION_UNIT_PRICE_MISMATCH";
export const POSITION_VALUE_MISMATCH = "POSITION_VALUE_MISMATCH";
export const DUPLICATE_POSITION_NUMBER = "DUPLICATE_POSITION_NUMBER";
export const MISSING_POSITION_NUMBER = "MISSING_POSITION_NUMBER";
export const POSITION_SEQUENCE_BREAK = "POSITION_SEQUENCE_BREAK";
export const AGGREGATION_TRACEABILITY_FAILURE = "AGGREGATION_TRACEABILITY_FAILURE";

export const PRICE_TOLERANCE = 0.01;

export interface SourceCommercialLine {
  position: number;
  styleCode: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PositionReconciliationRow {
  sourcePosition: number;
  extractedPosition: number;
  styleCode: string;
  sourceQty: number;
  extractedQty: number;
  sourceUnitPrice: number;
  extractedUnitPrice: number;
  sourceLineTotal: number;
  extractedLineTotal: number;
  qtyMismatch: boolean;
  unitPriceMismatch: boolean;
  valueMismatch: boolean;
}

export interface PositionMismatchIssue {
  code:
    | typeof POSITION_QTY_MISMATCH
    | typeof POSITION_UNIT_PRICE_MISMATCH
    | typeof POSITION_VALUE_MISMATCH
    | typeof DUPLICATE_POSITION_NUMBER
    | typeof MISSING_POSITION_NUMBER
    | typeof POSITION_SEQUENCE_BREAK
    | typeof AGGREGATION_TRACEABILITY_FAILURE;
  position?: number;
  message: string;
}

export interface PositionReconciliationResult {
  sourceLines: SourceCommercialLine[];
  rows: PositionReconciliationRow[];
  issues: PositionMismatchIssue[];
  passed: boolean;
}

function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  return parseLocaleNumber(String(raw).trim()) ?? 0;
}

function amountsDiffer(a: number, b: number, tolerance = PRICE_TOLERANCE): boolean {
  return Math.abs(a - b) > tolerance;
}

function qtyDiffers(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.001;
}

function resolvePdfCorpus(invoice: NormalizedInvoice): string {
  const pdf =
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text.trim()
      : "";
  return pdf || buildInvoiceTextCorpus(invoice);
}

/** Build authoritative source commercial lines from PDF (generic apparel qty-first rows). */
export function buildSourceCommercialLines(invoice: NormalizedInvoice): SourceCommercialLine[] {
  const corpus = resolvePdfCorpus(invoice);
  const apparelRows = parseApparelStyleRows(corpus);
  if (apparelRows.length > 0) {
    return apparelRows.map((row, index) => ({
      position: index + 1,
      styleCode: row.styleCode,
      quantity: row.quantity,
      unitPrice: row.unitPrice ?? (row.quantity > 0 ? row.lineTotal / row.quantity : 0),
      lineTotal: row.lineTotal,
    }));
  }

  return [];
}

function extractedLineForSource(
  items: ApiInvoiceItem[],
  source: SourceCommercialLine,
  position: number
): ApiInvoiceItem | undefined {
  if (items.length >= position) {
    const byIndex = items[position - 1];
    if (byIndex && extractStyleCodeFromItem(byIndex) === source.styleCode) {
      return byIndex;
    }
  }

  const byStyle = items.find((item) => extractStyleCodeFromItem(item) === source.styleCode);
  if (byStyle) return byStyle;

  return items.find((item, index) => {
    const pos =
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1;
    return pos === position;
  });
}

/** Compare source PDF lines to extracted report lines (style-first, then position). */
export function reconcileSourceToReport(invoice: NormalizedInvoice): PositionReconciliationResult {
  const sourceLines = buildSourceCommercialLines(invoice);
  const items = invoice.items ?? [];
  const rows: PositionReconciliationRow[] = [];
  const issues: PositionMismatchIssue[] = [];

  if (sourceLines.length === 0 || items.length === 0) {
    const sequenceIssues = validatePositionSequence(items);
    return {
      sourceLines,
      rows,
      issues: sequenceIssues,
      passed: sequenceIssues.length === 0,
    };
  }

  for (const source of sourceLines) {
    const extracted = extractedLineForSource(items, source, source.position);
    const extractedPosition =
      extracted != null
        ? typeof extracted.position_number === "number" && extracted.position_number > 0
          ? extracted.position_number
          : items.indexOf(extracted) + 1
        : source.position;

    const extractedQty = parseNum(extracted?.quantity);
    const extractedUnit = parseNum(extracted?.unit_price);
    const extractedTotal = parseNum(extracted?.line_total);

    const qtyMismatch = qtyDiffers(source.quantity, extractedQty);
    const unitPriceMismatch = amountsDiffer(source.unitPrice, extractedUnit);
    const valueMismatch = amountsDiffer(source.lineTotal, extractedTotal);

    rows.push({
      sourcePosition: source.position,
      extractedPosition,
      styleCode: source.styleCode,
      sourceQty: source.quantity,
      extractedQty,
      sourceUnitPrice: source.unitPrice,
      extractedUnitPrice: extractedUnit,
      sourceLineTotal: source.lineTotal,
      extractedLineTotal: extractedTotal,
      qtyMismatch,
      unitPriceMismatch,
      valueMismatch,
    });

    if (qtyMismatch) {
      issues.push({
        code: POSITION_QTY_MISMATCH,
        position: source.position,
        message: `Position ${source.position} (${source.styleCode}) qty ${extractedQty} != source ${source.quantity}`,
      });
    }
    if (unitPriceMismatch) {
      issues.push({
        code: POSITION_UNIT_PRICE_MISMATCH,
        position: source.position,
        message: `Position ${source.position} (${source.styleCode}) unit price ${extractedUnit.toFixed(2)} != source ${source.unitPrice.toFixed(2)}`,
      });
    }
    if (valueMismatch) {
      issues.push({
        code: POSITION_VALUE_MISMATCH,
        position: source.position,
        message: `Position ${source.position} (${source.styleCode}) line total ${extractedTotal.toFixed(2)} != source ${source.lineTotal.toFixed(2)}`,
      });
    }
  }

  issues.push(...validatePositionSequence(items));

  return {
    sourceLines,
    rows,
    issues,
    passed: issues.length === 0,
  };
}

/** Validate ordered position chain — duplicates, gaps, breaks. */
export function validatePositionSequence(items: ApiInvoiceItem[]): PositionMismatchIssue[] {
  const issues: PositionMismatchIssue[] = [];
  if (items.length === 0) return issues;

  const positions = items.map((item, index) =>
    typeof item.position_number === "number" && item.position_number > 0
      ? item.position_number
      : index + 1
  );

  const seen = new Set<number>();
  for (const position of positions) {
    if (seen.has(position)) {
      issues.push({
        code: DUPLICATE_POSITION_NUMBER,
        position,
        message: `Duplicate position number ${position}`,
      });
    }
    seen.add(position);
  }

  const sorted = [...positions].sort((a, b) => a - b);
  const expectedCount = sorted[sorted.length - 1] ?? items.length;

  for (let expected = 1; expected <= expectedCount; expected += 1) {
    if (!sorted.includes(expected)) {
      issues.push({
        code: MISSING_POSITION_NUMBER,
        position: expected,
        message: `Missing position number ${expected}`,
      });
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1]!;
    const curr = sorted[index]!;
    if (curr - prev > 1) {
      issues.push({
        code: POSITION_SEQUENCE_BREAK,
        position: curr,
        message: `Position sequence break between ${prev} and ${curr}`,
      });
    }
  }

  return issues;
}

/** Ensure aggregation sums match line sums and source positions exist. */
export function validateAggregationTraceability(
  invoice: NormalizedInvoice,
  aggregationRows?: HsAggregationRow[]
): PositionMismatchIssue[] {
  const issues: PositionMismatchIssue[] = [];
  const items = invoice.items ?? [];
  if (items.length === 0) return issues;

  const linesWithValue = items.filter((item) => parseNum(item.line_total) > 0);
  const linesWithHs = items.filter((item) => item.hs_code?.trim());
  if (linesWithHs.length === 0) return issues;

  const lineSum = items.reduce((sum, item) => sum + parseNum(item.line_total), 0);
  const rows =
    aggregationRows ??
    runHsAggregationEngine(invoice, {
      invoiceTotalValue: resolveInvoiceValue(invoice),
    }).hs_aggregation.map((row) => ({
      hsCode: row.hs_code,
      totalValue: row.total_value,
      sourcePositions: row.source_positions,
    }));

  const aggSum = rows.reduce((sum, row) => sum + parseNum(row.totalValue), 0);
  if (amountsDiffer(lineSum, aggSum, 0.02)) {
    issues.push({
      code: AGGREGATION_TRACEABILITY_FAILURE,
      message: `Aggregation value sum ${aggSum.toFixed(2)} != position sum ${lineSum.toFixed(2)}`,
    });
  }

  const validPositions = new Set(
    items.map((item, index) =>
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1
    )
  );

  for (const row of rows) {
    for (const position of row.sourcePositions ?? []) {
      if (!validPositions.has(position)) {
        issues.push({
          code: AGGREGATION_TRACEABILITY_FAILURE,
          position,
          message: `Aggregation references missing position ${position} (HS ${row.hsCode})`,
        });
      }
    }
  }

  return issues;
}

/** Full position certification gate for golden pass. */
export function runPositionCertification(
  invoice: NormalizedInvoice,
  report?: ExportAuditReport
): PositionReconciliationResult & { aggregationIssues: PositionMismatchIssue[] } {
  const reconciliation = reconcileSourceToReport(invoice);
  const aggregationIssues = validateAggregationTraceability(
    invoice,
    report?.hsAggregationReport?.hsAggregation
  );

  return {
    ...reconciliation,
    aggregationIssues,
    issues: [...reconciliation.issues, ...aggregationIssues],
    passed: reconciliation.issues.length === 0 && aggregationIssues.length === 0,
  };
}
