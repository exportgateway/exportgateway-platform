import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";

export const INVOICE_DATE_IN_FUTURE = "INVOICE_DATE_IN_FUTURE";
export const INVOICE_DATE_OLDER_THAN_180_DAYS = "INVOICE_DATE_OLDER_THAN_180_DAYS";

export const INVOICE_DATE_READINESS_PENALTIES: Record<string, number> = {
  [INVOICE_DATE_IN_FUTURE]: 50,
  [INVOICE_DATE_OLDER_THAN_180_DAYS]: 10,
};

export interface InvoiceDateReadinessIssue {
  code: typeof INVOICE_DATE_IN_FUTURE | typeof INVOICE_DATE_OLDER_THAN_180_DAYS;
  message: string;
  severity: "error" | "warning";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_AGE_DAYS = 180;

/** Parse invoice date — ISO (YYYY-MM-DD), European DD/MM/YYYY, or US MM/DD/YYYY when unambiguous. */
export function parseInvoiceDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slash = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    let day: number;
    let month: number;

    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysBetweenUtc(earlier: Date, later: Date): number {
  return Math.floor(
    (startOfUtcDay(later).getTime() - startOfUtcDay(earlier).getTime()) / MS_PER_DAY
  );
}

/** Invoice date readiness — future date (ERROR) and age over 180 days (WARNING). */
export function evaluateInvoiceDateReadiness(
  invoice: NormalizedInvoice,
  referenceDate: Date = new Date()
): InvoiceDateReadinessIssue[] {
  const invoiceDate = parseInvoiceDate(invoice.invoice_date);
  if (!invoiceDate) return [];

  const today = startOfUtcDay(referenceDate);
  const normalizedInvoiceDate = startOfUtcDay(invoiceDate);

  if (normalizedInvoiceDate.getTime() > today.getTime()) {
    return [
      {
        code: INVOICE_DATE_IN_FUTURE,
        message:
          "Invoice date is in the future. Export declaration cannot be submitted before the commercial invoice date.",
        severity: "error",
      },
    ];
  }

  const ageDays = daysBetweenUtc(normalizedInvoiceDate, today);
  if (ageDays > MAX_AGE_DAYS) {
    return [
      {
        code: INVOICE_DATE_OLDER_THAN_180_DAYS,
        message:
          "Invoice is older than 180 days. Verify that the correct export document is being used.",
        severity: "warning",
      },
    ];
  }

  return [];
}
