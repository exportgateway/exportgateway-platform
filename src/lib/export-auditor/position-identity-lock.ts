/**
 * Immutable position identity fingerprints — dedup must never merge distinct commercial rows.
 */

import type { ApiInvoiceItem } from "@/lib/export-auditor/api-types";
import { extractStyleCodeFromItem } from "@/lib/export-auditor/commercial-line-deduplication";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";

export const POSITION_FINGERPRINT_COLLISION = "POSITION_FINGERPRINT_COLLISION";
export const HS_STYLE_MISMATCH = "HS_STYLE_MISMATCH";
export const COO_STYLE_MISMATCH = "COO_STYLE_MISMATCH";

const SIZE_RE = /\b(?:size|sz)\s*[-:]?\s*(\d{1,3}|XS|S|M|L|XL|XXL|XXXL)\b/i;
const COLOUR_WORD_RE =
  /\b(black|white|navy|blue|red|green|grey|gray|beige|brown|pink|yellow|orange|purple|cream|ivory|khaki|olive|denim)\b/i;

export interface PositionIdentityFingerprint {
  position_number: number;
  style_code: string;
  colour: string;
  size: string;
  hs_code: string;
  coo: string;
  quantity: number;
  line_total: number;
  unit_price: number;
}

function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  return parseLocaleNumber(String(raw).trim()) ?? 0;
}

function normalizeToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Extract colour token from description (word or short code after style). */
export function extractColourFromItem(item: ApiInvoiceItem): string {
  const style = extractStyleCodeFromItem(item);
  let text = (item.description ?? "").trim();
  if (style) text = text.replace(new RegExp(style, "i"), " ").trim();

  text = text
    .replace(/\bHS\s*Code\s*[-–]\s*[\d.\s]+/gi, " ")
    .replace(/\bOrigin\s*[-–]\s*[A-Za-z\s]+/gi, " ")
    .replace(/\b\d{8,10}\b/g, " ")
    .replace(/[\d.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const word = text.match(COLOUR_WORD_RE);
  if (word?.[1]) return normalizeToken(word[1]);

  const code = text.match(/\b([A-Z]{2,5})\b/);
  return code?.[1] ? normalizeToken(code[1]) : "";
}

/** Extract size token when present in description. */
export function extractSizeFromItem(item: ApiInvoiceItem): string {
  const match = (item.description ?? "").match(SIZE_RE);
  if (match?.[1]) return normalizeToken(match[1]);
  return "";
}

/** Immutable identity: style + colour + hs + qty + value (+ size, coo, position). */
export function buildPositionIdentityFingerprint(
  item: ApiInvoiceItem,
  index: number
): PositionIdentityFingerprint {
  return {
    position_number:
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1,
    style_code: extractStyleCodeFromItem(item),
    colour: extractColourFromItem(item),
    size: extractSizeFromItem(item),
    hs_code: normalizeHsToken(item.hs_code) ?? "",
    coo: normalizeToken(item.country_of_origin ?? ""),
    quantity: parseNum(item.quantity),
    line_total: parseNum(item.line_total),
    unit_price: parseNum(item.unit_price),
  };
}

export function positionIdentityKey(fp: PositionIdentityFingerprint): string {
  return [
    fp.position_number,
    fp.style_code,
    fp.colour,
    fp.size,
    fp.hs_code,
    fp.coo,
    fp.quantity.toFixed(3),
    fp.line_total.toFixed(2),
    fp.unit_price.toFixed(4),
  ].join("|");
}

/** Exact identity match — only true duplicates may merge. */
export function areIdenticalCommercialLines(a: ApiInvoiceItem, b: ApiInvoiceItem): boolean {
  const fpA = buildPositionIdentityFingerprint(a, 0);
  const fpB = buildPositionIdentityFingerprint(b, 1);

  if (
    fpA.position_number > 0 &&
    fpB.position_number > 0 &&
    fpA.position_number !== fpB.position_number
  ) {
    return false;
  }

  return positionIdentityKey(fpA) === positionIdentityKey(fpB);
}

/** Safe dedup — merge ONLY exact identity matches (pipeline triplication). */
export function dedupeByExactIdentity(items: ApiInvoiceItem[]): {
  kept: ApiInvoiceItem[];
  removedCount: number;
} {
  const kept: ApiInvoiceItem[] = [];
  let removedCount = 0;

  for (const item of items) {
    if (kept.some((existing) => areIdenticalCommercialLines(existing, item))) {
      removedCount += 1;
    } else {
      kept.push(item);
    }
  }

  return { kept, removedCount };
}

export function identityBlockFingerprints(items: ApiInvoiceItem[]): string[] {
  return items.map((item, index) => positionIdentityKey(buildPositionIdentityFingerprint(item, index)));
}

export function identityBlocksMatch(a: ApiInvoiceItem[], b: ApiInvoiceItem[]): boolean {
  if (a.length !== b.length) return false;
  const keysA = identityBlockFingerprints(a);
  const keysB = identityBlockFingerprints(b);
  return keysA.every((key, index) => key === keysB[index]);
}
