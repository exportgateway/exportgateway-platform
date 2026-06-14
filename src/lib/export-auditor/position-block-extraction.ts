/**
 * Position-block field extraction — multiline invoice layouts where HS/COO labels
 * appear on separate lines from the position header (e.g. Dexxon Commodity code: / COO:).
 */

import { normalizeAndValidateHsToken } from "@/lib/export-auditor/hs-code-normalize";
import { resolveIso2CountryCode } from "@/lib/export-auditor/country-resolution";

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  china: "CN",
  italy: "IT",
  turkey: "TR",
  bulgaria: "BG",
  germany: "DE",
  portugal: "PT",
  slovenia: "SI",
};

function normalizeCountryToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const iso = resolveIso2CountryCode(trimmed);
  if (iso) return iso;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return COUNTRY_NAME_TO_CODE[key] ?? null;
}

/** Position header — must be followed by alphabetic description (not qty/amount rows). */
const POSITION_START = /^\s*(\d{1,3})\s+(?=[A-Za-z])/;
const TABLE_TERMINATOR = /^(?:Total|Subtotal|VAT|Amount|Payment|Due|Grand\s+total|Amount\s+to\s+be)/i;

const HS_LABEL_IN_BLOCK =
  /\b(?:HS(?:\s+code|\s*code)?|Commodity\s*code|Commoditycode|Customs\s+Tariff|Nomenclature|Tariff(?:\s+code|\s*Code)?)\s*[:\-]?\s*([\d][\d.\s]{5,16}\d)\b/gi;

const COO_IN_BLOCK =
  /\b(?:COO|Country\s+of\s+Origin|Origin\s+Of\s+Goods|Origin\s+Country)\s*[:\-]\s*([A-Za-z]{2,32})\b/gi;

const COO_CODE_INLINE = /\bCOO\s*[:\-]?\s*([A-Z]{2})\b/gi;

const MADE_IN_BLOCK = /\bMade\s+in\s+([A-Za-z][A-Za-z\s]{1,24})\b/gi;

const ORIGIN_DASH_BLOCK = /\bOrigin\s*[-–]\s*([A-Za-z][A-Za-z\s]{1,24})\b/gi;

function splitPositionBlocks(corpus: string): Map<number, string> {
  const blocks = new Map<number, string>();
  let currentPos: number | null = null;
  let lines: string[] = [];

  const flush = () => {
    if (currentPos != null && lines.length > 0) {
      blocks.set(currentPos, lines.join("\n"));
    }
  };

  for (const raw of corpus.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (TABLE_TERMINATOR.test(trimmed)) {
      flush();
      break;
    }

    const posMatch = trimmed.match(POSITION_START);
    if (posMatch) {
      const position = parseInt(posMatch[1], 10);
      if (Number.isFinite(position) && position > 0 && position <= 999) {
        flush();
        currentPos = position;
        lines = [line];
        continue;
      }
    }

    if (currentPos != null) {
      lines.push(line);
    }
  }

  flush();
  return blocks;
}

function extractHsFromBlock(text: string): string | null {
  HS_LABEL_IN_BLOCK.lastIndex = 0;
  const labeled = HS_LABEL_IN_BLOCK.exec(text);
  if (labeled) {
    const normalized = normalizeAndValidateHsToken(labeled[1]);
    if (normalized.normalized && !normalized.invalid) return normalized.normalized;
  }

  const inline = text.match(/\b(\d{4}[.\s]?\d{2}[.\s]?\d{2}|\d{8,10})\b/);
  if (inline) {
    const normalized = normalizeAndValidateHsToken(inline[1]);
    if (normalized.normalized && !normalized.invalid) return normalized.normalized;
  }

  return null;
}

const ORIGIN_COUNTRY_INLINE = /\bOrigin\s+Country\s+([A-Z]{2})\b/gi;

function extractCooFromBlock(text: string): string | null {
  for (const re of [COO_IN_BLOCK, COO_CODE_INLINE, ORIGIN_COUNTRY_INLINE, MADE_IN_BLOCK, ORIGIN_DASH_BLOCK]) {
    re.lastIndex = 0;
    const match = re.exec(text);
    if (match) {
      const value = normalizeCountryToken(match[1]);
      if (value) return value;
    }
  }
  return null;
}

/** Dexxon tabular — position suffix `.\\tN` on product row; HS on following COO line. */
const DEXXON_POSITION_SUFFIX = /\t\.\t(\d{1,3})\s*$/;
const DEXXON_CONTINUATION_HS = /\b(\d{8,10})\s*$/;

function extractDexxonTabularFields(corpus: string): {
  hs: Map<number, string>;
  coo: Map<number, string>;
} {
  const hs = new Map<number, string>();
  const coo = new Map<number, string>();
  const lines = corpus.split(/\r?\n/).map((raw) => raw.trimEnd());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    const posMatch = trimmed.match(DEXXON_POSITION_SUFFIX);
    if (!posMatch) continue;

    const position = parseInt(posMatch[1], 10);
    if (!Number.isFinite(position) || position <= 0 || position > 999) continue;

    for (let offset = 1; offset <= 5 && index + offset < lines.length; offset += 1) {
      const continuation = (lines[index + offset] ?? "").trim();
      if (!continuation || /^Dexxon Data Media/i.test(continuation)) continue;
      if (DEXXON_POSITION_SUFFIX.test(continuation)) break;

      const hsTail = continuation.match(DEXXON_CONTINUATION_HS);
      if (!hsTail) {
        const cooLead = continuation.match(/^([A-Z]{2})\t/i);
        if (cooLead && !coo.has(position)) {
          const code = normalizeCountryToken(cooLead[1]);
          if (code) coo.set(position, code);
        }
        continue;
      }

      const normalized = normalizeAndValidateHsToken(hsTail[1]);
      if (!normalized.normalized || normalized.invalid) continue;

      hs.set(position, normalized.normalized);

      const cooLead = continuation.match(/^([A-Z]{2})\t/i);
      if (cooLead) {
        const code = normalizeCountryToken(cooLead[1]);
        if (code) coo.set(position, code);
      }
      break;
    }
  }

  return { hs, coo };
}

/** Map position numbers to HS codes from Dexxon suffix-position tabular layout. */
export function extractDexxonTabularHsByPosition(corpus: string): Map<number, string> {
  return extractDexxonTabularFields(corpus).hs;
}

/** Map position numbers to COO from Dexxon suffix-position tabular layout. */
export function extractDexxonTabularCooByPosition(corpus: string): Map<number, string> {
  return extractDexxonTabularFields(corpus).coo;
}

/** Map position numbers to HS codes from multiline position blocks. */
export function extractHsByPositionBlock(corpus: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const [position, block] of splitPositionBlocks(corpus)) {
    const hs = extractHsFromBlock(block);
    if (hs) map.set(position, hs);
  }
  for (const [position, hs] of extractDexxonTabularHsByPosition(corpus)) {
    if (!map.has(position)) map.set(position, hs);
  }
  return map;
}

/** Map position numbers to COO codes from multiline position blocks. */
export function extractCooByPositionBlock(corpus: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const [position, block] of splitPositionBlocks(corpus)) {
    const coo = extractCooFromBlock(block);
    if (coo) map.set(position, coo);
  }
  for (const [position, coo] of extractDexxonTabularCooByPosition(corpus)) {
    if (!map.has(position)) map.set(position, coo);
  }
  return map;
}

/** True when corpus contains visible HS/tariff field labels. */
export function corpusContainsVisibleHsLabels(corpus: string): boolean {
  return /\b(?:Commodity\s*code|Commoditycode|HS\s*Code|Customs\s+Tariff|Nomenclature|Tariff(?:\s+code)?)\b/i.test(
    corpus
  );
}
