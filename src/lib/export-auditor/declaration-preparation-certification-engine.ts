/**
 * Declaration preparation export certification — declarant safety quality gate.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import {
  extractNonPreferentialExclusions,
  extractPrimaryStyleCode,
} from "@/lib/export-auditor/preferential-origin-exception-engine";
import { buildAggregationKey } from "@/lib/export-auditor/hs-aggregation-engine";
import {
  buildMrnExportDataset,
  MRN_EXPORT_COLUMNS,
} from "@/lib/export-auditor/mrn-export";
import { formatDeclarationNumericValue } from "@/lib/export-auditor/parse-locale-number";
import { validatePositionIntegrityExact } from "@/lib/export-auditor/position-integrity-engine";
import type { ExportAuditReport } from "@/lib/export-auditor/types";

export interface DeclarationCertificationFailure {
  code: string;
  message: string;
}

export interface DeclarationCertificationResult {
  passed: boolean;
  failures: DeclarationCertificationFailure[];
}

function valueContainsCurrencyText(value: string): boolean {
  return /\bEUR\b|€/i.test(value);
}

/** Fail certification when export is unsafe for customs declaration preparation. */
export function validateDeclarationExportCertification(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): DeclarationCertificationResult {
  const failures: DeclarationCertificationFailure[] = [];
  const dataset = buildMrnExportDataset(report);

  if (!dataset) {
    failures.push({ code: "NO_EXPORT_DATA", message: "Declaration export dataset is empty" });
    return { passed: false, failures };
  }

  const positionIntegrity = validatePositionIntegrityExact(invoice, report);
  if (!positionIntegrity.passed) {
    failures.push({
      code: "POSITION_RECONCILIATION_FAILURE",
      message: positionIntegrity.failures.map((f) => f.message).join("; "),
    });
  }

  const { exclusionCodes } = extractNonPreferentialExclusions(buildInvoiceTextCorpus(invoice));
  const prefs = report.preferenceOrigin.lineItems;
  const items = invoice.items ?? [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const style = extractPrimaryStyleCode(item);
    const pref = prefs[index];
    if (!pref || !style) continue;

    const excluded = exclusionCodes.has(style);
    if (excluded && pref.preferential_origin !== "NO") {
      failures.push({
        code: "NON_PREFERENTIAL_EXCEPTION_PROPAGATION",
        message: `Style ${style} is non-preferential but position ${pref.position_number} marked ${pref.preferential_origin}`,
      });
    }
    if (!excluded && exclusionCodes.size > 0 && pref.preferential_origin === "NO") {
      const reason = pref.preference_reason ?? "";
      if (reason.includes("EXPLICIT_NON_PREFERENTIAL")) {
        failures.push({
          code: "NON_PREFERENTIAL_EXCEPTION_PROPAGATION",
          message: `Style ${style} marked NO without exact non-preferential list match`,
        });
      }
    }
  }

  const aggKeys = new Set<string>();
  for (const row of report.hsAggregationReport.hsAggregation) {
    const key = buildAggregationKey({
      hs_code: row.hsCode,
      preferential_origin: row.preferentialOrigin,
    });
    if (aggKeys.has(key)) {
      failures.push({
        code: "PREFERENTIAL_MERGE",
        message: `Duplicate aggregation bucket ${key}`,
      });
    }
    aggKeys.add(key);

    const sameHsPref = report.hsAggregationReport.hsAggregation.filter(
      (other) =>
        other.hsCode === row.hsCode &&
        other.preferentialOrigin !== row.preferentialOrigin
    );
    if (sameHsPref.length > 0) {
      for (const other of sameHsPref) {
        const shared = row.sourcePositions.filter((pos) =>
          other.sourcePositions.includes(pos)
        );
        if (shared.length > 0) {
          failures.push({
            code: "PREFERENTIAL_MERGE",
            message: `Positions ${shared.join(",")} shared across ${row.preferentialOrigin} and ${other.preferentialOrigin} buckets`,
          });
        }
      }
    }
  }

  for (const row of dataset.rows) {
    if (valueContainsCurrencyText(row.valueFormatted)) {
      failures.push({
        code: "VALUE_CONTAINS_CURRENCY",
        message: `Value column contains currency text: ${row.valueFormatted}`,
      });
    }
    if (!row.unitOfMeasure?.trim()) {
      failures.push({
        code: "MISSING_UOM",
        message: `Missing unit of measure for HS ${row.hsCode}`,
      });
    }
    if (row.netWeightFormatted === "0" || row.netWeightFormatted === "0,000") {
      failures.push({
        code: "INVALID_NET_WEIGHT",
        message: `Net weight must be blank when unknown (HS ${row.hsCode})`,
      });
    }
  }

  const expectedColumns = [
    "HS Code",
    "Description",
    "Country Of Origin",
    "Preferential Origin",
    "Quantity",
    "Unit Of Measure",
    "Net Weight (KG)",
    "Value",
    "Currency",
    "Source Positions",
  ];
  if (MRN_EXPORT_COLUMNS.join("|") !== expectedColumns.join("|")) {
    failures.push({
      code: "EXPORT_COLUMN_MISMATCH",
      message: "Declaration export columns do not match declarant specification",
    });
  }

  const unique = failures.filter(
    (failure, index, all) =>
      all.findIndex((other) => other.code === failure.code && other.message === failure.message) ===
      index
  );

  return { passed: unique.length === 0, failures: unique };
}

export function assertDeclarationExportCertification(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): void {
  const result = validateDeclarationExportCertification(report, invoice);
  if (!result.passed) {
    throw new Error(
      `Declaration export certification failed: ${result.failures.map((f) => f.message).join("; ")}`
    );
  }
}

/** Self-check numeric formatting samples. */
export function assertDeclarationValueFormatting(): boolean {
  return (
    formatDeclarationNumericValue(620.8) === "620,80" &&
    formatDeclarationNumericValue(1171.2) === "1.171,20" &&
    formatDeclarationNumericValue(13872.8) === "13.872,80"
  );
}
