/**
 * European invoice money tokens — thousand separators (21.790,30 / 21 790,30 / 21,790.30).
 */

import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";

/** Capture group for labeled totals and line amounts with optional thousand separators. */
export const MONEY_CAPTURE = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})|\d{1,3}(?:\s\d{3})+(?:,\d{1,2})|\d+(?:,\d{2})|\d+(?:\.\d{2})`;

const MONEY_TOKEN_RE = new RegExp(MONEY_CAPTURE, "g");

export function parseMoneyToken(raw: string): number | null {
  const value = parseLocaleNumber(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const LABELED_TOTAL_SUFFIX = String.raw`\s*(?:EUR|€)?\s*(${MONEY_CAPTURE})\s*(?:EUR|€)?`;

/** Unambiguous post-discount final total labels — checked first. */
export const FINAL_INVOICE_TOTAL_RES = [
  new RegExp(
    `\\bTotal\\s+invoice\\s+amount\\s*:?\\s*(?:\\n\\s*)?(?:EUR|€)?\\s*(${MONEY_CAPTURE})\\s*(?:EUR|€)?`,
    "i"
  ),
  new RegExp(
    `\\bAmount\\s+to\\s+be\\s+paid\\s*:?\\s*(?:\\n\\s*)?(?:EUR|€)?\\s*(${MONEY_CAPTURE})\\s*(?:EUR|€)?`,
    "i"
  ),
  new RegExp(`\\bDiscounted\\s+amount\\s*:?${LABELED_TOTAL_SUFFIX}`, "i"),
  new RegExp(
    `\\b(?:Skupaj\\s+za\\s+pla[cč]ilo|Za\\s+pla[cč]ilo)\\s*:?${LABELED_TOTAL_SUFFIX}`,
    "i"
  ),
  new RegExp(`\\bSkupni\\s+znesek\\s+(?:ra[cč]una|fakture)\\s*:?${LABELED_TOTAL_SUFFIX}`, "i"),
];

/**
 * Ambiguous totals — "Total amount" often means pre-discount subtotal when a Discount line exists.
 * Used only after high-confidence patterns and with pre-discount filtering.
 */
export const AMBIGUOUS_INVOICE_TOTAL_RES = [
  new RegExp(`\\bTotal\\s+(?:amount|value)\\s*:?${LABELED_TOTAL_SUFFIX}`, "i"),
  new RegExp(`\\bInvoice\\s+total\\s*:?${LABELED_TOTAL_SUFFIX}`, "i"),
  new RegExp(`\\bGrand\\s+total\\s*:?${LABELED_TOTAL_SUFFIX}`, "i"),
  new RegExp(`\\bSkupaj\\s*:?${LABELED_TOTAL_SUFFIX}`, "i"),
];

/** All labeled total patterns — priority order (for diagnostics / backwards compatibility). */
export const LABELED_INVOICE_TOTAL_RES = [
  ...FINAL_INVOICE_TOTAL_RES,
  ...AMBIGUOUS_INVOICE_TOTAL_RES,
];

export interface LabeledTotalOptions {
  /** Skip values that match pre-discount Amount when discount is present. */
  skipPreDiscount?: boolean;
  /** When set, reject candidates equal to this pre-discount amount (with discount present). */
  preDiscountAmount?: number | null;
  discountAmount?: number | null;
}

function isPreDiscountLabeledCandidate(
  value: number,
  options?: LabeledTotalOptions
): boolean {
  if (!options?.skipPreDiscount) return false;
  const { preDiscountAmount, discountAmount } = options;
  if (preDiscountAmount == null || discountAmount == null || discountAmount <= 0) {
    return false;
  }
  return Math.abs(value - preDiscountAmount) < 0.02;
}

const SUMMARY_HEADER_COLUMNS = [
  { key: "amount", re: /\b(?<![\w])amount(?!\s+to\s+be)(?!\s+eur)\b/i },
  { key: "discount", re: /\b(?:discount|popust|rabatt|skonto)\b/i },
  { key: "vat_amount", re: /\bv(?:at)?\s*amount\b/i },
  { key: "total_invoice_amount", re: /\btotal\s+invoice\s+amount\b/i },
  { key: "amount_to_be_paid", re: /\bamount\s+to\s+be\s+paid\b/i },
] as const;

function parseMoneyTokensFromLine(line: string): number[] {
  const values: number[] = [];
  for (const match of line.matchAll(MONEY_TOKEN_RE)) {
    const value = parseMoneyToken(match[0]);
    if (value != null) values.push(value);
  }
  return values;
}

/** Header row + value row tables (APECS: labels on one line, amounts on the next). */
export function extractTabularSummaryInvoiceTotal(corpus: string): number | null {
  const tableMatch = corpus.match(
    /(?:^|\n)([^\n]*\btotal\s+invoice\s+amount\b[^\n]*)\n\s*([^\n]+)/i
  );
  if (!tableMatch?.[1] || !tableMatch[2]) return null;

  const headerLine = tableMatch[1];
  const dataLine = tableMatch[2];
  const values = parseMoneyTokensFromLine(dataLine);
  if (values.length === 0) return null;

  const columns: { key: string; pos: number }[] = [];
  for (const { key, re } of SUMMARY_HEADER_COLUMNS) {
    const match = headerLine.match(re);
    if (match?.index != null) columns.push({ key, pos: match.index });
  }
  columns.sort((a, b) => a.pos - b.pos);

  const pick = (key: string): number | null => {
    const colIdx = columns.findIndex((col) => col.key === key);
    if (colIdx < 0 || colIdx >= values.length) return null;
    const value = values[colIdx];
    return value > 0 ? value : null;
  };

  const totalInvoice = pick("total_invoice_amount");
  const amountToBePaid = pick("amount_to_be_paid");

  if (
    values.length >= 3 &&
    values[0] > values[1] &&
    Math.abs(values[0] - values[1] - values[2]) < 0.02
  ) {
    if (totalInvoice != null && Math.abs(totalInvoice - values[2]) < 0.02) {
      return values[2];
    }
    if (totalInvoice == null) return values[2];
  }

  if (totalInvoice != null) return totalInvoice;

  if (amountToBePaid != null) return amountToBePaid;

  const nonZeroTail = [...values].reverse().find((v) => v > 0);
  if (
    nonZeroTail != null &&
    values[0] > nonZeroTail &&
    values.length >= 2 &&
    Math.abs(values[0] - values[1] - nonZeroTail) < 0.02
  ) {
    return nonZeroTail;
  }

  return null;
}

function extractFromPatterns(
  corpus: string,
  patterns: RegExp[],
  options?: LabeledTotalOptions
): number | null {
  for (const re of patterns) {
    const match = corpus.match(re);
    if (!match?.[1]) continue;
    const value = parseMoneyToken(match[1]);
    if (value == null) continue;
    if (isPreDiscountLabeledCandidate(value, options)) continue;
    return value;
  }
  return null;
}

function readDiscountFilterFromCorpus(corpus: string): Pick<LabeledTotalOptions, "preDiscountAmount" | "discountAmount"> {
  const preMatch = corpus.match(
    new RegExp(
      `(?:^|\\n)\\s*(?:Amount|Znesek)\\s*(?!to\\s+be\\s+paid)(?!EUR\\b)(?!with\\b)(?!za\\s+pla)\\s*:?\\s*(?:EUR|€)?\\s*(${MONEY_CAPTURE})`,
      "i"
    )
  );
  const discountMatch = corpus.match(
    new RegExp(
      `(?:^|\\n)\\s*(?:Discount|Rabatt|Skonto|Popust)\\s*:?\\s*(?:EUR|€)?\\s*-?\\s*(${MONEY_CAPTURE})`,
      "i"
    )
  );
  const discountRaw = discountMatch?.[1] ? parseMoneyToken(discountMatch[1]) : null;
  return {
    preDiscountAmount: preMatch?.[1] ? parseMoneyToken(preMatch[1]) : null,
    discountAmount: discountRaw != null ? Math.abs(discountRaw) : null,
  };
}

/** Extract labeled invoice total — high-confidence labels first; ambiguous labels discount-filtered. */
export function extractLabeledInvoiceTotal(
  corpus: string,
  options?: LabeledTotalOptions
): number | null {
  const skipPreDiscount = options?.skipPreDiscount ?? true;
  const fromCorpus =
    skipPreDiscount && options?.preDiscountAmount == null
      ? readDiscountFilterFromCorpus(corpus)
      : {};
  const filterOptions: LabeledTotalOptions = {
    skipPreDiscount,
    preDiscountAmount: options?.preDiscountAmount ?? fromCorpus.preDiscountAmount,
    discountAmount: options?.discountAmount ?? fromCorpus.discountAmount,
  };

  const tabular = extractTabularSummaryInvoiceTotal(corpus);
  if (
    tabular != null &&
    !isPreDiscountLabeledCandidate(tabular, filterOptions) &&
    !(filterOptions.preDiscountAmount != null &&
      Math.abs(tabular - filterOptions.preDiscountAmount) < 0.02)
  ) {
    return tabular;
  }

  const final = extractFromPatterns(corpus, FINAL_INVOICE_TOTAL_RES, filterOptions);
  if (final != null) return final;

  return extractFromPatterns(corpus, AMBIGUOUS_INVOICE_TOTAL_RES, filterOptions);
}

interface MoneySpan {
  start: number;
  end: number;
  value: number;
}

/** Collect monetary amounts — drop sub-spans (e.g. 790,30 inside 21.790,30). */
export function extractMonetaryAmountSpans(corpus: string): MoneySpan[] {
  const spans: MoneySpan[] = [];
  for (const match of corpus.matchAll(MONEY_TOKEN_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const value = parseMoneyToken(raw);
    if (value == null || value < 1) continue;
    spans.push({ start: index, end: index + raw.length, value });
  }

  return spans.filter(
    (span) =>
      !spans.some(
        (other) =>
          other !== span &&
          other.start <= span.start &&
          other.end >= span.end &&
          other.end - other.start > span.end - span.start
      )
  );
}

export function extractMonetaryCandidateValues(corpus: string): number[] {
  return [...new Set(extractMonetaryAmountSpans(corpus).map((span) => span.value))];
}

/** True when a header amount_eur looks like a truncated thousands fragment of a larger total. */
export function isTruncatedThousandsFragment(fragment: number, reference: number): boolean {
  if (!Number.isFinite(fragment) || !Number.isFinite(reference) || fragment <= 0 || reference <= 0) {
    return false;
  }
  if (fragment >= reference * 0.9) return false;
  return reference >= fragment * 10;
}
