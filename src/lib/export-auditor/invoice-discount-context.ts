/**
 * Discount-aware invoice totals — prefer post-discount final totals over pre-discount Amount lines.
 */

import {
  extractLabeledInvoiceTotal,
  FINAL_INVOICE_TOTAL_RES,
  MONEY_CAPTURE,
  parseMoneyToken,
} from "@/lib/export-auditor/money-token-extract";
import { roundMoney } from "@/lib/export-auditor/parse-locale-number";

export interface InvoiceDiscountContext {
  preDiscountAmount: number | null;
  discountAmount: number | null;
  finalTotal: number | null;
  netTotalFromArithmetic: number | null;
  vatInclusiveTotal: number | null;
}

const TOTAL_WO_VAT_RE = new RegExp(
  `\\bTotal\\s+w\\/o\\s+VAT\\s*:?\\s*(?:EUR|€)?\\s*(${MONEY_CAPTURE})`,
  "i"
);

const VAT_AMOUNT_RE = new RegExp(
  `\\bVAT\\s+\\d+(?:[.,]\\d+)?\\s*\\%\\s*(?:EUR|€)?\\s*(${MONEY_CAPTURE})`,
  "i"
);

/** Net + VAT lines on European invoices (e.g. 17.861,24 + 3.929,06 = 21.790,30). */
export function extractVatInclusiveInvoiceTotal(corpus: string): number | null {
  const netMatch = corpus.match(TOTAL_WO_VAT_RE);
  const vatMatch = corpus.match(VAT_AMOUNT_RE);
  const net = netMatch?.[1] ? parseMoneyToken(netMatch[1]) : null;
  const vat = vatMatch?.[1] ? parseMoneyToken(vatMatch[1]) : null;
  if (net == null || vat == null) return null;
  const total = roundMoney(net + vat);
  return total > 0 ? total : null;
}

const PRE_DISCOUNT_AMOUNT_RE = new RegExp(
  `(?:^|\\n)\\s*(?:Amount|Znesek|Gross\\s+(?:Amount|amount|value))\\s*(?!to\\s+be\\s+paid)(?!EUR\\b)(?!with\\b)(?!za\\s+pla)\\s*:?\\s*(?:EUR|€)?\\s*(${MONEY_CAPTURE})`,
  "i"
);

const DISCOUNT_VALUE_LINE_RE = new RegExp(
  `(?:^|\\n)\\s*(?:Value\\s+of\\s+discount|Discount\\s+value)\\s*:?\\s*(?:EUR|€)?\\s*-?\\s*(${MONEY_CAPTURE})`,
  "i"
);

const DISCOUNT_LINE_RE = new RegExp(
  `(?:^|\\n)\\s*(?:Discount|Rabatt|Skonto|Popust)\\s*:?\\s*(?:EUR|€)?\\s*-?\\s*(${MONEY_CAPTURE})`,
  "i"
);

function extractPreDiscountAmount(corpus: string): number | null {
  const match = corpus.match(PRE_DISCOUNT_AMOUNT_RE);
  return match?.[1] ? parseMoneyToken(match[1]) : null;
}

function extractDiscountAmount(corpus: string): number | null {
  const match = corpus.match(DISCOUNT_VALUE_LINE_RE) ?? corpus.match(DISCOUNT_LINE_RE);
  const raw = match?.[1] ? parseMoneyToken(match[1]) : null;
  return raw != null ? Math.abs(raw) : null;
}

/** High-confidence final total only — avoids circular use of ambiguous "Total amount". */
function extractHighConfidenceFinalTotal(
  corpus: string,
  preDiscountAmount: number | null,
  discountAmount: number | null
): number | null {
  for (const re of FINAL_INVOICE_TOTAL_RES) {
    const match = corpus.match(re);
    if (!match?.[1]) continue;
    const value = parseMoneyToken(match[1]);
    if (value == null) continue;
    if (
      preDiscountAmount != null &&
      discountAmount != null &&
      Math.abs(value - preDiscountAmount) < 0.02
    ) {
      continue;
    }
    return value;
  }
  return null;
}

/** Extract pre-discount amount, discount, and labeled final total from OCR corpus. */
export function extractInvoiceDiscountContext(corpus: string): InvoiceDiscountContext {
  const preDiscountAmount = extractPreDiscountAmount(corpus);
  const discountAmount = extractDiscountAmount(corpus);

  let netTotalFromArithmetic: number | null = null;
  if (preDiscountAmount != null && discountAmount != null && discountAmount > 0) {
    netTotalFromArithmetic = roundMoney(preDiscountAmount - discountAmount);
  }

  const vatInclusiveTotal = extractVatInclusiveInvoiceTotal(corpus);

  const finalTotal =
    extractHighConfidenceFinalTotal(corpus, preDiscountAmount, discountAmount) ??
    netTotalFromArithmetic ??
    vatInclusiveTotal;

  return {
    preDiscountAmount,
    discountAmount,
    finalTotal,
    netTotalFromArithmetic,
    vatInclusiveTotal,
  };
}

const PRE_DISCOUNT_AMOUNT_TOLERANCE = 0.02;

/** True when value matches a pre-discount Amount line while a discounted final total exists. */
export function isPreDiscountInvoiceAmount(
  value: number,
  corpus: string,
  ctx?: InvoiceDiscountContext
): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;

  const context = ctx ?? extractInvoiceDiscountContext(corpus);
  const { preDiscountAmount, discountAmount, finalTotal, netTotalFromArithmetic, vatInclusiveTotal } =
    context;

  if (finalTotal != null && Math.abs(value - finalTotal) < PRE_DISCOUNT_AMOUNT_TOLERANCE) {
    return false;
  }

  if (
    vatInclusiveTotal != null &&
    value > vatInclusiveTotal &&
    (value - vatInclusiveTotal) / vatInclusiveTotal < 0.05
  ) {
    return true;
  }

  if (
    preDiscountAmount != null &&
    Math.abs(value - preDiscountAmount) < PRE_DISCOUNT_AMOUNT_TOLERANCE
  ) {
    if (discountAmount != null && discountAmount > 0) return true;
    if (finalTotal != null && value > finalTotal) return true;
  }

  if (
    netTotalFromArithmetic != null &&
    netTotalFromArithmetic > 0 &&
    preDiscountAmount != null &&
    Math.abs(value - preDiscountAmount) < PRE_DISCOUNT_AMOUNT_TOLERANCE &&
    discountAmount != null
  ) {
    return true;
  }

  if (finalTotal != null && discountAmount != null && value > finalTotal) {
    const excess = roundMoney(value - finalTotal);
    if (Math.abs(excess - discountAmount) < PRE_DISCOUNT_AMOUNT_TOLERANCE) {
      return true;
    }
  }

  if (
    netTotalFromArithmetic != null &&
    discountAmount != null &&
    Math.abs(value - netTotalFromArithmetic) > PRE_DISCOUNT_AMOUNT_TOLERANCE &&
    Math.abs(value - (preDiscountAmount ?? value)) < PRE_DISCOUNT_AMOUNT_TOLERANCE
  ) {
    return true;
  }

  return false;
}

/** Best post-discount invoice total from labeled lines, discount arithmetic, or null. */
export function resolvePostDiscountInvoiceTotal(corpus: string): number | null {
  const ctx = extractInvoiceDiscountContext(corpus);

  const labeled = extractLabeledInvoiceTotal(corpus, {
    skipPreDiscount: true,
    preDiscountAmount: ctx.preDiscountAmount,
    discountAmount: ctx.discountAmount,
  });

  if (labeled != null && labeled > 0 && !isPreDiscountInvoiceAmount(labeled, corpus, ctx)) {
    return labeled;
  }

  if (ctx.finalTotal != null && ctx.finalTotal > 0) {
    return ctx.finalTotal;
  }

  if (ctx.netTotalFromArithmetic != null && ctx.netTotalFromArithmetic > 0) {
    return ctx.netTotalFromArithmetic;
  }

  if (ctx.vatInclusiveTotal != null && ctx.vatInclusiveTotal > 0) {
    return ctx.vatInclusiveTotal;
  }

  return null;
}
