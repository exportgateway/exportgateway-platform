import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  extractLabeledInvoiceTotal,
  isTruncatedThousandsFragment,
} from "@/lib/export-auditor/money-token-extract";
import {
  extractInvoiceDiscountContext,
  isPreDiscountInvoiceAmount,
  resolvePostDiscountInvoiceTotal,
} from "@/lib/export-auditor/invoice-discount-context";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";

/** Relative divergence above which header vs line-sum sources are reconciled. */
export const INVOICE_VALUE_DIVERGENCE_RATIO = 1.5;

/**
 * Parse invoice numeric strings — European (5.593,70 / 1.123,50) and US (1,123.50 / 1123.50).
 * Strips thousand separators without corrupting US-style decimal dots.
 */
export function parseLocaleNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value).trim().replace(/\s/g, "");
  s = s.replace(/[^\d,.-]/g, "");
  if (!s || s === "-") return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // European: 21.790,30 → 21790.30
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 21,790.30 → 21790.30
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 3) {
      s = `${parts[0].replace(/\./g, "")}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      // US decimal: 1123.50
    } else if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // European thousands: 21.790 or 1.234.567
      s = s.replace(/\./g, "");
    } else {
      s = s.replace(/\./g, "");
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Format canonical invoice value for UI — consistent de-DE currency display. */
export function formatInvoiceValueDisplay(
  value: number,
  currency = "EUR",
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const formatted = value.toLocaleString("de-DE", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
  return `${currency} ${formatted}`;
}

/** Format declaration export numeric value — de-DE locale, no currency suffix. */
export function formatDeclarationNumericValue(value: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** @deprecated Prefer formatDeclarationNumericValue — currency belongs in Currency column. */
export function formatDeclarationExportValue(value: number): string {
  return formatDeclarationNumericValue(value);
}

/** Extract "Amount EUR" total from invoice totals page / footer text. */
export function resolveAmountEurFromText(corpus: string): number | null {
  if (!corpus.trim()) return null;

  const patterns = [
    /amount\s+eur\s*[:\s]*(?:EUR|€)?\s*([\d.,\s]+)/i,
    /total\s+amount\s+eur\s*[:\s]*(?:EUR|€)?\s*([\d.,\s]+)/i,
    /amount\s*eur\s*[:\s]*(?:EUR|€)?\s*([\d.,\s]+)/i,
    /eur\s+amount\s*[:\s]*(?:EUR|€)?\s*([\d.,\s]+)/i,
    /gesamt\s*eur\s*[:\s]*(?:EUR|€)?\s*([\d.,\s]+)/i,
    /total\s+eur\s*[:\s]*(?:EUR|€)?\s*([\d.,\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    if (!match?.[1]) continue;
    const parsed = roundMoney(parseLocaleNumber(match[1]));
    if (parsed > 0) return parsed;
  }

  return null;
}

/** Sum line totals from OCR items when present. */
export function sumLineTotals(items: ApiInvoiceItem[] | undefined): number | null {
  if (!items?.length) return null;

  let sum = 0;
  let hasTotals = false;

  for (const item of items) {
    if (item.line_total != null && item.line_total !== "") {
      sum += parseLocaleNumber(item.line_total);
      hasTotals = true;
      continue;
    }
    if (item.unit_price != null && item.quantity != null) {
      sum += parseLocaleNumber(item.unit_price) * parseLocaleNumber(item.quantity);
      hasTotals = true;
    }
  }

  return hasTotals ? roundMoney(sum) : null;
}

function reconcileHeaderAndLineSum(headerValue: number, lineSum: number): number {
  const larger = Math.max(headerValue, lineSum);
  const smaller = Math.min(headerValue, lineSum);
  const ratio = smaller > 0 ? larger / smaller : Number.POSITIVE_INFINITY;

  if (ratio > INVOICE_VALUE_DIVERGENCE_RATIO) {
    if (lineSum > headerValue * INVOICE_VALUE_DIVERGENCE_RATIO) {
      return headerValue;
    }
    if (headerValue > lineSum * INVOICE_VALUE_DIVERGENCE_RATIO) {
      return lineSum;
    }
  }

  return headerValue;
}

/**
 * Canonical invoice total — single source of truth for all UI sections.
 * Priority: labeled final total → post-discount arithmetic → Amount EUR field → Amount EUR text → header → line sum.
 */
export function resolveInvoiceValue(invoice: NormalizedInvoice): number {
  const extended = invoice as NormalizedInvoice & { amount_eur?: number | string | null };

  const headerValue = roundMoney(
    parseLocaleNumber(invoice.total_value_numeric ?? invoice.total_value)
  );
  const lineSum = sumLineTotals(invoice.items);
  const corpus = buildInvoiceTextCorpus(invoice);
  const discountCtx = extractInvoiceDiscountContext(corpus);
  const postDiscountTotal = resolvePostDiscountInvoiceTotal(corpus);

  if (postDiscountTotal != null && postDiscountTotal > 0) {
    return roundMoney(postDiscountTotal);
  }

  const labeledTotal = extractLabeledInvoiceTotal(corpus, {
    skipPreDiscount: true,
    preDiscountAmount: discountCtx.preDiscountAmount,
    discountAmount: discountCtx.discountAmount,
  });
  if (
    labeledTotal != null &&
    labeledTotal > 0 &&
    !isPreDiscountInvoiceAmount(labeledTotal, corpus, discountCtx)
  ) {
    return roundMoney(labeledTotal);
  }

  const explicitAmountEur = parseLocaleNumber(extended.amount_eur);
  if (explicitAmountEur > 0) {
    if (!isPreDiscountInvoiceAmount(explicitAmountEur, corpus, discountCtx)) {
      const reference = lineSum ?? headerValue ?? 0;
      const fragment =
        reference > 0 && isTruncatedThousandsFragment(explicitAmountEur, reference);
      if (!fragment) {
        return roundMoney(explicitAmountEur);
      }
    }
  }

  const amountFromText = resolveAmountEurFromText(corpus);
  if (amountFromText != null && amountFromText > 0) {
    if (!isPreDiscountInvoiceAmount(amountFromText, corpus, discountCtx)) {
      return amountFromText;
    }
  }

  if (headerValue > 0 && !isPreDiscountInvoiceAmount(headerValue, corpus, discountCtx)) {
    if (lineSum != null && lineSum > 0) {
      return roundMoney(reconcileHeaderAndLineSum(headerValue, lineSum));
    }
    return headerValue;
  }

  if (lineSum != null && lineSum > 0) {
    return lineSum;
  }

  return 0;
}
