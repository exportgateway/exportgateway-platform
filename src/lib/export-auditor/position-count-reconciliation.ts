/**
 * Position count reconciliation — compare OCR commercial line signals with FINAL item count.
 * Does not compare intermediate parser/recovery states.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { parseApparelStyleRows } from "@/lib/export-auditor/line-value-recovery-engine";

export const POSITION_COUNT_MISMATCH_THRESHOLD = 0.05;

const STYLE_CODE = /\b([12][A-Z]{2}[A-Z0-9]{8,})\b/gi;
const HS_LABELED_ROW = /HS\s*Code\s*[-–]\s*\d{8,10}/gi;
const POSITION_LED = /^\s*(\d{1,3})\s+(?=[A-Za-z])/;
const DEXXON_SUFFIX = /\t\.\t(\d{1,3})\s*$/gm;
const ITEM_NR_SPACE_HEADER =
  /\bItem\s+Nr\.?\s+Item\s+Description\s+UM\*?\s+Q\.?ty\s+Price\s+Amount\s+Discount\b/i;
const ITEM_NR_SPACE_ROW =
  /^\s*[A-Z][A-Z0-9./-]{2,}\s+.+?\b(?:Customs\s+Tariff|HS\s*Code|MADE\s+IN|PCS|PK)\b.+/i;

export function countDistinctStyleCodes(corpus: string): number {
  const codes = new Set<string>();
  STYLE_CODE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STYLE_CODE.exec(corpus)) !== null) {
    codes.add(match[1].toUpperCase());
  }
  return codes.size;
}

function countHsLabeledRows(corpus: string): number {
  return [...corpus.matchAll(HS_LABELED_ROW)].length;
}

function countPositionLedRows(corpus: string): number {
  const seen = new Set<number>();
  for (const raw of corpus.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(?:Total|Subtotal|VAT|Amount|Payment|Due|QR|Scan)/i.test(line)) continue;
    const match = line.match(POSITION_LED);
    if (!match) continue;
    const position = parseInt(match[1], 10);
    if (Number.isFinite(position) && position > 0 && position <= 999) {
      seen.add(position);
    }
  }
  return seen.size;
}

function countDexxonSuffixPositions(corpus: string): number {
  const seen = new Set<number>();
  DEXXON_SUFFIX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DEXXON_SUFFIX.exec(corpus)) !== null) {
    const position = parseInt(match[1], 10);
    if (Number.isFinite(position) && position > 0 && position <= 999) {
      seen.add(position);
    }
  }
  return seen.size;
}

function countItemNrSpaceRows(corpus: string): number {
  if (!ITEM_NR_SPACE_HEADER.test(corpus)) return 0;
  const seen = new Set<string>();
  for (const raw of corpus.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || ITEM_NR_SPACE_HEADER.test(line)) continue;
    if (ITEM_NR_SPACE_ROW.test(line)) {
      seen.add(line.replace(/\s+/g, " ").toUpperCase());
    }
  }
  return seen.size;
}

export interface PositionCountReconciliation {
  ocrPositionCount: number;
  finalPositionCount: number;
  traceabilityRowCount: number | null;
  mismatchRatio: number;
  mismatch: boolean;
  signals: {
    styleCodes: number;
    hsLabeledRows: number;
    positionLedRows: number;
    dexxonSuffixRows: number;
    itemNrSpaceRows: number;
  };
}

function resolveSourceCorpus(corpus: string, invoice?: NormalizedInvoice): string {
  const pdf =
    invoice &&
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text.trim()
      : "";
  return pdf || corpus;
}

/** Count OCR commercial positions — prefer PDF apparel row count when available. */
export function countOcrSourcePositions(
  corpus: string,
  finalHint?: number,
  invoice?: NormalizedInvoice
): number {
  const sourceCorpus = resolveSourceCorpus(corpus, invoice);
  const apparelRows = parseApparelStyleRows(sourceCorpus).length;
  if (apparelRows > 0) {
    if (finalHint != null && finalHint > 0 && Math.abs(apparelRows - finalHint) <= 1) {
      return finalHint;
    }
    return apparelRows;
  }

  const styleCodes = countDistinctStyleCodes(sourceCorpus);
  const hsLabeled = countHsLabeledRows(sourceCorpus);
  const positionLed = countPositionLedRows(sourceCorpus);
  const dexxonSuffix = countDexxonSuffixPositions(sourceCorpus);
  const itemNrSpaceRows = countItemNrSpaceRows(sourceCorpus);

  const signals = [itemNrSpaceRows, styleCodes, hsLabeled, positionLed, dexxonSuffix].filter((n) => n > 0);
  if (signals.length === 0) return 0;

  if (finalHint != null && finalHint > 0) {
    const closest = signals.reduce((best, candidate) =>
      Math.abs(candidate - finalHint) < Math.abs(best - finalHint) ? candidate : best
    );
    if (Math.abs(closest - finalHint) <= 1) {
      return finalHint;
    }
    return closest;
  }

  return Math.min(...signals);
}

export function reconcilePositionCounts(
  corpus: string,
  finalItems: ApiInvoiceItem[] | undefined,
  traceabilityRowCount?: number | null,
  invoice?: NormalizedInvoice
): PositionCountReconciliation {
  const finalPositionCount = finalItems?.length ?? 0;
  const sourceCorpus = resolveSourceCorpus(corpus, invoice);
  const apparelRows = parseApparelStyleRows(sourceCorpus).length;
  const styleCodes = countDistinctStyleCodes(sourceCorpus);
  const hsLabeledRows = countHsLabeledRows(corpus);
  const positionLedRows = countPositionLedRows(sourceCorpus);
  const dexxonSuffixRows = countDexxonSuffixPositions(sourceCorpus);
  const itemNrSpaceRows = countItemNrSpaceRows(sourceCorpus);

  const ocrPositionCount = countOcrSourcePositions(
    corpus,
    finalPositionCount || undefined,
    invoice
  );

  const referenceCount = Math.max(finalPositionCount, ocrPositionCount, 1);
  const mismatchRatio =
    finalPositionCount > 0 && ocrPositionCount > 0
      ? Math.abs(ocrPositionCount - finalPositionCount) / referenceCount
      : 0;

  const countAligned =
    apparelRows > 0
      ? finalPositionCount === apparelRows
      : finalPositionCount > 0 &&
        ocrPositionCount > 0 &&
        mismatchRatio <= POSITION_COUNT_MISMATCH_THRESHOLD;

  return {
    ocrPositionCount,
    finalPositionCount,
    traceabilityRowCount: traceabilityRowCount ?? null,
    mismatchRatio,
    mismatch:
      finalPositionCount > 0 &&
      ocrPositionCount > 0 &&
      !countAligned &&
      mismatchRatio > POSITION_COUNT_MISMATCH_THRESHOLD,
    signals: {
      styleCodes,
      hsLabeledRows,
      positionLedRows,
      dexxonSuffixRows,
      itemNrSpaceRows,
    },
  };
}
