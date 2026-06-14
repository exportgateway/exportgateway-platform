/**
 * Generic country-of-origin extraction — layout-agnostic COO patterns.
 */

import { resolveIso2CountryCode } from "@/lib/export-auditor/country-resolution";
import { extractCooByPositionBlock } from "@/lib/export-auditor/position-block-extraction";

export interface CooExtractionHit {
  value: string;
  source: "structured_ocr" | "pdf_text" | "table_reconstruction" | "regex_fallback";
  confidence: number;
  position?: number;
  raw?: string;
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  china: "CN",
  italy: "IT",
  turkey: "TR",
  portugal: "PT",
  bulgaria: "BG",
  germany: "DE",
  slovenia: "SI",
  croatia: "HR",
  serbia: "RS",
  austria: "AT",
  france: "FR",
  spain: "ES",
  poland: "PL",
  romania: "RO",
  hungary: "HU",
  czech: "CZ",
  "czech republic": "CZ",
  slovakia: "SK",
  netherlands: "NL",
  belgium: "BE",
  greece: "GR",
  india: "IN",
  "united kingdom": "GB",
  uk: "GB",
  "united states": "US",
  usa: "US",
};

const COO_LABEL =
  /\b(?:COO|Country\s+of\s+Origin|Origin\s+Of\s+Goods|Origin\s+Country)\s*[:\-]\s*([A-Za-z]{2,32})\b/gi;

const ORIGIN_OF_GOODS =
  /\bOrigin\s+Of\s+Goods\s*[:\-]\s*([A-Za-z][A-Za-z\s]{1,24})\b/gi;

const COO_CODE = /\bCOO\s*[:\-]?\s*([A-Z]{2})\b/gi;

const MADE_IN = /\bMade\s+in\s+([A-Za-z][A-Za-z\s]{1,24})\b/gi;

const ORIGIN_DASH =
  /\bOrigin\s*[-–]\s*([A-Za-z][A-Za-z\s]{1,24})\b/gi;

const ORIGIN_COUNTRY_CODE = /\bOrigin\s+Country\s+([A-Z]{2})\b/gi;

/** Position-led invoice line — e.g. `1 Description … COO CN`. */
const POSITION_LINE_START = /^\s*(?:pos(?:ition)?\s*)?(\d{1,3})\b(.*)$/i;

export function normalizeCountryToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();

  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (COUNTRY_NAME_TO_CODE[key]) return COUNTRY_NAME_TO_CODE[key];

  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (firstWord && COUNTRY_NAME_TO_CODE[firstWord]) return COUNTRY_NAME_TO_CODE[firstWord];

  const twoWords = trimmed.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
  if (COUNTRY_NAME_TO_CODE[twoWords]) return COUNTRY_NAME_TO_CODE[twoWords];

  return null;
}

function addCooHit(
  hits: CooExtractionHit[],
  seen: Set<string>,
  raw: string,
  source: CooExtractionHit["source"],
  confidence: number,
  position?: number
): void {
  const value = normalizeCountryToken(raw);
  if (!value) return;
  const key = position != null ? `${position}:${value}` : value;
  if (seen.has(key)) return;
  seen.add(key);
  hits.push({ value, source, confidence, position, raw });
}

function extractCooFromLineSegment(segment: string): string | null {
  for (const re of [COO_CODE, COO_LABEL, ORIGIN_OF_GOODS, ORIGIN_COUNTRY_CODE, MADE_IN, ORIGIN_DASH]) {
    re.lastIndex = 0;
    const match = re.exec(segment);
    if (match) {
      const value = normalizeCountryToken(match[1]);
      if (value) return value;
    }
  }

  const afterHs = segment.match(/\b\d{8,10}\s+([A-Z]{2})\b/);
  if (afterHs) {
    return normalizeCountryToken(afterHs[1]);
  }

  const tabular = segment.match(/\b(\d{8,12})\s+([A-Z]{2})\s+/);
  if (tabular) {
    return normalizeCountryToken(tabular[2]);
  }

  return null;
}

function extractPositionLineHits(corpus: string): CooExtractionHit[] {
  const hits: CooExtractionHit[] = [];
  const seen = new Set<string>();

  for (const line of corpus.split(/\r?\n/)) {
    const match = line.match(POSITION_LINE_START);
    if (!match) continue;
    const position = parseInt(match[1], 10);
    if (!Number.isFinite(position) || position <= 0 || position > 999) continue;
    const coo = extractCooFromLineSegment(match[2]);
    if (coo) {
      addCooHit(hits, seen, coo, "regex_fallback", 0.9, position);
    }
  }

  return hits;
}

function extractLabeledCoo(corpus: string, source: CooExtractionHit["source"]): CooExtractionHit[] {
  const hits: CooExtractionHit[] = [];
  const seen = new Set<string>();

  for (const re of [COO_LABEL, ORIGIN_OF_GOODS, COO_CODE, ORIGIN_COUNTRY_CODE, MADE_IN, ORIGIN_DASH]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(corpus)) !== null) {
      addCooHit(hits, seen, match[1], source, 0.85);
    }
  }

  return hits;
}

/** Extract COO hits from document corpus. */
export function extractCooHitsFromCorpus(
  corpus: string,
  options?: { source?: CooExtractionHit["source"] }
): CooExtractionHit[] {
  const text = corpus?.trim();
  if (!text) return [];
  const source = options?.source ?? "regex_fallback";
  const hits = [...extractPositionLineHits(text), ...extractLabeledCoo(text, source)];

  const byKey = new Map<string, CooExtractionHit>();
  for (const hit of hits) {
    const key = hit.position != null ? `${hit.position}:${hit.value}` : hit.value;
    const existing = byKey.get(key);
    if (!existing || hit.confidence > existing.confidence) {
      byKey.set(key, hit);
    }
  }
  return [...byKey.values()];
}

/** Map line position numbers to ISO2 country codes. */
export function extractCooByPosition(corpus: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const hit of extractCooHitsFromCorpus(corpus)) {
    if (hit.position == null) continue;
    map.set(hit.position, hit.value);
  }

  for (const [position, coo] of extractCooByPositionBlock(corpus)) {
    if (!map.has(position)) {
      map.set(position, coo);
    }
  }

  if (map.size === 0) {
    const labeled = extractLabeledCoo(corpus, "regex_fallback").filter((hit) => !hit.position);
    const unique = [...new Set(labeled.map((hit) => hit.value))];
    if (unique.length === 1) {
      map.set(1, unique[0]);
    }
  }

  return map;
}

/** Unique ISO2 origin codes detected in corpus. */
export function extractGenericCountryOfOriginCodes(corpus: string): string[] {
  const codes = new Set<string>();
  for (const hit of extractCooHitsFromCorpus(corpus)) {
    codes.add(hit.value);
  }
  return [...codes].sort();
}

/** Normalize free-text COO to ISO2 when possible. */
export function normalizeCountryOfOrigin(raw: string | null | undefined): string {
  return resolveIso2CountryCode(raw) ?? raw?.trim()?.toUpperCase() ?? "";
}

/** Document-level single origin when all lines share one COO. */
export function extractDocumentLevelCoo(corpus: string): string | null {
  const codes = extractGenericCountryOfOriginCodes(corpus);
  if (codes.length === 1) return codes[0] ?? null;
  return null;
}
