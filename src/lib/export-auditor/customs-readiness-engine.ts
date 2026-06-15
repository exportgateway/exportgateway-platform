/**
 * Customs Readiness Engine — tri-state readiness for export declaration preparation.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { PARSER_MAPPING_FAILURE } from "@/lib/export-auditor/parser-ocr-crosscheck";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import { isValidConsigneeText } from "@/lib/export-auditor/english-invoice-field-extractor";
import {
  TOTAL_VALUE_PARSING_ERROR,
  TOTAL_VALUE_PARSING_ERROR_MESSAGE,
} from "@/lib/export-auditor/invoice-total-validation";
import {
  TOTAL_MISMATCH,
} from "@/lib/export-auditor/invoice-total-consistency-validator";
import {
  EXTRACTION_INTEGRITY_ERROR,
  HS_AGGREGATION_MISSING,
  HS_EXTRACTION_FAILURE,
  HS_EXTRACTION_FAILURE_MESSAGE,
  TRACEABILITY_MISSING,
} from "@/lib/export-auditor/extraction-integrity-validator";
import { hasInvoiceGrossWeight } from "@/lib/export-auditor/shipment-summary-extractor";
import type {
  AuditIssue,
  CustomsReadinessResult,
  ExportAuditReport,
  PreferenceOriginAnalysis,
} from "@/lib/export-auditor/types";
import {
  EU_DESTINATION,
  isCriticalBlocker,
  isHsCodeMissingCode,
  resolveIssueCode,
  resolveIssueSeverity,
} from "@/lib/export-auditor/issue-readiness";
import {
  hasHighConfidenceHsDiscrepancy,
} from "@/lib/export-auditor/hs-verification-engine";
import { hasHsForCustomsReady } from "@/lib/export-auditor/hs-classification-workflow";
import {
  INVALID_HS_FORMAT,
  UNKNOWN_HS_CODE,
} from "@/lib/export-auditor/hs-validation-engine";
import {
  evaluateReportWeightValidation,
  NET_EXCEEDS_GROSS_MESSAGE,
} from "@/lib/export-auditor/weight-validation";
import { MISSING_PACKAGE_COUNT } from "@/lib/export-auditor/shipment-readiness";
import {
  DUPLICATE_POSITION_NUMBER_ON_INVOICE,
  MISSING_POSITION_NUMBER_ON_INVOICE,
  POSITION_SEQUENCE_GAP,
  POSITION_SEQUENCE_DUPLICATE,
} from "@/lib/export-auditor/invoice-consistency-engine";

const HS_MISSING_CODES = new Set([
  "MISSING_HS_CODE",
  "NO_HS_CODE",
  "NO_HS_CODES",
  "NO_HS_CODES_DETECTED",
]);

function isMissingIncoterms(incoterms: string | null | undefined): boolean {
  const value = incoterms?.trim();
  return !value || value === "—";
}

function hasOcrExtractionFailure(invoice: NormalizedInvoice, issues: AuditIssue[]): boolean {
  if (invoice.document_flags?.[PARSER_MAPPING_FAILURE]) {
    return true;
  }
  if (invoice.document_flags?.[TOTAL_MISMATCH]) {
    return true;
  }
  if (invoice.document_flags?.[EXTRACTION_INTEGRITY_ERROR]) {
    return true;
  }
  if (invoice.document_flags?.[HS_AGGREGATION_MISSING]) {
    return true;
  }
  return issues.some((issue) => {
    const code = resolveIssueCode(issue);
    return (
      code === PARSER_MAPPING_FAILURE ||
      code === TOTAL_MISMATCH ||
      code === HS_AGGREGATION_MISSING ||
      code === TRACEABILITY_MISSING ||
      code === EXTRACTION_INTEGRITY_ERROR
    );
  });
}

function isInvalidDestination(invoice: NormalizedInvoice, issues: AuditIssue[]): boolean {
  const code = invoice.country_code?.trim().toUpperCase();
  const country = invoice.country?.trim();
  if (!code && !country) {
    return true;
  }
  return issues.some((issue) => {
    const issueCode = resolveIssueCode(issue);
    return issueCode === EU_DESTINATION || issueCode === "MISSING_DESTINATION" || issueCode === "MISSING_DESTINATION_COUNTRY";
  });
}

function isMissingInvoiceFoundation(invoice: NormalizedInvoice): string[] {
  const missing: string[] = [];
  if (!invoice.exporter?.trim() || invoice.exporter.trim() === "—") {
    missing.push("Exporter");
  }
  if (!invoice.consignee?.trim() || invoice.consignee.trim() === "—") {
    missing.push("Consignee");
  } else if (!isValidConsigneeText(invoice.consignee)) {
    missing.push("Consignee (invalid — payment QR text rejected)");
  }
  if (!invoice.invoice_number?.trim() || invoice.invoice_number.trim() === "—") {
    missing.push("Invoice Number");
  }
  const value = resolveInvoiceValue(invoice);
  if (!Number.isFinite(value) || value <= 0) {
    missing.push("Invoice Value");
  }
  return missing;
}

function collectReviewReasons(
  report: Pick<
    ExportAuditReport,
    | "invoiceSummary"
    | "shipmentSummary"
    | "hsCodesDetected"
    | "issues"
    | "preferenceOrigin"
    | "hsWorkflowSummary"
    | "hsVerificationSummary"
    | "ocrObservability"
    | "dataRecoveryDiagnostics"
    | "hsAggregationReport"
  >,
  invoice: NormalizedInvoice
): string[] {
  const reasons: string[] = [];

  const documentHsStatus = report.hsWorkflowSummary?.documentHsStatus;
  const hsReady =
    hasHsForCustomsReady(report.hsWorkflowSummary ?? { documentHsStatus: documentHsStatus ?? "MISSING" }) ||
    (report.hsCodesDetected?.length ?? 0) > 0;

  if (!hsReady) {
    reasons.push("Missing HS codes");
  }

  if (
    documentHsStatus === "INVALID_FORMAT" ||
    report.issues.some((issue) => resolveIssueCode(issue) === INVALID_HS_FORMAT)
  ) {
    reasons.push("Invalid HS code format requires correction before filing");
  }

  if (
    documentHsStatus === "UNKNOWN_HS" ||
    report.issues.some((issue) => resolveIssueCode(issue) === UNKNOWN_HS_CODE)
  ) {
    reasons.push("HS code not found in nomenclature index");
  }

  if (report.issues.some((issue) => resolveIssueCode(issue) === HS_EXTRACTION_FAILURE)) {
    reasons.push(HS_EXTRACTION_FAILURE_MESSAGE);
  }

  if (
    documentHsStatus === "MISSING" &&
    report.issues.some((issue) => {
      const code = resolveIssueCode(issue);
      return isHsCodeMissingCode(code) || HS_MISSING_CODES.has(code);
    })
  ) {
    if (!reasons.includes("Missing HS codes")) {
      reasons.push("Missing HS codes");
    }
  }

  if (!hasInvoiceGrossWeight(invoice) && report.shipmentSummary.grossWeightTotal == null) {
    reasons.push("Missing gross weight");
  }

  for (const finding of evaluateReportWeightValidation(report.shipmentSummary)) {
    if (finding.severity === "review") {
      reasons.push(finding.message);
    }
  }

  if (
    report.shipmentSummary.netWeightTotal != null &&
    report.shipmentSummary.grossWeightTotal != null &&
    report.shipmentSummary.netWeightTotal > report.shipmentSummary.grossWeightTotal &&
    !reasons.includes(NET_EXCEEDS_GROSS_MESSAGE)
  ) {
    reasons.push(NET_EXCEEDS_GROSS_MESSAGE);
  }

  if (report.preferenceOrigin.mixedOrigin || report.preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN") {
    reasons.push("Mixed preferential origin on invoice");
  }

  if (
    report.issues.some((issue) => resolveIssueCode(issue) === TOTAL_VALUE_PARSING_ERROR) ||
    invoice.document_flags?.[TOTAL_VALUE_PARSING_ERROR] === true
  ) {
    reasons.push(TOTAL_VALUE_PARSING_ERROR_MESSAGE);
  }

  if (
    report.issues.some((issue) => resolveIssueCode(issue) === TOTAL_MISMATCH) ||
    invoice.document_flags?.[TOTAL_MISMATCH] === true
  ) {
    reasons.push("Invoice total inconsistent across document sources");
  }

  if (
    report.issues.some((issue) => resolveIssueCode(issue) === HS_AGGREGATION_MISSING) ||
    invoice.document_flags?.[HS_AGGREGATION_MISSING] === true
  ) {
    reasons.push("Tariff classification aggregation failed");
  }

  if (
    (report.hsAggregationReport?.hsAggregation?.length ?? 0) === 0 &&
    (report.hsCodesDetected?.length ?? 0) === 0 &&
    (invoice.items?.length ?? 0) > 0 &&
    Boolean(invoice.document_flags?.corpus_hs_detected)
  ) {
    reasons.push("Missing HS codes");
  }

  if (report.dataRecoveryDiagnostics?.highRecoveryRisk) {
    reasons.push(
      `High parser recovery rate (${report.dataRecoveryDiagnostics.recoveryPercentage}% fields recovered via OCR fallback)`
    );
  }

  const completeness = report.ocrObservability?.dataExtractionCompleteness;
  if (completeness != null && completeness < 50) {
    reasons.push("Low data extraction completeness");
  }

  if (
    report.shipmentSummary.packageCount == null &&
    report.shipmentSummary.declarationPackageCount == null
  ) {
    const hasPackageIssue = report.issues.some(
      (issue) => resolveIssueCode(issue) === MISSING_PACKAGE_COUNT
    );
    if (hasPackageIssue || invoice.shipment_summary?.package_count == null) {
      reasons.push("Missing package count");
    }
  }

  if (isMissingIncoterms(report.invoiceSummary.incoterms)) {
    reasons.push("Missing incoterms");
  }

  if (report.preferenceOrigin.evidenceStatus === "UNVERIFIED") {
    reasons.push("Preferential origin unverified");
  }

  if (hasHighConfidenceHsDiscrepancy(report.hsVerificationSummary)) {
    reasons.push("HS classification discrepancy detected");
  }

  const invoiceConsistencyCodes = new Set([
    DUPLICATE_POSITION_NUMBER_ON_INVOICE,
    MISSING_POSITION_NUMBER_ON_INVOICE,
    POSITION_SEQUENCE_GAP,
    POSITION_SEQUENCE_DUPLICATE,
  ]);
  for (const issue of report.issues) {
    const code = resolveIssueCode(issue);
    if (invoiceConsistencyCodes.has(code)) {
      reasons.push(`Invoice position consistency: ${issue.message}`);
    }
  }

  return [...new Set(reasons)];
}

export function evaluateCustomsReadiness(
  report: Pick<
    ExportAuditReport,
    | "invoiceSummary"
    | "shipmentSummary"
    | "hsCodesDetected"
    | "issues"
    | "preferenceOrigin"
    | "ocrObservability"
    | "hsWorkflowSummary"
    | "hsVerificationSummary"
    | "dataRecoveryDiagnostics"
    | "hsAggregationReport"
  >,
  invoice: NormalizedInvoice
): CustomsReadinessResult {
  const blockedReasons: string[] = [];

  blockedReasons.push(...isMissingInvoiceFoundation(invoice));

  if (isInvalidDestination(invoice, report.issues)) {
    blockedReasons.push("Invalid or missing destination");
  }

  if (hasOcrExtractionFailure(invoice, report.issues)) {
    blockedReasons.push("OCR extraction failure");
  }

  if (
    report.hsWorkflowSummary?.documentHsStatus === "INVALID_FORMAT" ||
    report.issues.some((issue) => resolveIssueCode(issue) === INVALID_HS_FORMAT)
  ) {
    blockedReasons.push("Invalid HS code format");
  }

  const hasCriticalIssue = report.issues.some(
    (issue) => resolveIssueSeverity(issue) === "CRITICAL" && isCriticalBlocker(issue)
  );
  if (hasCriticalIssue) {
    const criticalLabels = report.issues
      .filter((issue) => resolveIssueSeverity(issue) === "CRITICAL")
      .map((issue) => issue.message)
      .slice(0, 3);
    if (criticalLabels.length > 0) {
      blockedReasons.push(...criticalLabels);
    }
  }

  const uniqueBlocked = [...new Set(blockedReasons)];

  if (uniqueBlocked.length > 0) {
    return {
      status: "CUSTOMS_BLOCKED",
      label: "Customs Blocked",
      reasons: uniqueBlocked,
    };
  }

  const reviewReasons = collectReviewReasons(report, invoice);

  if (reviewReasons.length > 0) {
    return {
      status: "CUSTOMS_REVIEW",
      label: "Customs Review",
      reasons: reviewReasons,
    };
  }

  return {
    status: "CUSTOMS_READY",
    label: "Customs Ready",
    reasons: ["Required declaration data available"],
  };
}

export function formatCustomsReadinessStatus(status: CustomsReadinessResult["status"]): string {
  switch (status) {
    case "CUSTOMS_READY":
      return "Customs Ready";
    case "CUSTOMS_REVIEW":
      return "Customs Review";
    case "CUSTOMS_BLOCKED":
      return "Customs Blocked";
    default:
      return status;
  }
}
