/**
 * Golden dataset quality gate — blocks GOLDEN_PASS when extraction defects remain.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractHsCodes } from "@/lib/export-auditor/invoice-fields";
import {
  EXTRACTION_LINE_COUNT_MISMATCH,
  HS_EXTRACTION_FAILURE,
  resolveIssueCode,
} from "@/lib/export-auditor/issue-readiness";
import { EXPLICIT_NON_PREFERENTIAL_DECLARATION } from "@/lib/export-auditor/preferential-origin-exception-engine";
import {
  extractNonPreferentialExclusions,
  extractStyleCodesFromLine,
} from "@/lib/export-auditor/preferential-origin-exception-engine";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import { parseLocaleNumber, resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import {
  areCommercialLinesDuplicate,
  estimateSourceCommercialLineCount,
  extractInvoiceTotalUnits,
  GOLDEN_DUPLICATE_RATIO_TOLERANCE,
  GOLDEN_TOTAL_TOLERANCE,
  GOLDEN_UNIT_TOLERANCE,
  sumExtractedUnits,
} from "@/lib/export-auditor/commercial-line-deduplication";
import {
  POSITION_DATA_OVERWRITE_CORRUPTION,
  POSITION_OVERWRITE_CORRUPTION_FLAG,
} from "@/lib/export-auditor/position-lock-engine";
import {
  AGGREGATION_TRACEABILITY_FAILURE,
  DUPLICATE_POSITION_NUMBER,
  MISSING_POSITION_NUMBER,
  POSITION_QTY_MISMATCH,
  POSITION_SEQUENCE_BREAK,
  POSITION_UNIT_PRICE_MISMATCH,
  POSITION_VALUE_MISMATCH,
  runPositionCertification,
} from "@/lib/export-auditor/position-reconciliation-engine";
import { validatePositionIntegrityExact } from "@/lib/export-auditor/position-integrity-engine";
import {
  COO_STYLE_MISMATCH,
  HS_STYLE_MISMATCH,
  POSITION_FINGERPRINT_COLLISION,
} from "@/lib/export-auditor/position-identity-lock";
import type { ExportAuditReport } from "@/lib/export-auditor/types";

export type GoldenQualityFailureCode =
  | "ZERO_QTY_WITH_VALUE"
  | "ZERO_VALUE_WITH_QTY"
  | "EXTRACTION_LINE_COUNT_MISMATCH"
  | "DUPLICATE_LINE_EXTRACTION"
  | "DUPLICATE_RATIO_EXCEEDED"
  | "LINE_SUM_MISMATCH"
  | "UNIT_COUNT_MISMATCH"
  | "POSITION_QTY_MISMATCH"
  | "POSITION_UNIT_PRICE_MISMATCH"
  | "POSITION_VALUE_MISMATCH"
  | "POSITION_DATA_OVERWRITE_CORRUPTION"
  | "DUPLICATE_POSITION_NUMBER"
  | "MISSING_POSITION_NUMBER"
  | "POSITION_SEQUENCE_BREAK"
  | "AGGREGATION_TRACEABILITY_FAILURE"
  | "POSITION_FINGERPRINT_COLLISION"
  | "HS_STYLE_MISMATCH"
  | "COO_STYLE_MISMATCH"
  | "DESCRIPTION_ARTIFACT"
  | "HS_WITHOUT_ORIGIN"
  | "PREFERENTIAL_EXCLUSION_IGNORED"
  | "INVOICE_TOTAL_MISMATCH";

export interface GoldenQualityResult {
  passed: boolean;
  failures: Array<{ code: GoldenQualityFailureCode; message: string }>;
}

function parsePositive(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;
  const parsed = parseLocaleNumber(String(raw).trim());
  return parsed != null && parsed > 0 ? parsed : 0;
}

function preferentialExclusionIgnored(
  invoice: NormalizedInvoice,
  report: ExportAuditReport
): string | null {
  const corpus = buildInvoiceTextCorpus(invoice);
  const { exclusionCodes } = extractNonPreferentialExclusions(corpus);
  if (exclusionCodes.size === 0) return null;

  const items = invoice.items ?? [];
  const prefs = report.preferenceOrigin.lineItems;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const codes = extractStyleCodesFromLine(item);
    const excluded = codes.some((c) => exclusionCodes.has(c));
    if (!excluded) continue;

    const pref = prefs[i];
    if (pref?.preferential_origin === "NO") continue;
    if (pref?.preference_reason?.includes(EXPLICIT_NON_PREFERENTIAL_DECLARATION)) continue;
    return codes.find((c) => exclusionCodes.has(c)) ?? codes[0];
  }
  return null;
}

/** Quality gate for golden dataset — invoice may not receive GOLDEN_PASS when defects remain. */
export function validateGoldenInvoiceQuality(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): GoldenQualityResult {
  const failures: GoldenQualityResult["failures"] = [];
  const items = invoice.items ?? [];

  for (const item of items) {
    const qty = parsePositive(item.quantity);
    const value = parsePositive(item.line_total);
    const position = item.position_number ?? "?";

    if (qty <= 0 && value > 0) {
      failures.push({
        code: "ZERO_QTY_WITH_VALUE",
        message: `Position ${position} has value but qty=0`,
      });
    }
    if (value <= 0 && qty > 0) {
      failures.push({
        code: "ZERO_VALUE_WITH_QTY",
        message: `Position ${position} has qty but value=0`,
      });
    }
  }

  const sourceCommercialLines = estimateSourceCommercialLineCount(invoice);
  if (sourceCommercialLines > 0 && items.length !== sourceCommercialLines) {
    failures.push({
      code: "EXTRACTION_LINE_COUNT_MISMATCH",
      message: `Extracted ${items.length} lines != source ${sourceCommercialLines}`,
    });
  }

  const positionCert = runPositionCertification(invoice, report);
  for (const issue of positionCert.issues) {
    failures.push({
      code: issue.code as GoldenQualityFailureCode,
      message: issue.message,
    });
  }

  const integrity = validatePositionIntegrityExact(invoice, report);
  for (const failure of integrity.failures) {
    failures.push({
      code: failure.code as GoldenQualityFailureCode,
      message: failure.message,
    });
  }

  const issueCodes = new Set(report.issues.map((i) => resolveIssueCode(i)));

  const goldenIntegrityCodes = new Set([
    POSITION_FINGERPRINT_COLLISION,
    HS_STYLE_MISMATCH,
    COO_STYLE_MISMATCH,
    "DESCRIPTION_ARTIFACT",
  ]);
  for (const code of goldenIntegrityCodes) {
    if (issueCodes.has(code)) {
      failures.push({
        code: code as GoldenQualityFailureCode,
        message: `Report issue ${code}`,
      });
    }
  }

  if (Number(invoice.document_flags?.[POSITION_OVERWRITE_CORRUPTION_FLAG] ?? 0) > 0) {
    failures.push({
      code: "POSITION_DATA_OVERWRITE_CORRUPTION",
      message: "Locked position commercial fields were corrupted despite lock",
    });
  }

  if (issueCodes.has(EXTRACTION_LINE_COUNT_MISMATCH)) {
    failures.push({
      code: "EXTRACTION_LINE_COUNT_MISMATCH",
      message: "Line count mismatch flagged on report",
    });
  }

  const goldenBlockCodes = new Set([
    POSITION_QTY_MISMATCH,
    POSITION_UNIT_PRICE_MISMATCH,
    POSITION_VALUE_MISMATCH,
    POSITION_DATA_OVERWRITE_CORRUPTION,
    DUPLICATE_POSITION_NUMBER,
    MISSING_POSITION_NUMBER,
    POSITION_SEQUENCE_BREAK,
    AGGREGATION_TRACEABILITY_FAILURE,
  ]);
  for (const code of issueCodes) {
    if (goldenBlockCodes.has(code)) {
      failures.push({
        code: code as GoldenQualityFailureCode,
        message: `Report issue ${code}`,
      });
    }
  }
  const hasRemainingDuplicates = items.some((item, index) =>
    items.slice(index + 1).some((other) => areCommercialLinesDuplicate(item, other))
  );
  if (hasRemainingDuplicates) {
    failures.push({
      code: "DUPLICATE_LINE_EXTRACTION",
      message: "Duplicate commercial line rows remain after deduplication",
    });
  }

  if (sourceCommercialLines > 0 && items.length > sourceCommercialLines * (1 + GOLDEN_DUPLICATE_RATIO_TOLERANCE)) {
    failures.push({
      code: "DUPLICATE_RATIO_EXCEEDED",
      message: `${items.length} extracted lines exceed source ${sourceCommercialLines} by >${Math.round(GOLDEN_DUPLICATE_RATIO_TOLERANCE * 100)}%`,
    });
  }

  const invoiceTotal = resolveInvoiceValue(invoice);
  const lineSum = items.reduce((sum, item) => sum + parsePositive(item.line_total), 0);
  if (invoiceTotal > 0 && lineSum > 0) {
    const totalDelta = Math.abs(invoiceTotal - lineSum) / invoiceTotal;
    if (totalDelta > GOLDEN_TOTAL_TOLERANCE) {
      failures.push({
        code: "LINE_SUM_MISMATCH",
        message: `Line sum ${lineSum.toFixed(2)} differs from invoice total ${invoiceTotal.toFixed(2)} by ${Math.round(totalDelta * 100)}%`,
      });
    }
  }

  const invoiceUnits = extractInvoiceTotalUnits(invoice);
  const extractedUnits = sumExtractedUnits(items);
  if (invoiceUnits != null && invoiceUnits > 0 && extractedUnits > 0) {
    const unitDelta = Math.abs(invoiceUnits - extractedUnits) / invoiceUnits;
    if (unitDelta > GOLDEN_UNIT_TOLERANCE) {
      failures.push({
        code: "UNIT_COUNT_MISMATCH",
        message: `Extracted units ${extractedUnits} differ from invoice units ${invoiceUnits} by ${Math.round(unitDelta * 100)}%`,
      });
    }
  }

  const hsDetected = extractHsCodes(invoice).length;
  const linesWithHs = items.filter((i) => i.hs_code?.trim()).length;
  if (hsDetected > 0 || linesWithHs > 0) {
    const missingOrigin = items.filter(
      (i) => i.hs_code?.trim() && !i.country_of_origin?.trim()
    ).length;
    if (missingOrigin > 0) {
      failures.push({
        code: "HS_WITHOUT_ORIGIN",
        message: `${missingOrigin} HS line(s) missing country of origin`,
      });
    }
  }

  if (issueCodes.has(HS_EXTRACTION_FAILURE)) {
    failures.push({
      code: "HS_WITHOUT_ORIGIN",
      message: "HS extraction failure on report",
    });
  }

  const ignoredExclusion = preferentialExclusionIgnored(invoice, report);
  if (ignoredExclusion) {
    failures.push({
      code: "PREFERENTIAL_EXCLUSION_IGNORED",
      message: `Non-preferential style ${ignoredExclusion} not marked NO`,
    });
  }

  const invoiceTotalForLegacy = resolveInvoiceValue(invoice);
  const lineSumForLegacy = items.reduce((sum, item) => sum + parsePositive(item.line_total), 0);
  if (invoiceTotalForLegacy > 0 && lineSumForLegacy > 0) {
    const delta = Math.abs(invoiceTotalForLegacy - lineSumForLegacy) / invoiceTotalForLegacy;
    if (delta > 0.05 && report.issues.some((i) => /total.*mismatch/i.test(i.message))) {
      failures.push({
        code: "INVOICE_TOTAL_MISMATCH",
        message: "Invoice total mismatch exceeds tolerance",
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

export function assertGoldenPass(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): void {
  const result = validateGoldenInvoiceQuality(report, invoice);
  if (!result.passed) {
    const summary = result.failures.map((f) => f.message).join("; ");
    throw new Error(`GOLDEN_PASS blocked: ${summary}`);
  }
}
