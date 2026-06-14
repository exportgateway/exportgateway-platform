/**
 * Detect parser invoice totals that are VAT rates or otherwise implausible.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractLabeledInvoiceTotal } from "@/lib/export-auditor/money-token-extract";
import { isPreDiscountInvoiceAmount } from "@/lib/export-auditor/invoice-discount-context";
import { sumLineTotals } from "@/lib/export-auditor/parse-locale-number";
import { TAX_PERCENTAGE_VALUES } from "@/lib/export-auditor/monetary-exclusion-filter";

/** Parser mapped VAT rate (22 / 9.5) as invoice total — common OCR failure. */
export function isParserVatRateAsTotal(value: number, corpus: string): boolean {
  if (!TAX_PERCENTAGE_VALUES.has(value)) return false;
  if (!corpus.trim()) return true;
  return /(?:vat|tax|%\s*disc|w\/o\s+vat)/i.test(corpus);
}

/** True when parser total is implausibly low vs labeled total, line sum, or document context. */
export function isSuspiciousParserInvoiceTotal(
  value: number,
  corpus: string,
  invoice?: NormalizedInvoice,
  largestMonetary?: number | null
): boolean {
  if (!Number.isFinite(value) || value <= 0) return true;
  if (isParserVatRateAsTotal(value, corpus)) return true;
  if (isPreDiscountInvoiceAmount(value, corpus)) return true;

  const labeled = extractLabeledInvoiceTotal(corpus);
  if (labeled != null && labeled > value * 1.5) return true;

  const lineSum = sumLineTotals(invoice?.items);
  if (lineSum != null && lineSum > value * 1.5) return true;

  if (largestMonetary != null && largestMonetary > value * 10) return true;

  if (value < 100 && /\b(?:Pos|Description|Barcode|Quantity)\b/i.test(corpus)) {
    return true;
  }

  return false;
}
