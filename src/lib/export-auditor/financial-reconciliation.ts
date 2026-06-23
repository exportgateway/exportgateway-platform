import type {
  FinancialReconciliationResult,
  FinancialReconciliationSource,
  FinancialReconciliationStatus,
  NormalizedInvoice,
} from "@/lib/export-auditor/api-types";
import {
  parseLocaleNumber,
  roundMoney,
  sumLineTotals,
} from "@/lib/export-auditor/parse-locale-number";
import { extractInvoiceDiscountContext } from "@/lib/export-auditor/invoice-discount-context";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import type { AuditIssue } from "@/lib/export-auditor/types";

export const FINANCIAL_RECONCILIATION_WARNING = "FINANCIAL_RECONCILIATION_WARNING";
export const FINANCIAL_RECONCILIATION_FAIL = "FINANCIAL_RECONCILIATION_FAIL";

const PASS_TOLERANCE_RATIO = 0.01;
const WARNING_TOLERANCE_RATIO = 0.05;

function resolveHeaderInvoiceTotal(invoice: NormalizedInvoice): number | null {
  const candidates = [
    invoice.amount_eur,
    invoice.total_value_numeric,
    invoice.total_value,
  ]
    .map((value) => roundMoney(parseLocaleNumber(value)))
    .filter((value) => value > 0);

  if (candidates.length > 0) {
    return candidates[0]!;
  }

  return null;
}

function uniqueSources(sources: FinancialReconciliationSource[]): FinancialReconciliationSource[] {
  const seen = new Set<string>();
  const out: FinancialReconciliationSource[] = [];
  for (const source of sources) {
    const key = `${source.id}:${source.value.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

function collectComparableSources(invoice: NormalizedInvoice): FinancialReconciliationSource[] {
  const sources: FinancialReconciliationSource[] = [];

  const invoiceTotal = resolveHeaderInvoiceTotal(invoice);
  if (invoiceTotal != null && invoiceTotal > 0) {
    sources.push({
      id: "invoice_total",
      label: "Invoice Total",
      value: invoiceTotal,
    });
  }

  return uniqueSources(sources);
}

function relativeDifference(calculated: number, reference: number): number {
  const base = Math.max(Math.abs(reference), 0.01);
  return Math.abs(calculated - reference) / base;
}

function statusFromRatio(ratio: number | null): FinancialReconciliationStatus {
  if (ratio == null) return "WARNING";
  if (ratio <= PASS_TOLERANCE_RATIO) return "PASS";
  if (ratio <= WARNING_TOLERANCE_RATIO) return "WARNING";
  return "FAIL";
}

function withinPassTolerance(calculated: number, reference: number): boolean {
  return relativeDifference(calculated, reference) <= PASS_TOLERANCE_RATIO;
}

function buildWarning(
  status: FinancialReconciliationStatus,
  difference: number | null,
  ratio: number | null
): string | null {
  if (status === "PASS") return null;
  if (difference == null || ratio == null) {
    return "Financial reconciliation could not compare reconstructed line totals against an invoice total.";
  }
  const percent = (ratio * 100).toFixed(2);
  const diff = difference.toFixed(2);
  if (status === "FAIL") {
    return `Line-value total differs from invoice totals by ${percent}% (${diff}). Likely OCR line extraction failure; review reconstructed invoice items before relying on HS enrichment.`;
  }
  return `Line-value total differs from invoice totals by ${percent}% (${diff}). Review reconstructed invoice values for possible OCR extraction issues.`;
}

export function reconcileInvoiceFinancials(invoice: NormalizedInvoice): FinancialReconciliationResult {
  const calculatedTotal = sumLineTotals(invoice.items);
  const sources = collectComparableSources(invoice);

  if (calculatedTotal == null || calculatedTotal <= 0 || sources.length === 0) {
    const status: FinancialReconciliationStatus = "WARNING";
    return {
      invoice_total: sources[0]?.value ?? null,
      calculated_total: calculatedTotal ?? null,
      difference: null,
      difference_ratio: null,
      validation_status: status,
      compared_sources: sources,
      warning: buildWarning(status, null, null),
      likely_ocr_failure: true,
    };
  }

  let best = sources[0]!;
  let bestRatio = relativeDifference(calculatedTotal, best.value);
  for (const source of sources.slice(1)) {
    const ratio = relativeDifference(calculatedTotal, source.value);
    if (ratio < bestRatio) {
      best = source;
      bestRatio = ratio;
    }
  }

  const discountContext = extractInvoiceDiscountContext(buildInvoiceTextCorpus(invoice));
  if (
    discountContext.preDiscountAmount != null &&
    discountContext.discountAmount != null &&
    best.value > 0
  ) {
    const discountedTotal = roundMoney(
      discountContext.preDiscountAmount - discountContext.discountAmount
    );
    if (
      discountedTotal > 0 &&
      withinPassTolerance(calculatedTotal, discountContext.preDiscountAmount) &&
      withinPassTolerance(discountedTotal, best.value)
    ) {
      return {
        invoice_total: best.value,
        calculated_total: discountedTotal,
        difference: 0,
        difference_ratio: 0,
        validation_status: "PASS",
        compared_sources: sources,
        warning: null,
        likely_ocr_failure: false,
      };
    }
  }

  const difference = roundMoney(calculatedTotal - best.value);
  const absDifference = roundMoney(Math.abs(difference));
  const status = statusFromRatio(bestRatio);

  return {
    invoice_total: best.value,
    calculated_total: calculatedTotal,
    difference: absDifference,
    difference_ratio: bestRatio,
    validation_status: status,
    compared_sources: sources,
    warning: buildWarning(status, absDifference, bestRatio),
    likely_ocr_failure: status !== "PASS",
  };
}

export function financialReconciliationIssues(
  result: FinancialReconciliationResult | undefined
): AuditIssue[] {
  if (!result || result.validation_status === "PASS") return [];
  const id =
    result.validation_status === "FAIL"
      ? FINANCIAL_RECONCILIATION_FAIL
      : FINANCIAL_RECONCILIATION_WARNING;
  return [
    {
      id,
      type: "warning",
      field: id,
      message: result.warning ?? "Financial reconciliation requires review.",
    },
  ];
}
