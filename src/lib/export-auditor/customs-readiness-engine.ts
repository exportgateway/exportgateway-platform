/**
 * Customs Readiness Engine — tri-state readiness for export declaration preparation.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { PARSER_MAPPING_FAILURE } from "@/lib/export-auditor/parser-ocr-crosscheck";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
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
import { MISSING_PACKAGE_COUNT } from "@/lib/export-auditor/shipment-readiness";

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
  return issues.some((issue) => resolveIssueCode(issue) === PARSER_MAPPING_FAILURE);
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
    "invoiceSummary" | "shipmentSummary" | "hsCodesDetected" | "issues" | "preferenceOrigin"
  >,
  invoice: NormalizedInvoice
): string[] {
  const reasons: string[] = [];

  if ((report.hsCodesDetected?.length ?? 0) === 0) {
    reasons.push("Missing HS codes");
  }

  if (
    report.issues.some((issue) => {
      const code = resolveIssueCode(issue);
      return isHsCodeMissingCode(code) || HS_MISSING_CODES.has(code);
    })
  ) {
    reasons.push("Missing HS codes");
  }

  if (!hasInvoiceGrossWeight(invoice) && report.shipmentSummary.grossWeightTotal == null) {
    reasons.push("Missing gross weight");
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
