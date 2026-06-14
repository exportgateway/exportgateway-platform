/**
 * Golden position integrity — exact reconciliation gate (no tolerance).
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  areCommercialLinesDuplicate,
  estimateSourceCommercialLineCount,
} from "@/lib/export-auditor/commercial-line-deduplication";
import { descriptionHasArtifacts } from "@/lib/export-auditor/commercial-description-normalizer";
import {
  buildPositionIdentityFingerprint,
  COO_STYLE_MISMATCH,
  HS_STYLE_MISMATCH,
  POSITION_FINGERPRINT_COLLISION,
  positionIdentityKey,
} from "@/lib/export-auditor/position-identity-lock";
import { parseLocaleNumber, resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import {
  buildPositionTraceabilityAudit,
  type PositionTraceabilityAudit,
} from "@/lib/export-auditor/position-traceability-audit";
import {
  buildSourceCommercialLines,
} from "@/lib/export-auditor/position-reconciliation-engine";
import type { ExportAuditReport } from "@/lib/export-auditor/types";

export interface PositionIntegrityFailure {
  code: string;
  position?: number;
  message: string;
}

export interface PositionIntegrityResult {
  passed: boolean;
  failures: PositionIntegrityFailure[];
  traceability: PositionTraceabilityAudit;
  positionCount: number;
  sourceCount: number;
  totalUnits: number;
  lineSum: number;
  invoiceTotal: number;
}

function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  return parseLocaleNumber(String(raw).trim()) ?? 0;
}

function exactMoney(a: number, b: number): boolean {
  return a.toFixed(2) === b.toFixed(2);
}

function validateFingerprintUniqueness(items: ApiInvoiceItem[]): PositionIntegrityFailure[] {
  const failures: PositionIntegrityFailure[] = [];
  const keys = new Map<string, number>();

  items.forEach((item, index) => {
    const fp = buildPositionIdentityFingerprint(item, index);
    const key = positionIdentityKey(fp);
    const prior = keys.get(key);
    if (prior != null && prior !== fp.position_number) {
      failures.push({
        code: POSITION_FINGERPRINT_COLLISION,
        position: fp.position_number,
        message: `Position fingerprint collision between ${prior} and ${fp.position_number}`,
      });
    } else {
      keys.set(key, fp.position_number);
    }
  });

  return failures;
}

/** Exact golden position integrity — zero tolerance on qty/value/HS/COO/count. */
export function validatePositionIntegrityExact(
  invoice: NormalizedInvoice,
  report?: ExportAuditReport,
  options?: {
    ocrItems?: ApiInvoiceItem[];
    preRecoveryItems?: ApiInvoiceItem[];
  }
): PositionIntegrityResult {
  const failures: PositionIntegrityFailure[] = [];
  const items = invoice.items ?? [];
  const sourceLines = buildSourceCommercialLines(invoice);
  const sourceCount = sourceLines.length || estimateSourceCommercialLineCount(invoice);
  const traceability = buildPositionTraceabilityAudit(invoice, options);

  if (sourceCount > 0 && items.length !== sourceCount) {
    failures.push({
      code: "EXTRACTION_LINE_COUNT_MISMATCH",
      message: `Final ${items.length} positions != source ${sourceCount}`,
    });
  }

  for (const record of traceability.records) {
    if (!record.reconciled) {
      if (!record.qtyExact) {
        failures.push({
          code: "POSITION_QTY_MISMATCH",
          position: record.position,
          message: `Position ${record.position} qty ${record.finalRow.quantity} != source ${record.sourcePdf?.quantity ?? "?"}`,
        });
      }
      if (!record.valueExact) {
        failures.push({
          code: "POSITION_VALUE_MISMATCH",
          position: record.position,
          message: `Position ${record.position} value ${record.finalRow.line_total.toFixed(2)} != source ${record.sourcePdf?.line_total.toFixed(2) ?? "?"}`,
        });
      }
      if (!record.hsExact) {
        failures.push({
          code: HS_STYLE_MISMATCH,
          position: record.position,
          message: `Position ${record.position} HS mismatch vs PDF block`,
        });
      }
      if (!record.cooExact) {
        failures.push({
          code: COO_STYLE_MISMATCH,
          position: record.position,
          message: `Position ${record.position} COO mismatch vs PDF block`,
        });
      }
    }
  }

  failures.push(...validateFingerprintUniqueness(items));

  const hasDupes = items.some((item, index) =>
    items.slice(index + 1).some((other) => areCommercialLinesDuplicate(item, other))
  );
  if (hasDupes) {
    failures.push({
      code: "DUPLICATE_LINE_EXTRACTION",
      message: "Duplicate commercial positions detected in final lines",
    });
  }

  const totalUnits = items.reduce((sum, item) => sum + parseNum(item.quantity), 0);
  const lineSum = items.reduce((sum, item) => sum + parseNum(item.line_total), 0);
  const invoiceTotal = resolveInvoiceValue(invoice);

  if (invoiceTotal > 0 && !exactMoney(lineSum, invoiceTotal)) {
    failures.push({
      code: "LINE_SUM_MISMATCH",
      message: `Line sum ${lineSum.toFixed(2)} != invoice total ${invoiceTotal.toFixed(2)}`,
    });
  }

  items.forEach((item, index) => {
    const desc = item.description ?? "";
    if (descriptionHasArtifacts(desc)) {
      failures.push({
        code: "DESCRIPTION_ARTIFACT",
        position: item.position_number ?? index + 1,
        message: `Position ${item.position_number ?? index + 1} description contains extraction artifacts`,
      });
    }
  });

  const uniqueFailures = failures.filter(
    (failure, index, all) =>
      all.findIndex(
        (other) => other.code === failure.code && other.message === failure.message
      ) === index
  );

  return {
    passed: uniqueFailures.length === 0,
    failures: uniqueFailures,
    traceability,
    positionCount: items.length,
    sourceCount,
    totalUnits,
    lineSum,
    invoiceTotal,
  };
}

export function assertPositionIntegrityExact(
  invoice: NormalizedInvoice,
  report?: ExportAuditReport
): void {
  const result = validatePositionIntegrityExact(invoice, report);
  if (!result.passed) {
    throw new Error(
      `Position integrity failed: ${result.failures.map((f) => f.message).join("; ")}`
    );
  }
}
