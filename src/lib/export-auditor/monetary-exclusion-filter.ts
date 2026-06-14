/**
 * Exclude VAT bases, tax percentages, and subtotal lines from invoice-total monetary candidates.
 */

const EXCLUDED_LINE_RE =
  /(?:vat\s+base\s+at|vat\s+\d+\s*%|tax\s+(?:rate|percent)|total\s+w\/o\s+vat|subtotal\s+w\/o|net\s+amount\s+w\/o)/i;

/** Standalone pre-discount Amount line (not Amount to be paid / Amount EUR / VAT Amount). */
const PRE_DISCOUNT_AMOUNT_LINE_RE =
  /^\s*(?:Amount|Znesek)\s*(?!to\s+be\s+paid)(?!EUR\b)(?!with\b)(?!za\s+pla)\s*:?\s/i;

const PRE_DISCOUNT_TOTAL_AMOUNT_LINE_RE = /^\s*Total\s+(?:amount|value)\s*:?\s/i;

const DISCOUNT_LINE_RE = /^\s*(?:Discount|Rabatt|Skonto|Popust)\s*:?\s/i;

/** Advance payments, deposits, and remaining balances — not invoice totals. */
const ADVANCE_PAYMENT_LINE_RE =
  /^\s*(?:Advance\s+payment|Predujem|Avans|Deposit|Paid\s+amount|Already\s+paid|Remaining\s+balance|Ostaje\s+za\s+pla[cć]anje|Ostane\s+za\s+pla[cč]ilo)\s*:?\s/i;

export const TAX_PERCENTAGE_VALUES = new Set([22, 9.5, 19, 20, 21, 25, 10, 7, 5]);

/** True when a monetary token sits on a line that must not contribute to invoice total recovery. */
export function isExcludedMonetaryContext(corpus: string, matchIndex: number): boolean {
  const lineStart = corpus.lastIndexOf("\n", matchIndex - 1) + 1;
  const lineEnd = corpus.indexOf("\n", matchIndex);
  const line = corpus.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  if (EXCLUDED_LINE_RE.test(line)) return true;

  if (/^\s*VAT\s+\d/i.test(line)) return true;

  if (PRE_DISCOUNT_AMOUNT_LINE_RE.test(line)) return true;

  if (DISCOUNT_LINE_RE.test(line)) return true;

  if (PRE_DISCOUNT_TOTAL_AMOUNT_LINE_RE.test(line) && /\b(?:Discount|Rabatt|Popust)\b/i.test(corpus)) {
    return true;
  }

  if (ADVANCE_PAYMENT_LINE_RE.test(line)) return true;

  return false;
}

/** True when a parsed amount is a common tax-rate percentage, not a monetary total. */
export function isTaxPercentageValue(value: number, corpus: string, matchIndex: number): boolean {
  if (!TAX_PERCENTAGE_VALUES.has(value)) return false;

  const lineStart = corpus.lastIndexOf("\n", matchIndex - 1) + 1;
  const lineEnd = corpus.indexOf("\n", matchIndex);
  const line = corpus.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  return /(?:vat|tax|%)/i.test(line);
}
