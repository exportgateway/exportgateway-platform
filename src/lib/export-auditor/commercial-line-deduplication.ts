/**
 * Global duplicate commercial line protection — dedupe across OCR, PDF text, and table recovery.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import { parseApparelStyleRows } from "@/lib/export-auditor/line-value-recovery-engine";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";
import {
  countDistinctStyleCodes,
  countOcrSourcePositions,
} from "@/lib/export-auditor/position-count-reconciliation";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";
import {
  areIdenticalCommercialLines,
  dedupeByExactIdentity,
  identityBlocksMatch,
} from "@/lib/export-auditor/position-identity-lock";

export const DUPLICATE_LINE_EXTRACTION = "DUPLICATE_LINE_EXTRACTION";
export const DUPLICATE_LINE_EXTRACTION_MESSAGE =
  "Duplicate commercial line items detected during extraction (same style, HS, qty, and value)";

export const LINE_COUNT_OVERFLOW_THRESHOLD = 0.1;
export const DESCRIPTION_SIMILARITY_THRESHOLD = 0.95;
export const GOLDEN_TOTAL_TOLERANCE = 0.01;
export const GOLDEN_UNIT_TOLERANCE = 0.01;
export const GOLDEN_DUPLICATE_RATIO_TOLERANCE = 0.1;

const STYLE_CODE_RE = /\b([12][A-Z]{2}[A-Z0-9]{8,})\b/i;

export interface CommercialLineDedupResult {
  invoice: NormalizedInvoice;
  beforeCount: number;
  afterCount: number;
  removedCount: number;
  duplicateRatio: number;
  sourceCommercialLineCount: number;
  lineCountOverflow: boolean;
  deduplicated: boolean;
}

function parsePositive(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;
  const parsed = parseLocaleNumber(String(raw).trim());
  return parsed != null && parsed > 0 ? parsed : 0;
}

export function extractStyleCodeFromItem(item: ApiInvoiceItem): string {
  const fromCode = item.item_code?.trim();
  if (fromCode && STYLE_CODE_RE.test(fromCode)) {
    return fromCode.toUpperCase();
  }
  const match = (item.description?.trim() ?? "").match(STYLE_CODE_RE);
  return match?.[1]?.toUpperCase() ?? "";
}

function normalizeDescription(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Bigram Dice coefficient — 0..1 similarity. */
export function descriptionSimilarity(a: string, b: string): number {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (!na || !nb) return na === nb ? 1 : 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.98;

  const bigrams = (value: string): Set<string> => {
    const set = new Set<string>();
    for (let index = 0; index < value.length - 1; index += 1) {
      set.add(value.slice(index, index + 2));
    }
    return set;
  };

  const aBig = bigrams(na);
  const bBig = bigrams(nb);
  let intersection = 0;
  for (const bigram of aBig) {
    if (bBig.has(bigram)) intersection += 1;
  }
  return (2 * intersection) / (aBig.size + bBig.size);
}

function hsCodesCompatible(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const ha = normalizeHsToken(a);
  const hb = normalizeHsToken(b);
  if (!ha || !hb) return true;
  return ha === hb;
}

function amountsMatch(a: number, b: number): boolean {
  if (a <= 0 && b <= 0) return true;
  return Math.abs(a - b) < 0.015;
}

function quantitiesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

/** True when two rows represent the same commercial line (exact identity fingerprint). */
export function areCommercialLinesDuplicate(a: ApiInvoiceItem, b: ApiInvoiceItem): boolean {
  return areIdenticalCommercialLines(a, b);
}

/** Pipeline triplication — same style/qty/value/HS regardless of position renumbering. */
export function arePipelineTriplicatedLines(a: ApiInvoiceItem, b: ApiInvoiceItem): boolean {
  const qtyA = parsePositive(a.quantity);
  const qtyB = parsePositive(b.quantity);
  const valA = parsePositive(a.line_total);
  const valB = parsePositive(b.line_total);

  if (!quantitiesMatch(qtyA, qtyB)) return false;
  if (!amountsMatch(valA, valB)) return false;
  if (!hsCodesCompatible(a.hs_code, b.hs_code)) return false;

  const styleA = extractStyleCodeFromItem(a);
  const styleB = extractStyleCodeFromItem(b);
  if (styleA && styleB) return styleA === styleB;

  const descA = a.description?.trim() ?? "";
  const descB = b.description?.trim() ?? "";
  if (!descA || !descB) return false;
  return descriptionSimilarity(descA, descB) >= DESCRIPTION_SIMILARITY_THRESHOLD;
}

function areExactLineDuplicates(a: ApiInvoiceItem, b: ApiInvoiceItem): boolean {
  const descA = a.description?.trim() ?? "";
  const descB = b.description?.trim() ?? "";
  if (!descA || !descB) return false;
  if (normalizeDescription(descA) !== normalizeDescription(descB)) return false;
  return (
    quantitiesMatch(parsePositive(a.quantity), parsePositive(b.quantity)) &&
    amountsMatch(parsePositive(a.line_total), parsePositive(b.line_total))
  );
}

function itemBlockFingerprint(item: ApiInvoiceItem): string {
  const style = extractStyleCodeFromItem(item);
  const hs = normalizeHsToken(item.hs_code) ?? "";
  const qty = parsePositive(item.quantity).toFixed(3);
  const val = parsePositive(item.line_total).toFixed(2);
  const desc = normalizeDescription(item.description ?? "").slice(0, 80);
  return `${style}|${hs}|${qty}|${val}|${desc}`;
}

function blocksMatch(a: ApiInvoiceItem[], b: ApiInvoiceItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, index) => itemBlockFingerprint(item) === itemBlockFingerprint(b[index]!)
  );
}

function tryCollapseRepeatedBlocks(
  items: ApiInvoiceItem[],
  sourceCount: number
): ApiInvoiceItem[] | null {
  return collapseRepeatedPipelineBlocks(items, sourceCount);
}

function resolveSourceCountsForCollapse(
  invoice: NormalizedInvoice,
  items: ApiInvoiceItem[]
): number[] {
  const primary = estimateSourceCommercialLineCount(invoice);
  const pdfCorpus =
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text.trim()
      : "";
  const apparelCount = pdfCorpus ? parseApparelStyleRows(pdfCorpus).length : 0;
  const candidates = new Set<number>(
    [primary, apparelCount, countDistinctStyleCodes(pdfCorpus)].filter((n) => n > 0)
  );

  for (const sourceCount of [...candidates]) {
    if (sourceCount > 0 && items.length % sourceCount === 0 && items.length / sourceCount >= 2) {
      candidates.add(sourceCount);
    }
  }

  return [...candidates].sort((a, b) => b - a);
}

function dedupeByCommercialFingerprint(items: ApiInvoiceItem[]): {
  kept: ApiInvoiceItem[];
  removedCount: number;
} {
  return dedupeByExactIdentity(items);
}

/** Collapse N identical consecutive blocks (e.g. 23 lines repeated 3× → 23). */
function collapseRepeatedPipelineBlocks(
  items: ApiInvoiceItem[],
  sourceCount: number
): ApiInvoiceItem[] | null {
  if (sourceCount <= 0 || items.length < sourceCount * 2) return null;
  if (items.length % sourceCount !== 0) return null;

  const repeats = items.length / sourceCount;
  if (repeats < 2) return null;

  const firstBlock = items.slice(0, sourceCount);
  for (let blockIndex = 1; blockIndex < repeats; blockIndex += 1) {
    const nextBlock = items.slice(
      blockIndex * sourceCount,
      (blockIndex + 1) * sourceCount
    );
    if (!identityBlocksMatch(firstBlock, nextBlock)) return null;
  }

  return firstBlock.map((item, index) => ({
    ...item,
    position_number: index + 1,
  }));
}

/** Estimate true commercial line count from deduplicated corpus signals. */
export function estimateSourceCommercialLineCount(invoice: NormalizedInvoice): number {
  const pdfCorpus =
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text.trim()
      : "";

  if (pdfCorpus) {
    const apparelRows = parseApparelStyleRows(pdfCorpus);
    if (apparelRows.length > 0) return apparelRows.length;
    const distinctStyles = countDistinctStyleCodes(pdfCorpus);
    if (distinctStyles > 0) return distinctStyles;
  }

  const corpus = buildInvoiceTextCorpus(invoice);
  const finalHint = invoice.items?.length ?? 0;
  const apparelCount = parseApparelStyleRows(corpus).length;
  const distinctStyles = countDistinctStyleCodes(corpus);
  const ocrPositions = countOcrSourcePositions(corpus, finalHint);

  const candidates = [distinctStyles, apparelCount, ocrPositions].filter((count) => count > 0);
  if (candidates.length === 0) return finalHint;

  if (finalHint > 0) {
    const closest = candidates.reduce((best, candidate) =>
      Math.abs(candidate - finalHint) < Math.abs(best - finalHint) ? candidate : best
    );
    if (Math.abs(closest - finalHint) <= 1) return finalHint;
    return closest;
  }

  return Math.min(...candidates);
}

export function sumExtractedUnits(items: ApiInvoiceItem[] | undefined): number {
  return (items ?? []).reduce((sum, item) => sum + parsePositive(item.quantity), 0);
}

/** Parse invoice-level unit total when printed (e.g. Total Units: 129). */
export function extractInvoiceTotalUnits(invoice: NormalizedInvoice): number | null {
  const corpus = buildInvoiceTextCorpus(invoice);
  const match = corpus.match(/\bTotal\s+Units?\s*:?\s*(\d{1,6})\b/i);
  if (!match) return null;
  const units = parseInt(match[1], 10);
  return Number.isFinite(units) && units > 0 ? units : null;
}

/**
 * Remove duplicate commercial rows — keep first canonical instance per fingerprint.
 * Runs after line recovery and before HS aggregation / multi-pass enrichment.
 */
export function deduplicateCommercialLineItems(
  invoice: NormalizedInvoice
): CommercialLineDedupResult {
  const items = invoice.items ?? [];
  const beforeCount = items.length;

  if (beforeCount <= 1) {
    const sourceCommercialLineCount = estimateSourceCommercialLineCount(invoice);
    const lineCountOverflow =
      sourceCommercialLineCount > 0 &&
      beforeCount > sourceCommercialLineCount * (1 + LINE_COUNT_OVERFLOW_THRESHOLD);
    return {
      invoice,
      beforeCount,
      afterCount: beforeCount,
      removedCount: 0,
      duplicateRatio: 0,
      sourceCommercialLineCount,
      lineCountOverflow,
      deduplicated: false,
    };
  }

  const sourceCommercialLineCount = estimateSourceCommercialLineCount(invoice);

  if (
    sourceCommercialLineCount > 0 &&
    beforeCount <= sourceCommercialLineCount * (1 + LINE_COUNT_OVERFLOW_THRESHOLD)
  ) {
    return {
      invoice,
      beforeCount,
      afterCount: beforeCount,
      removedCount: 0,
      duplicateRatio: 0,
      sourceCommercialLineCount,
      lineCountOverflow: false,
      deduplicated: false,
    };
  }

  let blockCollapsed: ApiInvoiceItem[] | null = null;
  for (const sourceCount of resolveSourceCountsForCollapse(invoice, items)) {
    blockCollapsed = collapseRepeatedPipelineBlocks(items, sourceCount);
    if (blockCollapsed) break;
  }

  let removedCount = 0;
  let kept: ApiInvoiceItem[];

  if (blockCollapsed) {
    removedCount = beforeCount - blockCollapsed.length;
    kept = blockCollapsed;
  } else {
    const fingerprintResult = dedupeByCommercialFingerprint(items);
    kept = fingerprintResult.kept;
    removedCount = fingerprintResult.removedCount;
  }

  if (
    sourceCommercialLineCount > 0 &&
    kept.length < sourceCommercialLineCount &&
    beforeCount >= sourceCommercialLineCount
  ) {
    kept = items.slice(0, sourceCommercialLineCount);
    removedCount = Math.max(0, beforeCount - kept.length);
  }

  const deduplicatedItems = kept.map((item, index) => ({
    ...item,
    position_number: index + 1,
  }));

  const afterCount = deduplicatedItems.length;
  const duplicateRatio = beforeCount > 0 ? removedCount / beforeCount : 0;
  const reconciledSourceCount = estimateSourceCommercialLineCount({
    ...invoice,
    items: deduplicatedItems,
  });
  const lineCountOverflow =
    reconciledSourceCount > 0 &&
    afterCount > reconciledSourceCount * (1 + LINE_COUNT_OVERFLOW_THRESHOLD);

  if (removedCount === 0 && !lineCountOverflow) {
    return {
      invoice,
      beforeCount,
      afterCount,
      removedCount: 0,
      duplicateRatio: 0,
      sourceCommercialLineCount,
      lineCountOverflow: false,
      deduplicated: false,
    };
  }

  let enriched: NormalizedInvoice = {
    ...invoice,
    items: deduplicatedItems,
    document_flags: {
      ...invoice.document_flags,
      commercial_lines_deduplicated: removedCount > 0,
      duplicate_lines_removed: removedCount,
      duplicate_lines_before_count: beforeCount,
      source_commercial_line_count: sourceCommercialLineCount,
      ...(lineCountOverflow ? { extraction_line_count_overflow: true } : {}),
    },
  };

  if (removedCount > 0) {
    enriched = appendProvenance(enriched, {
      field: "line_items",
      value: `duplicate_dedup:removed_${removedCount}_from_${beforeCount}`,
      source: "heuristic_recovery",
    });
  }

  return {
    invoice: enriched,
    beforeCount,
    afterCount,
    removedCount,
    duplicateRatio,
    sourceCommercialLineCount,
    lineCountOverflow,
    deduplicated: removedCount > 0,
  };
}
