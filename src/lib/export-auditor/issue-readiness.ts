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

export {
  DELIVERY_NOTE_DETECTED,
  CERTIFICATE_OF_ORIGIN_REFERENCED,
  PACKING_LIST_REFERENCED,
  EUR1_REFERENCED,
  LTSD_REFERENCED,
} from "@/lib/export-auditor/supporting-documents-detect";

export const EU_DESTINATION = "EU_DESTINATION";
export const MISSING_VAT_ARTICLE = "MISSING_VAT_ARTICLE";
export const HS_CODE_NOT_ON_INVOICE = "HS_CODE_NOT_ON_INVOICE";
/** Informational — AI declaration description may not match invoice line wording. */
export const DESCRIPTION_REVIEW_RECOMMENDED = "DESCRIPTION_REVIEW_RECOMMENDED";
export const DESCRIPTION_REVIEW_RECOMMENDED_MESSAGE =
  "Declaration description may not match the invoice line. Review before filing.";
export { PARSER_MAPPING_FAILURE } from "@/lib/export-auditor/parser-ocr-crosscheck";

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
  "INCONSISTENT_LINE_TOTALS",
]);

/** Issue codes classified as WARNING — review before filing. */
export const WARNING_SEVERITY_CODES = new Set([
  "MISSING_HS_CODE",
  "NO_HS_CODE",
  "NO_HS_CODES",
  "NO_HS_CODES_DETECTED",
  HS_CODE_NOT_ON_INVOICE,
  MISSING_GROSS_WEIGHT,
  MISSING_PACKAGE_COUNT,
  "MISSING_INCOTERMS",
  "NO_INCOTERMS",
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
  if (HS_CODE_MISSING_CODES.has(code) || code === HS_CODE_NOT_ON_INVOICE) {
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
  return issue.message;
}

export function reclassifyHsCodeIssues(
  issues: AuditIssue[],
  hsCodeCount: number
): AuditIssue[] {
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
