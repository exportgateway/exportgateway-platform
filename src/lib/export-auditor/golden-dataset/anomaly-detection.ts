/**
 * Automatic anomaly detection for golden invoice validation.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { hasHighConfidenceHsDiscrepancy } from "@/lib/export-auditor/hs-verification-engine";
import { resolveIssueCode } from "@/lib/export-auditor/issue-readiness";
import {
  evaluateReportWeightValidation,
  NET_EXCEEDS_GROSS,
  UNIT_WEIGHT_MISUSE,
} from "@/lib/export-auditor/weight-validation";
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import type { GoldenAnomaly, GoldenAnomalyCode } from "@/lib/export-auditor/golden-dataset/types";

function anomaly(
  code: GoldenAnomalyCode,
  message: string,
  severity: GoldenAnomaly["severity"] = "critical"
): GoldenAnomaly {
  return { code, message, severity };
}

/** Detect production-critical contradictions on a mapped validation report. */
export function detectGoldenAnomalies(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): GoldenAnomaly[] {
  const found: GoldenAnomaly[] = [];
  const { shipmentSummary, preferenceOrigin, invoiceSummary, issues } = report;

  for (const finding of evaluateReportWeightValidation(shipmentSummary)) {
    if (finding.code === NET_EXCEEDS_GROSS) {
      found.push(anomaly("PHYSICAL_WEIGHT_CONTRADICTION", finding.message));
    }
    if (finding.code === UNIT_WEIGHT_MISUSE) {
      found.push(
        anomaly("PHYSICAL_WEIGHT_CONTRADICTION", finding.message, "warning")
      );
    }
  }

  if (
    shipmentSummary.netWeightTotal != null &&
    shipmentSummary.grossWeightTotal != null &&
    shipmentSummary.netWeightTotal > shipmentSummary.grossWeightTotal
  ) {
    const msg = `Net weight (${shipmentSummary.netWeightTotal}) exceeds gross (${shipmentSummary.grossWeightTotal})`;
    if (!found.some((a) => a.message === msg)) {
      found.push(anomaly("PHYSICAL_WEIGHT_CONTRADICTION", msg));
    }
  }

  const headerDest = invoice.country_code?.trim().toUpperCase() ?? null;
  const resolvedDest = invoiceSummary.destinationCountryCode?.trim().toUpperCase() ?? null;
  const consigneeImpliesNonEu = /serbia|srbija|kosovo|kosova|macedonia|bosnia|albania|montenegro|ukraine|moldova|belarus|iceland|norway|switzerland|turkey|türkiye/i.test(
    `${invoice.consignee ?? ""} ${invoice.country ?? ""}`
  );

  if (
    headerDest &&
    resolvedDest &&
    headerDest !== resolvedDest &&
    !["XK", "RS"].includes(headerDest) &&
    !["XK", "RS"].includes(resolvedDest)
  ) {
    found.push(
      anomaly(
        "DESTINATION_COUNTRY_CONTRADICTION",
        `Header destination ${headerDest} contradicts resolved ${resolvedDest}`
      )
    );
  }

  if (
    issues.some((issue) => resolveIssueCode(issue) === "EU_DESTINATION") &&
    consigneeImpliesNonEu &&
    resolvedDest &&
    !["SI", "HR", "AT", "DE", "IT", "FR"].includes(resolvedDest)
  ) {
    found.push(
      anomaly(
        "DESTINATION_COUNTRY_CONTRADICTION",
        "EU destination warning contradicts non-EU consignee country"
      )
    );
  }

  if (hasHighConfidenceHsDiscrepancy(report.hsVerificationSummary)) {
    found.push(
      anomaly(
        "HS_CLASSIFICATION_DISCREPANCY",
        "High-confidence HS classification discrepancy between invoice and wizard"
      )
    );
  }

  if (preferenceOrigin.mixedOrigin || preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN") {
    found.push(
      anomaly(
        "ORIGIN_DECLARATION_CONTRADICTION",
        "Mixed preferential origin — declaration does not apply uniformly to all lines"
      )
    );
  }

  const declared = preferenceOrigin.originDeclarationFound || preferenceOrigin.evidenceStatus === "DECLARED";
  const lines = report.hsAggregationReport?.traceabilityLines ?? [];
  const allNotDeclared =
    lines.length > 0 && lines.every((line) => line.preferentialOrigin === "NOT_DECLARED");
  const allYes = lines.length > 0 && lines.every((line) => line.preferentialOrigin === "YES");
  const hasYes = lines.some((line) => line.preferentialOrigin === "YES");
  const hasNonPreferentialDeclared = lines.some(
    (line) => line.preferentialOrigin === "NOT_DECLARED" || line.preferentialOrigin === "NO"
  );

  if (declared && allNotDeclared) {
    found.push(
      anomaly(
        "ORIGIN_DECLARATION_CONTRADICTION",
        "Origin declaration present but all lines are NOT_DECLARED"
      )
    );
  }

  if (!declared && allYes && preferenceOrigin.evidenceStatus !== "DECLARED") {
    found.push(
      anomaly(
        "ORIGIN_DECLARATION_CONTRADICTION",
        "All lines preferential YES without origin declaration evidence",
        "warning"
      )
    );
  }

  if (hasYes && hasNonPreferentialDeclared && lines.length > 1) {
    found.push(
      anomaly(
        "ORIGIN_DECLARATION_CONTRADICTION",
        "Partial preferential origin — declaration applies to some positions only",
        "warning"
      )
    );
  }

  return found;
}

export function filterUnexpectedAnomalies(
  anomalies: GoldenAnomaly[],
  allowed: GoldenAnomalyCode[] = []
): GoldenAnomaly[] {
  const allowedSet = new Set(allowed);
  return anomalies.filter((a) => !allowedSet.has(a.code));
}

export function criticalAnomalies(anomalies: GoldenAnomaly[]): GoldenAnomaly[] {
  return anomalies.filter((a) => a.severity === "critical");
}
