/**
 * Quantity parsing — thousand separators in OCR quantity fields (1 400, 1.400, 1,400).
 */

import type { ApiInvoiceItem } from "@/lib/export-auditor/api-types";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";

export const QUANTITY_PARSING_WARNING = "QUANTITY_PARSING_WARNING";

/** Regex fragment for quantity tokens with optional thousand separators. */
export const QUANTITY_CAPTURE = String.raw`\d{1,3}(?:[\s.,]\d{3})+|\d+(?:[.,]\d+)?`;

export const QUANTITY_WITH_UNIT_RE = new RegExp(
  `(${QUANTITY_CAPTURE})\\s*(?:pcs|pc|st|kg|m|l|stk|pz|[A-Za-z]{1,4})\\b`,
  "i"
);

const SPACE_THOUSANDS_RE = /^\d{1,3}(?:\s\d{3})+$/;
const DOT_THOUSANDS_RE = /^\d{1,3}(?:\.\d{3})+$/;
const COMMA_THOUSANDS_RE = /^\d{1,3}(?:,\d{3})+$/;

/** Strip unit suffixes before numeric conversion. */
export function normalizeQuantityToken(raw: string): string {
  return raw
    .trim()
    .replace(/\s*(?:pcs|pc|st|kg|m|l|stk|pz|eur)\.?\s*$/i, "")
    .trim();
}

/**
 * Parse quantity — supports 1400, 1 400, 1.400, 2.000, 1,400 before numeric conversion.
 */
export function parseQuantity(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : 0;

  const normalized = normalizeQuantityToken(String(value)).replace(/\s/g, " ").trim();
  if (!normalized) return 0;

  const compact = normalized.replace(/\s/g, "");

  if (SPACE_THOUSANDS_RE.test(normalized)) {
    const n = parseInt(normalized.replace(/\s/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }

  if (DOT_THOUSANDS_RE.test(compact)) {
    const n = parseInt(compact.replace(/\./g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }

  if (COMMA_THOUSANDS_RE.test(compact)) {
    const n = parseInt(compact.replace(/,/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }

  const n = parseLocaleNumber(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const QTY_ARITHMETIC_TOLERANCE = 0.03;

/** True when line_total / quantity ≈ unit_price within tolerance. */
export function isQuantityArithmeticConsistent(
  quantity: number,
  unitPrice: number | null | undefined,
  lineTotal: number | null | undefined,
  tolerance = QTY_ARITHMETIC_TOLERANCE
): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  if (lineTotal == null || lineTotal <= 0) return true;
  if (unitPrice == null || unitPrice <= 0) return true;

  const impliedUnit = lineTotal / quantity;
  const relativeDiff = Math.abs(impliedUnit - unitPrice) / unitPrice;
  return relativeDiff <= tolerance;
}

/** Recover integer quantity from line_total / unit_price when OCR truncated thousands. */
function recoverQuantityFromArithmetic(
  quantity: number,
  unitPrice: number | null,
  lineTotal: number | null
): number {
  if (lineTotal == null || lineTotal <= 0 || unitPrice == null || unitPrice <= 0) {
    return quantity;
  }
  if (isQuantityArithmeticConsistent(quantity, unitPrice, lineTotal)) {
    return quantity;
  }

  const expected = lineTotal / unitPrice;
  const rounded = Math.round(expected);
  if (
    rounded >= 2 &&
    Math.abs(expected - rounded) / rounded <= QTY_ARITHMETIC_TOLERANCE &&
    isQuantityArithmeticConsistent(rounded, unitPrice, lineTotal)
  ) {
    return rounded;
  }

  return quantity;
}

export interface QuantityValidationResult {
  items: ApiInvoiceItem[];
  hasWarning: boolean;
}

/** Normalize quantities and flag rows where arithmetic does not reconcile. */
export function validateAndNormalizeLineItemQuantities(
  items: ApiInvoiceItem[]
): QuantityValidationResult {
  let hasWarning = false;
  const normalized = items.map((item) => {
    let quantity = parseQuantity(item.quantity);
    const unitPrice =
      item.unit_price != null && item.unit_price !== ""
        ? parseLocaleNumber(item.unit_price)
        : null;
    const lineTotal =
      item.line_total != null && item.line_total !== ""
        ? parseLocaleNumber(item.line_total)
        : null;

    const recovered = recoverQuantityFromArithmetic(quantity, unitPrice, lineTotal);
    if (recovered !== quantity) {
      quantity = recovered;
    }

    if (
      lineTotal != null &&
      lineTotal > 0 &&
      unitPrice != null &&
      unitPrice > 0 &&
      !isQuantityArithmeticConsistent(quantity, unitPrice, lineTotal)
    ) {
      hasWarning = true;
    }

    return { ...item, quantity };
  });

  return { items: normalized, hasWarning };
}
