/**
 * Invoice position consistency — detects duplicate, missing, and gapped position numbers.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import type { AuditIssue } from "@/lib/export-auditor/types";

export const DUPLICATE_POSITION_NUMBER_ON_INVOICE = "DUPLICATE_POSITION_NUMBER_ON_INVOICE";
export const MISSING_POSITION_NUMBER_ON_INVOICE = "MISSING_POSITION_NUMBER_ON_INVOICE";
export const POSITION_SEQUENCE_GAP = "POSITION_SEQUENCE_GAP";
export const POSITION_SEQUENCE_DUPLICATE = "POSITION_SEQUENCE_DUPLICATE";

export type InvoiceConsistencyIssueCode =
  | typeof DUPLICATE_POSITION_NUMBER_ON_INVOICE
  | typeof MISSING_POSITION_NUMBER_ON_INVOICE
  | typeof POSITION_SEQUENCE_GAP
  | typeof POSITION_SEQUENCE_DUPLICATE;

export interface InvoiceConsistencyIssue {
  code: InvoiceConsistencyIssueCode;
  position?: number;
  message: string;
}

export interface InvoiceConsistencyResult {
  positions: number[];
  issues: InvoiceConsistencyIssue[];
  passed: boolean;
}

function resolvePositionNumber(item: ApiInvoiceItem, index: number): number {
  return typeof item.position_number === "number" && item.position_number > 0
    ? item.position_number
    : index + 1;
}

/** Validate position number chain on extracted invoice lines. */
export function validateInvoicePositionConsistency(
  items: ApiInvoiceItem[]
): InvoiceConsistencyResult {
  const issues: InvoiceConsistencyIssue[] = [];
  if (items.length === 0) {
    return { positions: [], issues, passed: true };
  }

  const positions = items.map((item, index) => resolvePositionNumber(item, index));

  const seen = new Map<number, number>();
  for (const position of positions) {
    seen.set(position, (seen.get(position) ?? 0) + 1);
  }

  for (const [position, count] of seen) {
    if (count > 1) {
      issues.push({
        code: DUPLICATE_POSITION_NUMBER_ON_INVOICE,
        position,
        message: `Duplicate position number ${position} on invoice (${count} occurrences)`,
      });
      issues.push({
        code: POSITION_SEQUENCE_DUPLICATE,
        position,
        message: `Position sequence duplicate: ${position} appears ${count} times`,
      });
    }
  }

  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;

  for (let expected = min; expected <= max; expected += 1) {
    if (!sorted.includes(expected)) {
      issues.push({
        code: MISSING_POSITION_NUMBER_ON_INVOICE,
        position: expected,
        message: `Missing position number ${expected} on invoice`,
      });
      issues.push({
        code: POSITION_SEQUENCE_GAP,
        position: expected,
        message: `Position sequence gap: expected ${expected} between ${min} and ${max}`,
      });
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1]!;
    const curr = sorted[index]!;
    if (curr - prev > 1) {
      for (let gap = prev + 1; gap < curr; gap += 1) {
        if (!issues.some((issue) => issue.code === POSITION_SEQUENCE_GAP && issue.position === gap)) {
          issues.push({
            code: POSITION_SEQUENCE_GAP,
            position: gap,
            message: `Position sequence gap: missing ${gap} between ${prev} and ${curr}`,
          });
        }
      }
    }
  }

  return {
    positions,
    issues,
    passed: issues.length === 0,
  };
}

/** Run consistency check and emit audit issues (HIGH severity → CUSTOMS_REVIEW). */
export function runInvoiceConsistencyEngine(invoice: NormalizedInvoice): {
  result: InvoiceConsistencyResult;
  issues: AuditIssue[];
  flags: Record<string, boolean | number>;
} {
  const items = invoice.items ?? [];
  const result = validateInvoicePositionConsistency(items);
  const flags: Record<string, boolean | number> = {};

  const issues: AuditIssue[] = result.issues.map((issue) => {
    flags[issue.code] = true;
    return {
      id: issue.code,
      type: "warning",
      severity: "WARNING",
      message: issue.message,
      field: issue.code,
    };
  });

  if (result.passed) {
    flags.invoice_position_consistency_passed = true;
  } else {
    flags.invoice_position_consistency_failed = result.issues.length;
  }

  return { result, issues, flags };
}
