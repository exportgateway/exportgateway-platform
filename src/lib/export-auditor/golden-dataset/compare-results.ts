/**
 * Field-level comparison of actual vs expected golden invoice results.
 */

import type {
  GoldenCapturedFields,
  GoldenCompareOptions,
  GoldenExpectedResults,
  GoldenFieldDifference,
  GoldenInvoiceCompareResult,
} from "@/lib/export-auditor/golden-dataset/types";
import { GOLDEN_COMPARE_FIELDS } from "@/lib/export-auditor/golden-dataset/types";
import {
  criticalAnomalies,
  detectGoldenAnomalies,
  filterUnexpectedAnomalies,
} from "@/lib/export-auditor/golden-dataset/anomaly-detection";
import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { validateGoldenInvoiceQuality } from "@/lib/export-auditor/golden-validation-engine";

const DEFAULT_VALUE_TOLERANCE = 0.02;

function normalizeString(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compareStrings(
  expected: string | null | undefined,
  actual: string | null | undefined,
  mode: GoldenCompareOptions["stringMatch"] = "normalized"
): boolean {
  if (expected == null && actual == null) return true;
  if (expected == null || actual == null) return false;
  if (mode === "exact") return expected === actual;
  if (mode === "contains") {
    return normalizeString(actual).includes(normalizeString(expected));
  }
  return normalizeString(expected) === normalizeString(actual);
}

function compareNumbers(
  expected: number | null | undefined,
  actual: number | null | undefined,
  tolerance: number
): boolean {
  if (expected == null && actual == null) return true;
  if (expected == null || actual == null) return false;
  return Math.abs(expected - actual) <= tolerance;
}

function compareHsCodes(expected: string[] | undefined, actual: string[] | undefined): boolean {
  const exp = [...(expected ?? [])].sort();
  const act = [...(actual ?? [])].sort();
  if (exp.length !== act.length) return false;
  return exp.every((code, i) => code === act[i]);
}

function compareOrigin(
  expected: GoldenCapturedFields["origin"],
  actual: GoldenCapturedFields["origin"]
): GoldenFieldDifference[] {
  const diffs: GoldenFieldDifference[] = [];
  if (!expected) return diffs;

  if (
    expected.evidenceStatus != null &&
    expected.evidenceStatus !== actual?.evidenceStatus
  ) {
    diffs.push({
      field: "origin.evidenceStatus",
      expected: expected.evidenceStatus,
      actual: actual?.evidenceStatus ?? null,
      message: `origin.evidenceStatus expected ${expected.evidenceStatus}, got ${actual?.evidenceStatus ?? "null"}`,
    });
  }
  if (
    expected.preferentialOriginStatus != null &&
    expected.preferentialOriginStatus !== actual?.preferentialOriginStatus
  ) {
    diffs.push({
      field: "origin.preferentialOriginStatus",
      expected: expected.preferentialOriginStatus,
      actual: actual?.preferentialOriginStatus ?? null,
      message: `origin.preferentialOriginStatus mismatch`,
    });
  }
  if (
    expected.mixedOrigin != null &&
    Boolean(expected.mixedOrigin) !== Boolean(actual?.mixedOrigin)
  ) {
    diffs.push({
      field: "origin.mixedOrigin",
      expected: expected.mixedOrigin,
      actual: actual?.mixedOrigin ?? false,
      message: `origin.mixedOrigin mismatch`,
    });
  }
  return diffs;
}

function compareField(
  field: keyof GoldenCapturedFields,
  expected: GoldenCapturedFields,
  actual: GoldenCapturedFields,
  options: GoldenCompareOptions
): GoldenFieldDifference | null {
  const exp = expected[field];
  const act = actual[field];

  if (exp === undefined) return null;

  if (field === "hsCodes") {
    if (!compareHsCodes(exp as string[], act as string[])) {
      return {
        field,
        expected: exp,
        actual: act,
        message: `hsCodes mismatch`,
      };
    }
    return null;
  }

  if (field === "origin") {
    return null;
  }

  if (field === "invoiceValue" || field === "grossWeight" || field === "netWeight") {
    const tol = options.valueTolerance ?? DEFAULT_VALUE_TOLERANCE;
    if (!compareNumbers(exp as number | null, act as number | null, tol)) {
      return {
        field,
        expected: exp,
        actual: act,
        message: `${field} expected ${exp}, got ${act}`,
      };
    }
    return null;
  }

  if (field === "dataExtractionCompleteness") {
    if (!compareNumbers(exp as number | null, act as number | null, 1)) {
      return {
        field,
        expected: exp,
        actual: act,
        message: `${field} expected ${exp}, got ${act}`,
      };
    }
    return null;
  }

  if (field === "exporter" || field === "consignee") {
    if (!compareStrings(exp as string, act as string, "contains")) {
      return {
        field,
        expected: exp,
        actual: act,
        message: `${field} mismatch`,
      };
    }
    return null;
  }

  if (!compareStrings(String(exp ?? ""), String(act ?? ""), options.stringMatch ?? "normalized")) {
    return {
      field,
      expected: exp,
      actual: act,
      message: `${field} expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`,
    };
  }

  return null;
}

export function compareGoldenResults(
  expectedDoc: GoldenExpectedResults,
  actual: GoldenCapturedFields,
  report: ExportAuditReport,
  invoice: NormalizedInvoice,
  options: GoldenCompareOptions = {}
): GoldenInvoiceCompareResult {
  const expected = expectedDoc.expected;
  const fieldDifferences: GoldenFieldDifference[] = [];

  for (const field of GOLDEN_COMPARE_FIELDS) {
    if (expected[field] === undefined) continue;
    const diff = compareField(field, expected, actual, options);
    if (diff) fieldDifferences.push(diff);
  }

  fieldDifferences.push(...compareOrigin(expected.origin, actual.origin));

  const anomalies = detectGoldenAnomalies(report, invoice);
  const unexpectedAnomalies = filterUnexpectedAnomalies(
    anomalies,
    expectedDoc.allowedAnomalies ?? []
  );
  const critical = criticalAnomalies(unexpectedAnomalies);

  const comparedFields = GOLDEN_COMPARE_FIELDS.filter((f) => expected[f] !== undefined);
  const originFieldCount = expected.origin
    ? Object.values(expected.origin).filter((v) => v != null).length
    : 0;
  const readinessFieldsTotal = comparedFields.length + originFieldCount;
  const readinessFieldsMatched = readinessFieldsTotal - fieldDifferences.length;

  const extractionAccuracy =
    readinessFieldsTotal > 0
      ? Math.round((readinessFieldsMatched / readinessFieldsTotal) * 1000) / 10
      : 100;

  const customsReadinessMatch =
    expected.customsReadiness == null ||
    expected.customsReadiness === actual.customsReadiness;

  const qualityGate = validateGoldenInvoiceQuality(report, invoice);
  if (!qualityGate.passed) {
    for (const failure of qualityGate.failures) {
      fieldDifferences.push({
        field: `quality.${failure.code}`,
        expected: "pass",
        actual: failure.message,
        message: failure.message,
      });
    }
  }

  const passed =
    fieldDifferences.length === 0 && critical.length === 0 && customsReadinessMatch && qualityGate.passed;

  return {
    id: expectedDoc.id,
    label: expectedDoc.label,
    passed,
    fieldDifferences,
    anomalies,
    unexpectedAnomalies,
    criticalAnomalies: critical,
    extractionAccuracy,
    customsReadinessMatch,
    readinessFieldsMatched: Math.max(0, readinessFieldsMatched),
    readinessFieldsTotal,
  };
}

export function formatFieldDifferences(result: GoldenInvoiceCompareResult): string {
  const lines: string[] = [`${result.id} — ${result.label}`];
  for (const diff of result.fieldDifferences) {
    lines.push(`  • ${diff.field}: expected ${JSON.stringify(diff.expected)} → actual ${JSON.stringify(diff.actual)}`);
  }
  for (const anomaly of result.criticalAnomalies) {
    lines.push(`  • [${anomaly.code}] ${anomaly.message}`);
  }
  if (!result.customsReadinessMatch) {
    lines.push(`  • customsReadiness status mismatch`);
  }
  return lines.join("\n");
}
