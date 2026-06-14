/**
 * Invoice total validation — detect parser totals that disagree with OCR corpus.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { parseLocaleNumber, resolveInvoiceValue, roundMoney, sumLineTotals } from "@/lib/export-auditor/parse-locale-number";
import { extractEnglishInvoiceTotal } from "@/lib/export-auditor/english-invoice-field-extractor";
import { recordParserRecovery } from "@/lib/export-auditor/parser-recovery-provenance";
import { isDateLikeMonetaryToken } from "@/lib/export-auditor/monetary-date-filter";
import {
  isExcludedMonetaryContext,
  isTaxPercentageValue,
} from "@/lib/export-auditor/monetary-exclusion-filter";
import {
  isParserVatRateAsTotal,
  isSuspiciousParserInvoiceTotal,
} from "@/lib/export-auditor/parser-invoice-total-guards";
import {
  isPreDiscountInvoiceAmount,
} from "@/lib/export-auditor/invoice-discount-context";
import {
  extractMonetaryAmountSpans,
  extractLabeledInvoiceTotal,
  isTruncatedThousandsFragment,
} from "@/lib/export-auditor/money-token-extract";

export interface RecoveryTotalOptions {
  /** Parser values to ignore (e.g. VAT rate mistaken as invoice total). */
  excludeValues?: number[];
}

export const TOTAL_VALUE_PARSING_ERROR = "TOTAL_VALUE_PARSING_ERROR";

export const TOTAL_VALUE_PARSING_ERROR_MESSAGE =
  "Invoice total differs significantly from the largest monetary amount on the document";

/** Relative tolerance before flagging TOTAL_VALUE_PARSING_ERROR when no canonical total matches. */
export const INVOICE_TOTAL_TOLERANCE_RATIO = 0.05;

function totalsWithinTolerance(
  a: number,
  b: number,
  toleranceRatio = INVOICE_TOTAL_TOLERANCE_RATIO
): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  const base = Math.max(Math.abs(a), Math.abs(b), 0.01);
  return Math.abs(a - b) / base <= toleranceRatio;
}

/**
 * True when the extracted total aligns with a trusted document source:
 * line-item sum, labeled grand total, or payable amount.
 */
export function invoiceTotalMatchesKnownSource(
  total: number,
  corpus: string,
  invoice?: NormalizedInvoice
): boolean {
  if (!Number.isFinite(total) || total <= 0) return false;

  if (isPreDiscountInvoiceAmount(total, corpus)) return false;

  if (invoice) {
    const lineSum = sumLineTotals(invoice.items);
    if (lineSum != null && lineSum > 0 && totalsWithinTolerance(total, lineSum)) {
      return true;
    }
  }

  const labeled = extractLabeledInvoiceTotal(corpus);
  if (labeled != null && labeled > 0 && totalsWithinTolerance(total, labeled)) {
    return true;
  }

  return false;
}

/** Collect plausible monetary amounts from OCR corpus (dates, VAT bases, tax rates excluded). */
export function extractMonetaryCandidates(corpus: string): number[] {
  const amounts = new Set<number>();
  for (const span of extractMonetaryAmountSpans(corpus)) {
    const raw = corpus.slice(span.start, span.end);
    if (isDateLikeMonetaryToken(corpus, span.start, raw)) continue;
    if (isExcludedMonetaryContext(corpus, span.start)) continue;
    if (isTaxPercentageValue(span.value, corpus, span.start)) continue;
    amounts.add(span.value);
  }
  return [...amounts];
}

/**
 * Recovery reference priority:
 * 1. Total invoice amount
 * 2. Amount to be paid
 * 3. Discounted amount
 * 4. Line-item sum
 * 5. Largest non-excluded monetary value
 */
function isExcludedRecoveryValue(value: number, excludeValues?: number[]): boolean {
  if (excludeValues?.some((excluded) => Math.abs(excluded - value) < 0.001)) {
    return true;
  }
  return false;
}

export function resolveRecoveryInvoiceTotalReference(
  invoice: NormalizedInvoice,
  corpus: string,
  options?: RecoveryTotalOptions
): number | null {
  const exclude = options?.excludeValues;

  const labeled = extractEnglishInvoiceTotal(corpus);
  if (labeled != null && labeled > 0 && !isExcludedRecoveryValue(labeled, exclude)) {
    return labeled;
  }

  const lineSum = sumLineTotals(invoice.items);
  if (lineSum != null && lineSum > 0 && !isExcludedRecoveryValue(lineSum, exclude)) {
    return lineSum;
  }

  return findLargestMonetaryAmount(corpus, exclude);
}

export function findLargestMonetaryAmount(
  corpus: string,
  excludeValues?: number[]
): number | null {
  const amounts = extractMonetaryCandidates(corpus).filter(
    (value) => !isExcludedRecoveryValue(value, excludeValues)
  );
  if (amounts.length === 0) return null;
  return Math.max(...amounts);
}

/** True when extracted total is far below the document's dominant monetary figure. */
export function isInvoiceTotalInconsistent(
  extractedTotal: number,
  corpus: string,
  invoice?: NormalizedInvoice,
  toleranceRatio = INVOICE_TOTAL_TOLERANCE_RATIO
): boolean {
  if (!Number.isFinite(extractedTotal) || extractedTotal <= 0) return true;

  if (isPreDiscountInvoiceAmount(extractedTotal, corpus)) return true;

  if (invoiceTotalMatchesKnownSource(extractedTotal, corpus, invoice)) {
    return false;
  }

  if (isSuspiciousParserInvoiceTotal(extractedTotal, corpus, invoice, findLargestMonetaryAmount(corpus, [extractedTotal]))) {
    const alternate =
      invoice != null
        ? resolveRecoveryInvoiceTotalReference(invoice, corpus, {
            excludeValues: [extractedTotal],
          })
        : extractEnglishInvoiceTotal(corpus) ??
          findLargestMonetaryAmount(corpus, [extractedTotal]);
    if (alternate != null && alternate > extractedTotal) return true;
    if (isParserVatRateAsTotal(extractedTotal, corpus)) return true;
  }

  const reference =
    invoice != null
      ? resolveRecoveryInvoiceTotalReference(invoice, corpus, {
          excludeValues: isParserVatRateAsTotal(extractedTotal, corpus)
            ? [extractedTotal]
            : undefined,
        })
      : extractEnglishInvoiceTotal(corpus) ??
        findLargestMonetaryAmount(
          corpus,
          isParserVatRateAsTotal(extractedTotal, corpus) ? [extractedTotal] : undefined
        );
  if (reference == null || reference <= 0) return false;

  if (Math.abs(reference - extractedTotal) < 0.001 && isParserVatRateAsTotal(extractedTotal, corpus)) {
    return true;
  }

  if (extractedTotal < reference * (1 - toleranceRatio) && extractedTotal < reference * 0.5) {
    return true;
  }

  const relativeDiff = Math.abs(extractedTotal - reference) / reference;
  if (relativeDiff > toleranceRatio && extractedTotal < reference) {
    return true;
  }

  return (
    extractedTotal > reference &&
    relativeDiff > toleranceRatio &&
    isPreDiscountInvoiceAmount(extractedTotal, corpus)
  );
}

/** Parser-reported total before OCR recovery — not resolveInvoiceValue (which may already read labeled totals). */
function parserReportedTotal(invoice: NormalizedInvoice, corpus: string): number {
  const header = roundMoney(
    parseLocaleNumber(invoice.total_value_numeric ?? invoice.total_value)
  );
  const amountEur = parseLocaleNumber(
    (invoice as NormalizedInvoice & { amount_eur?: string | number | null }).amount_eur
  );
  const labeled = extractLabeledInvoiceTotal(corpus);

  if (amountEur > 0 && labeled != null && isTruncatedThousandsFragment(amountEur, labeled)) {
    return amountEur;
  }

  if (header > 0) return header;
  return amountEur > 0 ? roundMoney(amountEur) : 0;
}

export interface InvoiceTotalValidationResult {
  invoice: NormalizedInvoice;
  hasError: boolean;
  corrected: boolean;
}

/** Correct implausible totals from labeled OCR totals; flag when unrecoverable. */
export function validateAndCorrectInvoiceTotal(
  invoice: NormalizedInvoice,
  corpus: string
): InvoiceTotalValidationResult {
  const current = parserReportedTotal(invoice, corpus);
  const excludeParserVat =
    isParserVatRateAsTotal(current, corpus) || isSuspiciousParserInvoiceTotal(current, corpus, invoice)
      ? [current]
      : undefined;

  let reference = resolveRecoveryInvoiceTotalReference(invoice, corpus, {
    excludeValues: excludeParserVat,
  });

  if (reference == null) {
    if (
      isSuspiciousParserInvoiceTotal(current, corpus, invoice) &&
      !invoiceTotalMatchesKnownSource(current, corpus, invoice)
    ) {
      return {
        invoice: {
          ...invoice,
          document_flags: {
            ...invoice.document_flags,
            [TOTAL_VALUE_PARSING_ERROR]: true,
          },
        },
        hasError: true,
        corrected: false,
      };
    }
    return { invoice, hasError: false, corrected: false };
  }

  const inconsistent =
    (current <= 0 || isInvoiceTotalInconsistent(current, corpus, invoice)) &&
    !invoiceTotalMatchesKnownSource(current, corpus, invoice);

  if (!inconsistent) {
    return { invoice, hasError: false, corrected: false };
  }

  const recoveryTotal = reference;

  if (recoveryTotal != null && recoveryTotal > 0 && recoveryTotal !== current) {
    const currency = invoice.currency ?? "EUR";
    const { [TOTAL_VALUE_PARSING_ERROR]: _removed, ...restFlags } = invoice.document_flags ?? {};
    const correctedInvoice: NormalizedInvoice = {
      ...invoice,
      total_value_numeric: recoveryTotal,
      total_value: recoveryTotal.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      amount_eur: recoveryTotal,
      currency,
      document_flags: Object.keys(restFlags).length > 0 ? restFlags : undefined,
    };
    return {
      invoice: recordParserRecovery(correctedInvoice, {
        field: "invoice_value",
        original_value: String(current),
        recovered_value: String(recoveryTotal),
        recovery_source: "OCR_TOTAL_RECOVERY",
      }),
      hasError: false,
      corrected: true,
    };
  }

  if (invoiceTotalMatchesKnownSource(current, corpus, invoice)) {
    return { invoice, hasError: false, corrected: false };
  }

  return {
    invoice: {
      ...invoice,
      document_flags: {
        ...invoice.document_flags,
        [TOTAL_VALUE_PARSING_ERROR]: true,
      },
    },
    hasError: true,
    corrected: false,
  };
}
