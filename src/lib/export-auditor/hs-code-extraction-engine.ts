/**
 * Generic HS / tariff code extraction — layout-agnostic patterns for invoice OCR and PDF text.
 */

import { normalizeAndValidateHsToken, normalizeHsToken } from "@/lib/export-auditor/hs-code-normalize";
import { extractHsByPositionBlock } from "@/lib/export-auditor/position-block-extraction";

export interface HsExtractionHit {
  value: string;
  source: "structured_ocr" | "pdf_text" | "table_reconstruction" | "regex_fallback";
  confidence: number;
  position?: number;
  raw?: string;
}

const HS_LABEL =
  /\b(?:HS(?:\s+code|\s*Code|\s*code)?|TARIC|CN(?:\s+code|\s*code)?|Commodity(?:\s+code|\s*Code)?|Commoditycode|Customs\s+Tariff|Nomenclature|Tariff(?:\s+code|\s*Code)?)\s*[:\-]?\s*([\d][\d.\s]{5,16}\d)\b/gi;

/** Dotted / spaced tariff tokens: 8523.51.10, 8523 51 10 */
const HS_FORMATTED = /\b(\d{4})[.\s](\d{2})[.\s](\d{2})\b/g;

/** Tabular row: position HS unit … */
const TABULAR_HS_ROW = /^\s*(\d{1,3})\s+(\d{8,12})\s+[A-Za-z]\s+/gm;

/** Position-led goods row with embedded 8–10 digit code */
const POSITION_HS_LINE = /^\s*(?:pos(?:ition)?\s*)?(\d{1,3})\b(.*)$/i;

/** OCR-corrupted HS tokens mixing digits and confusable letters. */
const MIXED_OCR_HS = /\b([0-9][0-9A-Za-z]{5,11})\b/g;

function addHit(
  hits: HsExtractionHit[],
  seen: Set<string>,
  raw: string,
  source: HsExtractionHit["source"],
  confidence: number,
  position?: number
): void {
  const result = normalizeAndValidateHsToken(raw);
  if (!result.normalized || result.invalid) return;
  const value = result.normalized;
  const key = position != null ? `${position}:${value}` : value;
  if (seen.has(key)) return;
  seen.add(key);
  hits.push({
    value,
    source,
    confidence: result.repaired ? Math.min(confidence, 0.88) : confidence,
    position,
    raw,
  });
}

function extractLabeledHits(corpus: string, source: HsExtractionHit["source"]): HsExtractionHit[] {
  const hits: HsExtractionHit[] = [];
  const seen = new Set<string>();
  HS_LABEL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HS_LABEL.exec(corpus)) !== null) {
    addHit(hits, seen, match[1], source, 0.92);
  }
  return hits;
}

function extractFormattedHits(corpus: string, source: HsExtractionHit["source"]): HsExtractionHit[] {
  const hits: HsExtractionHit[] = [];
  const seen = new Set<string>();
  HS_FORMATTED.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HS_FORMATTED.exec(corpus)) !== null) {
    addHit(hits, seen, `${match[1]}${match[2]}${match[3]}`, source, 0.9);
  }
  return hits;
}

function extractTabularHits(corpus: string): HsExtractionHit[] {
  const hits: HsExtractionHit[] = [];
  const seen = new Set<string>();
  TABULAR_HS_ROW.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TABULAR_HS_ROW.exec(corpus)) !== null) {
    const position = parseInt(match[1], 10);
    addHit(hits, seen, match[2], "table_reconstruction", 0.97, position);
  }
  return hits;
}

function extractPositionRowHits(corpus: string): HsExtractionHit[] {
  const hits: HsExtractionHit[] = [];
  const seen = new Set<string>();
  const hsInSegment = /\b(\d{4}[.\s]?\d{2}[.\s]?\d{2}|\d{8,10})\b/;

  for (const line of corpus.split(/\r?\n/)) {
    const match = line.match(POSITION_HS_LINE);
    if (!match) continue;
    const position = parseInt(match[1], 10);
    if (!Number.isFinite(position) || position <= 0 || position > 999) continue;
    const hsMatch = match[2].match(hsInSegment);
    if (!hsMatch) continue;
    addHit(hits, seen, hsMatch[1], "regex_fallback", 0.85, position);
  }

  return hits;
}

function isLikelyNonHsToken(raw: string, corpus: string, index: number): boolean {
  const before = corpus.slice(Math.max(0, index - 12), index);
  if (/\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(before + raw)) return true;
  if (/\binvoice\s*(?:no|number)?\s*[:\-]?\s*$/i.test(before)) return true;
  if (/\b(?:tel|phone|fax|vat|eori|iban)\b/i.test(before)) return true;
  const value = normalizeHsToken(raw);
  if (!value) return true;
  if (value.length === 8 && /^20[0-9]{6}$/.test(value)) return true;
  return false;
}

function extractStandaloneHits(corpus: string): HsExtractionHit[] {
  const hits: HsExtractionHit[] = [];
  const seen = new Set<string>();

  for (const pattern of [/\b(\d{8,10})\b/g, MIXED_OCR_HS]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(corpus)) !== null) {
      if (pattern.source.startsWith("\\b(\\d") && isLikelyNonHsToken(match[1], corpus, match.index)) {
        continue;
      }
      addHit(hits, seen, match[1], "regex_fallback", 0.7);
    }
  }

  return hits;
}

/** Extract all HS hits from document corpus with source and confidence. */
export function extractHsHitsFromCorpus(
  corpus: string,
  options?: { source?: HsExtractionHit["source"] }
): HsExtractionHit[] {
  const text = corpus?.trim();
  if (!text) return [];

  const defaultSource = options?.source ?? "regex_fallback";
  const hits: HsExtractionHit[] = [
    ...extractTabularHits(text),
    ...extractLabeledHits(text, defaultSource),
    ...extractFormattedHits(text, defaultSource),
    ...extractPositionRowHits(text),
    ...extractStandaloneHits(text),
  ];

  const byConfidence = new Map<string, HsExtractionHit>();
  for (const hit of hits) {
    const key = hit.position != null ? `${hit.position}:${hit.value}` : hit.value;
    const existing = byConfidence.get(key);
    if (!existing || hit.confidence > existing.confidence) {
      byConfidence.set(key, hit);
    }
  }
  return [...byConfidence.values()];
}

/** Unique normalized HS codes from corpus. */
export function extractGenericHsCodes(corpus: string): string[] {
  const codes = new Set<string>();
  for (const hit of extractHsHitsFromCorpus(corpus)) {
    codes.add(hit.value);
  }
  return [...codes].sort();
}

/** Map line position numbers to HS codes. */
export function extractHsByPosition(corpus: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const hit of extractHsHitsFromCorpus(corpus)) {
    if (hit.position == null) continue;
    const existing = map.get(hit.position);
    if (!existing || hit.confidence >= 0.85) {
      map.set(hit.position, hit.value);
    }
  }
  for (const [position, hs] of extractHsByPositionBlock(corpus)) {
    if (!map.has(position)) {
      map.set(position, hs);
    }
  }
  return map;
}

/** Header-level single HS when every goods line shares one code. */
export function extractDocumentLevelHs(corpus: string): string | null {
  const codes = extractGenericHsCodes(corpus);
  if (codes.length === 1) return codes[0] ?? null;
  return null;
}
