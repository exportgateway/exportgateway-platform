import type { AuditIssue } from "@/lib/export-auditor/types";
import type { PreferenceOriginAnalysis } from "@/lib/export-auditor/types";
import {
  INVOICE_DATE_IN_FUTURE,
  INVOICE_DATE_OLDER_THAN_180_DAYS,
} from "@/lib/export-auditor/invoice-date-readiness";
import {
  MISSING_GROSS_WEIGHT,
  MISSING_NET_WEIGHT,
  MISSING_NET_WEIGHT_MESSAGE,
  MISSING_PACKAGE_COUNT,
} from "@/lib/export-auditor/shipment-readiness";
import {
  DELIVERY_NOTE_DETECTED,
  CERTIFICATE_OF_ORIGIN_REFERENCED,
  PACKING_LIST_REFERENCED,
  EUR1_REFERENCED,
  LTSD_REFERENCED,
  inferSupportingDocumentCodeFromMessage,
} from "@/lib/export-auditor/supporting-documents-detect";
import type { IssueSeverity } from "@/lib/export-auditor/types";

import { PARSER_MAPPING_FAILURE } from "@/lib/export-auditor/parser-ocr-crosscheck";
import {
  TOTAL_VALUE_PARSING_ERROR,
  TOTAL_VALUE_PARSING_ERROR_MESSAGE,
} from "@/lib/export-auditor/invoice-total-validation";
import {
  TOTAL_MISMATCH,
  TOTAL_MISMATCH_MESSAGE,
} from "@/lib/export-auditor/invoice-total-consistency-validator";
import {
  INVALID_HS_FORMAT,
  INVALID_HS_FORMAT_MESSAGE,
  UNKNOWN_HS_CODE,
  UNKNOWN_HS_CODE_MESSAGE,
} from "@/lib/export-auditor/hs-validation-engine";
import {
  EXTRACTION_INTEGRITY_ERROR,
  EXTRACTION_LINE_COUNT_MISMATCH,
  HS_AGGREGATION_MISSING,
  HS_EXTRACTION_FAILURE,
  TRACEABILITY_MISSING,
} from "@/lib/export-auditor/extraction-integrity-validator";

export {
  DELIVERY_NOTE_DETECTED,
  CERTIFICATE_OF_ORIGIN_REFERENCED,
  PACKING_LIST_REFERENCED,
  EUR1_REFERENCED,
  LTSD_REFERENCED,
} from "@/lib/export-auditor/supporting-documents-detect";

export { PARSER_MAPPING_FAILURE };
export { TOTAL_VALUE_PARSING_ERROR, TOTAL_VALUE_PARSING_ERROR_MESSAGE };
export { TOTAL_MISMATCH, TOTAL_MISMATCH_MESSAGE };
export {
  EXTRACTION_INTEGRITY_ERROR,
  EXTRACTION_LINE_COUNT_MISMATCH,
  HS_AGGREGATION_MISSING,
  HS_EXTRACTION_FAILURE,
  HS_EXTRACTION_FAILURE_MESSAGE,
  TRACEABILITY_MISSING,
} from "@/lib/export-auditor/extraction-integrity-validator";
export {
  INVALID_HS_FORMAT,
  INVALID_HS_FORMAT_MESSAGE,
  UNKNOWN_HS_CODE,
  UNKNOWN_HS_CODE_MESSAGE,
} from "@/lib/export-auditor/hs-validation-engine";
export { INVALID_HS_CODE, INVALID_HS_CODE_MESSAGE } from "@/lib/export-auditor/hs-code-normalize";

export const MULTIPLE_HS_CANDIDATES_DETECTED = "MULTIPLE_HS_CANDIDATES_DETECTED";

export const AUTHORIZATION_COUNTRY_MISMATCH = "AUTHORIZATION_COUNTRY_MISMATCH";
export const AUTHORIZATION_COUNTRY_MISMATCH_MESSAGE =
  "Authorised exporter authorization country prefix differs from exporter country";

export const POSITION_DATA_OVERWRITE_ATTEMPT = "POSITION_DATA_OVERWRITE_ATTEMPT";
export const POSITION_DATA_OVERWRITE_CORRUPTION = "POSITION_DATA_OVERWRITE_CORRUPTION";

export const DUPLICATE_POSITION_NUMBER_ON_INVOICE = "DUPLICATE_POSITION_NUMBER_ON_INVOICE";
export const MISSING_POSITION_NUMBER_ON_INVOICE = "MISSING_POSITION_NUMBER_ON_INVOICE";
export const POSITION_SEQUENCE_GAP = "POSITION_SEQUENCE_GAP";
export const POSITION_SEQUENCE_DUPLICATE = "POSITION_SEQUENCE_DUPLICATE";
export const POSITION_QTY_MISMATCH = "POSITION_QTY_MISMATCH";
export const POSITION_UNIT_PRICE_MISMATCH = "POSITION_UNIT_PRICE_MISMATCH";
export const POSITION_VALUE_MISMATCH = "POSITION_VALUE_MISMATCH";
export const DUPLICATE_POSITION_NUMBER = "DUPLICATE_POSITION_NUMBER";
export const MISSING_POSITION_NUMBER = "MISSING_POSITION_NUMBER";
export const POSITION_SEQUENCE_BREAK = "POSITION_SEQUENCE_BREAK";
export const AGGREGATION_TRACEABILITY_FAILURE = "AGGREGATION_TRACEABILITY_FAILURE";

export {
  POSITION_FINGERPRINT_COLLISION,
  HS_STYLE_MISMATCH,
  COO_STYLE_MISMATCH,
} from "@/lib/export-auditor/position-identity-lock";

export const DESCRIPTION_ARTIFACT = "DESCRIPTION_ARTIFACT";
export const DESCRIPTION_ARTIFACT_MESSAGE =
  "Commercial description contains extraction artifacts (style code, HS, qty, or value)";

export const DUPLICATE_LINE_EXTRACTION = "DUPLICATE_LINE_EXTRACTION";
export const DUPLICATE_LINE_EXTRACTION_MESSAGE =
  "Duplicate commercial line items detected during extraction (same style, HS, qty, and value)";

export const EU_DESTINATION = "EU_DESTINATION";
export const MISSING_VAT_ARTICLE = "MISSING_VAT_ARTICLE";
export const HS_CODE_NOT_ON_INVOICE = "HS_CODE_NOT_ON_INVOICE";
/** Informational — AI declaration description may not match invoice line wording. */
export const DESCRIPTION_REVIEW_RECOMMENDED = "DESCRIPTION_REVIEW_RECOMMENDED";
export const DESCRIPTION_REVIEW_RECOMMENDED_MESSAGE =
  "Declaration description may not match the invoice line. Review before filing.";

export const PROFORMA_DETECTED = "PROFORMA_DETECTED";

export const NO_ORIGIN_DECLARATION = "NO_ORIGIN_DECLARATION";
export const MISSING_COUNTRY_OF_ORIGIN = "MISSING_COUNTRY_OF_ORIGIN";

/** Issue codes classified as CRITICAL customs blockers. */
export const CRITICAL_SEVERITY_CODES = new Set([
  "MISSING_EXPORTER",
  "MISSING_CONSIGNEE",
  "MISSING_INVOICE_NUMBER",
  "MISSING_INVOICE_VALUE",
  "MISSING_DESTINATION",
  "MISSING_DESTINATION_COUNTRY",
  EU_DESTINATION,
  "PARSER_MAPPING_FAILURE",
  INVOICE_DATE_IN_FUTURE,
  "INCONSISTENT_TOTALS",
  "INCONSISTENT_INVOICE_TOTAL",
  TOTAL_MISMATCH,
  HS_AGGREGATION_MISSING,
  TRACEABILITY_MISSING,
  EXTRACTION_INTEGRITY_ERROR,
  INVALID_HS_FORMAT,
  HS_EXTRACTION_FAILURE,
  "INCONSISTENT_LINE_TOTALS",
  POSITION_DATA_OVERWRITE_CORRUPTION,
  POSITION_QTY_MISMATCH,
  POSITION_UNIT_PRICE_MISMATCH,
  POSITION_VALUE_MISMATCH,
  DUPLICATE_POSITION_NUMBER,
  MISSING_POSITION_NUMBER,
  POSITION_SEQUENCE_BREAK,
  AGGREGATION_TRACEABILITY_FAILURE,
  "POSITION_FINGERPRINT_COLLISION",
  "HS_STYLE_MISMATCH",
  "COO_STYLE_MISMATCH",
  "DESCRIPTION_ARTIFACT",
]);

/** Issue codes classified as WARNING — review before filing. */
export const WARNING_SEVERITY_CODES = new Set([
  "MISSING_HS_CODE",
  "NO_HS_CODE",
  "NO_HS_CODES",
  "NO_HS_CODES_DETECTED",
  HS_CODE_NOT_ON_INVOICE,
  UNKNOWN_HS_CODE,
  MISSING_GROSS_WEIGHT,
  MISSING_PACKAGE_COUNT,
  "MISSING_INCOTERMS",
  "NO_INCOTERMS",
  TOTAL_VALUE_PARSING_ERROR,
  MULTIPLE_HS_CANDIDATES_DETECTED,
  EXTRACTION_LINE_COUNT_MISMATCH,
  DUPLICATE_LINE_EXTRACTION,
  DUPLICATE_POSITION_NUMBER_ON_INVOICE,
  MISSING_POSITION_NUMBER_ON_INVOICE,
  POSITION_SEQUENCE_GAP,
  POSITION_SEQUENCE_DUPLICATE,
]);

/** Issue codes classified as INFO — informational only. */
export const INFO_SEVERITY_CODES = new Set([
  NO_ORIGIN_DECLARATION,
  "ORIGIN_DECLARATION_MISSING",
  "ORIGIN_DECLARATION_NOT_FOUND",
  "ORIGIN_DECLARATION_REQUIRED",
  "MISSING_ORIGIN_DECLARATION",
  LTSD_REFERENCED,
  PROFORMA_DETECTED,
  DELIVERY_NOTE_DETECTED,
]);

export const HS_CODE_NOT_ON_INVOICE_MESSAGE =
  "HS codes not present on invoice. Manual customs classification required.";

export const NO_ORIGIN_DECLARATION_INFO_MESSAGE = "Preferential origin not claimed.";
export const MISSING_COUNTRY_OF_ORIGIN_INFO_MESSAGE =
  "Country of origin information not provided on invoice.";

export const ORIGIN_DECLARATION_MISSING_CODES = new Set([
  NO_ORIGIN_DECLARATION,
  "ORIGIN_DECLARATION_MISSING",
  "ORIGIN_DECLARATION_NOT_FOUND",
  "ORIGIN_DECLARATION_REQUIRED",
  "MISSING_ORIGIN_DECLARATION",
]);

/** Critical customs blockers — heavily penalized and block "ready" export status. */
export const CRITICAL_BLOCKER_CODES = new Set([
  "MISSING_DESTINATION",
  "MISSING_DESTINATION_COUNTRY",
  "MISSING_INVOICE_VALUE",
  INVOICE_DATE_IN_FUTURE,
  "INCONSISTENT_TOTALS",
  "INCONSISTENT_INVOICE_TOTAL",
  "INCONSISTENT_LINE_TOTALS",
  INVALID_HS_FORMAT,
]);

const HS_CODE_MISSING_CODES = new Set([
  "MISSING_HS_CODE",
  "NO_HS_CODE",
  "NO_HS_CODES",
  "NO_HS_CODES_DETECTED",
]);

const COUNTRY_OF_ORIGIN_MISSING_CODES = new Set([
  "MISSING_COUNTRY_OF_ORIGIN",
  "NO_COUNTRY_OF_ORIGIN",
]);

/** Explicit penalties for minor documentation / optional logistics issues. */
export const MINOR_ISSUE_PENALTIES: Record<string, number> = {
  [MISSING_VAT_ARTICLE]: 5,
  [MISSING_NET_WEIGHT]: 0,
  [NO_ORIGIN_DECLARATION]: 0,
  [MISSING_COUNTRY_OF_ORIGIN]: 0,
  MISSING_DELIVERY_ADDRESS: 3,
  INCOMPLETE_DELIVERY_ADDRESS: 3,
  [INVOICE_DATE_OLDER_THAN_180_DAYS]: 10,
  [HS_CODE_NOT_ON_INVOICE]: 5,
  [DELIVERY_NOTE_DETECTED]: 0,
  [CERTIFICATE_OF_ORIGIN_REFERENCED]: 0,
  [PACKING_LIST_REFERENCED]: 0,
  [EUR1_REFERENCED]: 0,
  [LTSD_REFERENCED]: 0,
  [DESCRIPTION_REVIEW_RECOMMENDED]: 0,
  [TOTAL_VALUE_PARSING_ERROR]: 8,
};

export const CRITICAL_ERROR_PENALTY = 18;
export const CRITICAL_WARNING_PENALTY = 12;
export const DEFAULT_MINOR_WARNING_PENALTY = 3;

export const VAT_ARTICLE_CANONICAL_MESSAGE =
  "Missing VAT exemption article. Invoice does not contain legal VAT exemption wording required for export VAT treatment.";

const VAT_ARTICLE_MESSAGE_PATTERN =
  /vat\s+(?:legal\s+)?article|missing\s+vat\s+article/i;

export function isHsCodeMissingCode(code: string): boolean {
  return HS_CODE_MISSING_CODES.has(code);
}

export function isCountryOfOriginMissingCode(code: string): boolean {
  return COUNTRY_OF_ORIGIN_MISSING_CODES.has(code);
}

export function isOriginDeclarationMissingCode(code: string): boolean {
  return ORIGIN_DECLARATION_MISSING_CODES.has(code);
}

export function isOriginDeclarationMissingMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /no preferential origin declaration/i.test(lower) ||
    /no origin declaration/i.test(lower) ||
    /origin declaration not found/i.test(lower) ||
    /origin declaration missing/i.test(lower) ||
    /origin declaration required/i.test(lower)
  );
}

export function isCountryOfOriginMissingMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /more than 20%.*country of origin/i.test(lower) ||
    /country of origin.*missing/i.test(lower) ||
    /missing.*country of origin/i.test(lower) ||
    /no country of origin/i.test(lower)
  );
}

/** Upgrade origin-declaration findings when preferential evidence is contradictory. */
export function shouldUpgradeOriginDeclarationToWarning(
  preferenceOrigin: PreferenceOriginAnalysis
): boolean {
  const linesClaimPreferential = preferenceOrigin.lineItems.some(
    (line) => line.preferential_origin === "YES"
  );

  if (preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN") {
    return true;
  }

  if (
    preferenceOrigin.authorisedExporterDetected &&
    !preferenceOrigin.originDeclarationFound
  ) {
    return true;
  }

  if (
    preferenceOrigin.evidenceStatus === "UNVERIFIED" &&
    !preferenceOrigin.originDeclarationFound
  ) {
    return true;
  }

  if (linesClaimPreferential && !preferenceOrigin.originDeclarationFound) {
    return true;
  }

  if (
    preferenceOrigin.originDeclarationFound &&
    linesClaimPreferential &&
    preferenceOrigin.lineItems.some((line) => line.preferential_origin === "NO")
  ) {
    return true;
  }

  return false;
}

export function resolveIssueSeverity(issue: AuditIssue): IssueSeverity {
  const code = resolveIssueCode(issue);

  if (CRITICAL_SEVERITY_CODES.has(code)) {
    return "CRITICAL";
  }
  if (WARNING_SEVERITY_CODES.has(code) || code === MISSING_NET_WEIGHT) {
    return "WARNING";
  }
  if (INFO_SEVERITY_CODES.has(code) || issue.type === "info") {
    return "INFO";
  }
  if (issue.type === "error") {
    return "CRITICAL";
  }
  if (issue.type === "warning") {
    return "WARNING";
  }
  return "INFO";
}

export function applyIssueSeverity(issue: AuditIssue): AuditIssue {
  return {
    ...issue,
    severity: resolveIssueSeverity(issue),
  };
}

export function inferIssueCodeFromMessage(message: string): string | undefined {
  if (VAT_ARTICLE_MESSAGE_PATTERN.test(message)) {
    return MISSING_VAT_ARTICLE;
  }
  if (/net weight not found|missing net weight|net shipment weight is missing/i.test(message)) {
    return MISSING_NET_WEIGHT;
  }
  if (/missing hs|no hs code|hs code.*missing|hs codes not present/i.test(message)) {
    return "MISSING_HS_CODE";
  }
  if (/country of origin.*missing|missing.*country of origin|no country of origin/i.test(message)) {
    return "MISSING_COUNTRY_OF_ORIGIN";
  }
  if (/destination.*missing|missing.*destination/i.test(message)) {
    return "MISSING_DESTINATION";
  }
  if (/invoice value.*missing|missing.*invoice value/i.test(message)) {
    return "MISSING_INVOICE_VALUE";
  }
  if (/invoice total differs significantly|total_value_parsing_error/i.test(message)) {
    return TOTAL_VALUE_PARSING_ERROR;
  }
  if (/total mismatch|total differs by more than 1%/i.test(message)) {
    return TOTAL_MISMATCH;
  }
  if (/hs codes detected on invoice but aggregation/i.test(message)) {
    return HS_AGGREGATION_MISSING;
  }
  if (/line items extracted but position traceability/i.test(message)) {
    return TRACEABILITY_MISSING;
  }
  if (/line item count differs from position rows|extraction_line_count_mismatch/i.test(message)) {
    return EXTRACTION_LINE_COUNT_MISMATCH;
  }
  if (/duplicate commercial line|duplicate_line_extraction/i.test(message)) {
    return DUPLICATE_LINE_EXTRACTION;
  }
  if (/position.*overwrite|position_data_overwrite/i.test(message)) {
    return POSITION_DATA_OVERWRITE_CORRUPTION;
  }
  if (/duplicate position number on invoice|duplicate_position_number_on_invoice/i.test(message)) {
    return DUPLICATE_POSITION_NUMBER_ON_INVOICE;
  }
  if (/missing position number on invoice|missing_position_number_on_invoice/i.test(message)) {
    return MISSING_POSITION_NUMBER_ON_INVOICE;
  }
  if (/position sequence gap|position_sequence_gap/i.test(message)) {
    return POSITION_SEQUENCE_GAP;
  }
  if (/position sequence duplicate|position_sequence_duplicate/i.test(message)) {
    return POSITION_SEQUENCE_DUPLICATE;
  }
  if (/position.*qty mismatch|position_qty_mismatch/i.test(message)) {
    return POSITION_QTY_MISMATCH;
  }
  if (/unit price mismatch|position_unit_price_mismatch/i.test(message)) {
    return POSITION_UNIT_PRICE_MISMATCH;
  }
  if (/position.*value mismatch|position_value_mismatch/i.test(message)) {
    return POSITION_VALUE_MISMATCH;
  }
  if (/duplicate position number|duplicate_position_number/i.test(message)) {
    return DUPLICATE_POSITION_NUMBER;
  }
  if (/missing position number|missing_position_number/i.test(message)) {
    return MISSING_POSITION_NUMBER;
  }
  if (/position sequence break|position_sequence_break/i.test(message)) {
    return POSITION_SEQUENCE_BREAK;
  }
  if (/aggregation traceability|aggregation_traceability/i.test(message)) {
    return AGGREGATION_TRACEABILITY_FAILURE;
  }
  if (/authorization country prefix differs|authorization_country_mismatch/i.test(message)) {
    return AUTHORIZATION_COUNTRY_MISMATCH;
  }
  if (/hs\/tariff codes are visible|hs_extraction_failure/i.test(message)) {
    return HS_EXTRACTION_FAILURE;
  }
  if (/invalid hs code/i.test(message)) {
    return INVALID_HS_FORMAT;
  }
  if (/not found in nomenclature/i.test(message)) {
    return UNKNOWN_HS_CODE;
  }
  if (/missing exporter|exporter.*missing/i.test(message)) {
    return "MISSING_EXPORTER";
  }
  if (/missing consignee|consignee.*missing/i.test(message)) {
    return "MISSING_CONSIGNEE";
  }
  if (/missing invoice number|invoice number.*missing/i.test(message)) {
    return "MISSING_INVOICE_NUMBER";
  }
  if (/proforma/i.test(message)) {
    return PROFORMA_DETECTED;
  }
  if (/inconsistent total|total.*inconsistent/i.test(message)) {
    return "INCONSISTENT_TOTALS";
  }
  const supportingDocumentCode = inferSupportingDocumentCodeFromMessage(message);
  if (supportingDocumentCode) {
    return supportingDocumentCode;
  }
  if (/within the eu customs territory|destination is within the eu/i.test(message)) {
    return EU_DESTINATION;
  }
  return undefined;
}

export function resolveIssueCode(issue: AuditIssue): string {
  if (issue.field?.trim()) {
    return issue.field.trim().toUpperCase();
  }
  const fromMessage = inferIssueCodeFromMessage(issue.message);
  if (fromMessage) {
    return fromMessage;
  }
  const codeMatch = issue.message.match(/\b([A-Z][A-Z0-9_]{2,})\b/);
  if (codeMatch) {
    return codeMatch[1];
  }
  return issue.message.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isCriticalBlocker(issue: AuditIssue): boolean {
  const code = resolveIssueCode(issue);
  if (code === TOTAL_VALUE_PARSING_ERROR) {
    return false;
  }
  if (code === HS_EXTRACTION_FAILURE) {
    return false;
  }
  if (HS_CODE_MISSING_CODES.has(code) || code === HS_CODE_NOT_ON_INVOICE) {
    return false;
  }
  if (code === INVALID_HS_FORMAT) {
    return true;
  }
  if (code === UNKNOWN_HS_CODE) {
    return false;
  }
  if (CRITICAL_BLOCKER_CODES.has(code)) {
    return true;
  }
  if (issue.type === "error" && MINOR_ISSUE_PENALTIES[code] == null) {
    return true;
  }
  return false;
}

export function isMinorDocumentationIssue(issue: AuditIssue): boolean {
  const code = resolveIssueCode(issue);
  if (MINOR_ISSUE_PENALTIES[code] != null) {
    return true;
  }
  if (code === MISSING_GROSS_WEIGHT || code === MISSING_PACKAGE_COUNT) {
    return false;
  }
  return issue.type === "warning" || issue.type === "info";
}

export function canonicalIssueMessage(issue: AuditIssue): string {
  const code = resolveIssueCode(issue);
  if (code === MISSING_VAT_ARTICLE) {
    return VAT_ARTICLE_CANONICAL_MESSAGE;
  }
  if (code === MISSING_NET_WEIGHT) {
    return MISSING_NET_WEIGHT_MESSAGE;
  }
  if (code === HS_CODE_NOT_ON_INVOICE) {
    return HS_CODE_NOT_ON_INVOICE_MESSAGE;
  }
  if (code === NO_ORIGIN_DECLARATION) {
    return NO_ORIGIN_DECLARATION_INFO_MESSAGE;
  }
  if (code === MISSING_COUNTRY_OF_ORIGIN) {
    return MISSING_COUNTRY_OF_ORIGIN_INFO_MESSAGE;
  }
  if (code === TOTAL_VALUE_PARSING_ERROR) {
    return TOTAL_VALUE_PARSING_ERROR_MESSAGE;
  }
  if (code === INVALID_HS_FORMAT) {
    return INVALID_HS_FORMAT_MESSAGE;
  }
  if (code === UNKNOWN_HS_CODE) {
    return UNKNOWN_HS_CODE_MESSAGE;
  }
  return issue.message;
}

export function reclassifyHsCodeIssues(
  issues: AuditIssue[],
  hsCodeCount: number
): AuditIssue[] {
  const hasHsExtractionFailure = issues.some(
    (issue) => resolveIssueCode(issue) === HS_EXTRACTION_FAILURE
  );
  if (hasHsExtractionFailure) {
    return issues.filter((issue) => {
      const code = resolveIssueCode(issue);
      return !isHsCodeMissingCode(code) && code !== HS_CODE_NOT_ON_INVOICE;
    });
  }

  if (hsCodeCount > 0) {
    return issues;
  }

  return issues.map((issue) => {
    const code = resolveIssueCode(issue);
    if (!isHsCodeMissingCode(code)) {
      return issue;
    }
    return {
      ...issue,
      id: HS_CODE_NOT_ON_INVOICE,
      field: HS_CODE_NOT_ON_INVOICE,
      type: "info",
      message: HS_CODE_NOT_ON_INVOICE_MESSAGE,
    };
  });
}

const SUPERSEDED_PREFERENTIAL_ISSUE_CODES = new Set([
  "EUR1_RECOMMENDED",
  "NO_AUTHORISED_EXPORTER",
  "NO_AUTHORIZED_EXPORTER",
  "RECOMMEND_EUR1",
]);

function isEur1RecommendationIssue(issue: AuditIssue): boolean {
  const code = resolveIssueCode(issue);
  if (code === "EUR1_RECOMMENDED" || code === "RECOMMEND_EUR1") return true;
  return /recommend\s+eur\.?\s*1|eur\.?\s*1\s+recommended/i.test(issue.message);
}

function isNoAuthorisedExporterIssue(issue: AuditIssue): boolean {
  const code = resolveIssueCode(issue);
  if (code === "NO_AUTHORISED_EXPORTER" || code === "NO_AUTHORIZED_EXPORTER") return true;
  return /no\s+authorised\s+exporter|no\s+authorized\s+exporter/i.test(issue.message);
}

function isSupersededPreferentialIssue(issue: AuditIssue): boolean {
  const code = resolveIssueCode(issue);
  if (code && SUPERSEDED_PREFERENTIAL_ISSUE_CODES.has(code)) {
    return true;
  }
  return isEur1RecommendationIssue(issue) || isNoAuthorisedExporterIssue(issue);
}

/** Remove legacy API preferential warnings superseded by evidence-status workflow. */
export function filterSupersededPreferentialAuditIssues(
  issues: AuditIssue[],
  preferenceOrigin: PreferenceOriginAnalysis
): AuditIssue[] {
  let filtered = issues;

  if (preferenceOrigin.evidenceStatus !== "DECLARED") {
    filtered = filtered.filter((issue) => !isEur1RecommendationIssue(issue));
  }

  const preferentialDeclarationPresent =
    preferenceOrigin.originDeclarationFound ||
    preferenceOrigin.statementOnOriginDetected ||
    preferenceOrigin.evidenceStatus === "DECLARED";

  if (!preferentialDeclarationPresent) {
    filtered = filtered.filter((issue) => !isNoAuthorisedExporterIssue(issue));
  }

  const declaredByEvidence = preferenceOrigin.evidenceStatus === "DECLARED";
  const declaredByAuth =
    preferenceOrigin.authorisedExporterDetected && preferenceOrigin.originDeclarationFound;

  if (declaredByEvidence || declaredByAuth) {
    filtered = filtered.filter((issue) => !isSupersededPreferentialIssue(issue));
  }

  return filtered;
}

export function reclassifyOriginIssues(
  issues: AuditIssue[],
  preferenceOrigin: PreferenceOriginAnalysis
): AuditIssue[] {
  const upgradeOrigin = shouldUpgradeOriginDeclarationToWarning(preferenceOrigin);

  return issues.map((issue) => {
    const code = resolveIssueCode(issue);

    if (isOriginDeclarationMissingCode(code) || isOriginDeclarationMissingMessage(issue.message)) {
      const type = upgradeOrigin ? "warning" : "info";
      return {
        ...issue,
        id: NO_ORIGIN_DECLARATION,
        field: NO_ORIGIN_DECLARATION,
        type,
        message:
          type === "warning"
            ? issue.message.trim() || NO_ORIGIN_DECLARATION_INFO_MESSAGE
            : NO_ORIGIN_DECLARATION_INFO_MESSAGE,
      };
    }

    if (isCountryOfOriginMissingCode(code) || isCountryOfOriginMissingMessage(issue.message)) {
      return {
        ...issue,
        id: MISSING_COUNTRY_OF_ORIGIN,
        field: MISSING_COUNTRY_OF_ORIGIN,
        type: "info",
        message: MISSING_COUNTRY_OF_ORIGIN_INFO_MESSAGE,
      };
    }

    return issue;
  });
}

export function hasOnlyManualHsClassificationReview(issues: AuditIssue[]): boolean {
  const blocking = issues.filter((issue) => issue.type === "error" || issue.type === "warning");
  if (blocking.length > 0) {
    return false;
  }
  const infoIssues = issues.filter((issue) => issue.type === "info");
  if (infoIssues.length === 0) {
    return false;
  }
  const codes = infoIssues.map((issue) => resolveIssueCode(issue));
  if (!codes.includes(HS_CODE_NOT_ON_INVOICE)) {
    return false;
  }
  return codes.every((code) => code === HS_CODE_NOT_ON_INVOICE);
}

export function readinessWarningDedupeKey(message: string): string {
  const inferred = inferIssueCodeFromMessage(message);
  if (inferred) {
    return inferred.toLowerCase();
  }
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mapReadinessWarningToIssue(message: string, index: number): AuditIssue {
  const field = inferIssueCodeFromMessage(message);
  const issue: AuditIssue = {
    id: field ?? `readiness-warn-${index}`,
    type: "warning",
    message,
    field,
  };
  return applyIssueSeverity({
    ...issue,
    message: canonicalIssueMessage(issue),
  });
}

export function getIssuePenalty(issue: AuditIssue, code: string): number {
  if (MINOR_ISSUE_PENALTIES[code] != null) {
    return MINOR_ISSUE_PENALTIES[code];
  }
  if (code === INVOICE_DATE_IN_FUTURE) {
    return 50;
  }
  if (isCriticalBlocker(issue)) {
    return issue.type === "error" ? CRITICAL_ERROR_PENALTY : CRITICAL_WARNING_PENALTY;
  }
  if (issue.type === "error") {
    return CRITICAL_ERROR_PENALTY;
  }
  if (issue.type === "warning") {
    return DEFAULT_MINOR_WARNING_PENALTY;
  }
  return 0;
}
