import type {
  ExportAuditReport,
  AuditIssue,
  RecommendedAction,
  InvoiceSummary,
  PreferenceOriginAnalysis,
  ShipmentSummary,
  DeliveryAddress,
} from "@/lib/export-auditor/types";
import { resolveCountryFromText } from "@/lib/export-auditor/country-resolution";
import { evaluatePackageCountDecision, formatDeclarationPackageCount } from "@/lib/export-auditor/package-count-decision-engine";
import { parseLocaleNumber, resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import type {
  AuditReportResponse,
  ApiAuditIssue,
  DispositionResponse,
  NormalizedInvoice,
  PreferenceOriginResponse,
  ReadinessResponse,
  ShipmentSummary as ApiShipmentSummary,
  DeliveryAddress as ApiDeliveryAddress,
} from "@/lib/export-auditor/api-types";
import {
  countLineItems,
  extractCountriesOfOrigin,
  extractHsCodes,
  formatCountryDisplay,
  isDestinationOutsideEu,
} from "@/lib/export-auditor/invoice-fields";
import { adjustReadinessScore } from "@/lib/export-auditor/readiness-score";
import {
  filterPreferentialReviewRecommendations,
  isDocumentationOnlyWarnings,
  isExportDeclarationReady,
  isInvoiceFoundationComplete,
  isPreferentialOriginConfirmed,
  isPreferentialOriginAnalyzed,
  isPreferentialReviewRecommendation,
  isPreferenceNotDeclared,
  shouldIgnorePreferenceWorkflow,
  shouldSuppressEur1Recommendations,
  REQUEST_MISSING_VAT_ARTICLE,
} from "@/lib/export-auditor/preferential-export-readiness";
import {
  evaluatePreferentialOriginDecision,
} from "@/lib/export-auditor/preferential-origin-decision-engine";
import {
  collectPreferenceDetectionCorpus,
  detectRexRegistration,
  detectStatementOnOrigin,
  resolvePreferenceScheme,
} from "@/lib/export-auditor/preference-scheme";
import {
  deriveDispositionOriginSummary,
  formatDispositionOriginSummary,
  sanitizeDispositionOriginText,
} from "@/lib/export-auditor/customs-disposition-summary";
import { hasVatExemptionArticle } from "@/lib/export-auditor/vat-article-detection";
import {
  canonicalIssueMessage,
  EU_DESTINATION,
  hasOnlyManualHsClassificationReview,
  inferIssueCodeFromMessage,
  isCountryOfOriginMissingCode,
  isCriticalBlocker,
  isHsCodeMissingCode,
  mapReadinessWarningToIssue,
  MISSING_VAT_ARTICLE,
  readinessWarningDedupeKey,
  reclassifyHsCodeIssues,
  reclassifyOriginIssues,
  filterSupersededPreferentialAuditIssues,
  isOriginDeclarationMissingCode,
  isOriginDeclarationMissingMessage,
  resolveIssueCode,
  applyIssueSeverity,
  PARSER_MAPPING_FAILURE,
  TOTAL_VALUE_PARSING_ERROR,
  TOTAL_VALUE_PARSING_ERROR_MESSAGE,
  AUTHORIZATION_COUNTRY_MISMATCH,
  AUTHORIZATION_COUNTRY_MISMATCH_MESSAGE,
  MULTIPLE_HS_CANDIDATES_DETECTED,
} from "@/lib/export-auditor/issue-readiness";
import {
  detectSupportingDocuments,
  filterSupportingDocumentIssues,
} from "@/lib/export-auditor/supporting-documents-detect";
import { runPreferentialOriginEngine } from "@/lib/export-auditor/preferential-origin-engine";
import { evaluateInvoiceDateReadiness } from "@/lib/export-auditor/invoice-date-readiness";
import {
  evaluateShipmentReadiness,
  MISSING_GROSS_WEIGHT,
  MISSING_NET_WEIGHT,
  MISSING_PACKAGE_COUNT,
} from "@/lib/export-auditor/shipment-readiness";
import { buildShipmentExtractionDiagnostics } from "@/lib/export-auditor/shipment-extraction-diagnostics";
import { runHsAggregationEngine } from "@/lib/export-auditor/hs-aggregation-engine";
import { buildPositionTraceability } from "@/lib/export-auditor/position-traceability";
import { isMrnExportReady } from "@/lib/export-auditor/mrn-export";
import { resolveInvoiceGrossWeight, hasInvoiceGrossWeight } from "@/lib/export-auditor/shipment-summary-extractor";
import { applyEnterpriseCommercialSummary } from "@/lib/export-auditor/enterprise-commercial-summary";
import {
  buildOriginCountriesContext,
  resolveOriginCountriesDisplay,
} from "@/lib/export-auditor/origin-countries-summary";
import { computeConfidenceScores } from "@/lib/export-auditor/confidence-score-engine";
import {
  validateCustomsExtractionIntegrity,
  logExtractionIntegrityForensic,
  HS_AGGREGATION_MISSING,
  TRACEABILITY_MISSING,
  EXTRACTION_INTEGRITY_ERROR,
} from "@/lib/export-auditor/extraction-integrity-validator";
import {
  validateInvoiceTotalConsistency,
  TOTAL_MISMATCH,
} from "@/lib/export-auditor/invoice-total-consistency-validator";
import {
  computePreferentialAllocation,
  computeMixedOriginTotals,
} from "@/lib/export-auditor/preferential-allocation-engine";
import { applyLineDerivedOriginStatus } from "@/lib/export-auditor/mixed-origin-status-engine";
import { resolveUnifiedReadinessFromParts } from "@/lib/export-auditor/unified-readiness";
import {
  isEuDestinationCountry,
  logDestinationCountryDiagnostics,
  resolveDestinationWithDiagnostics,
} from "@/lib/export-auditor/destination-country";
import { buildOcrObservability } from "@/lib/export-auditor/ocr-observability";
import { aggregateOcrSessionMetrics } from "@/lib/export-auditor/ocr-session-metrics";
import { evaluateCustomsReadiness } from "@/lib/export-auditor/customs-readiness-engine";
import { buildDataRecoveryDiagnostics, applyRecoveryReadinessDowngrade } from "@/lib/export-auditor/data-recovery-diagnostics";
import { evaluateDeclarationReadiness } from "@/lib/export-auditor/declaration-readiness-check";
import {
  applyHsClassificationSanity,
  MULTIPLE_HS_CANDIDATES_MESSAGE,
} from "@/lib/export-auditor/hs-classification-sanity";
import {
  buildHsWorkflowSummary,
  buildLineHsClassifications,
  collectInvalidHsCodeIssues,
  collectUnknownHsCodeIssues,
  deriveAggregationHsMetadata,
} from "@/lib/export-auditor/hs-classification-workflow";
import {
  buildHsVerificationSummary,
  deriveAggregationHsVerification,
  enrichTraceabilityWithVerification,
} from "@/lib/export-auditor/hs-verification-engine";
import type {
  HsAggregationReport,
} from "@/lib/export-auditor/types";

export interface ExportAuditorMapExtras {
  readiness?: ReadinessResponse;
  disposition?: DispositionResponse;
  preferenceOrigin?: PreferenceOriginResponse;
  pageCount?: number;
}

function parseNumber(value: string | number | null | undefined): number {
  return parseLocaleNumber(value);
}

function mapAuditStatus(
  score: number,
  errorCount: number,
  hsCodeCount: number,
  goodsLines: number,
  hasBlockingIssue: boolean
): ExportAuditReport["auditStatus"] {
  return resolveUnifiedReadinessFromParts({
    readinessScore: score,
    errorCount,
    hsCodeCount,
    goodsLines,
    hasBlockingIssue,
  }).auditStatus;
}

function mapSeverity(severity: string): AuditIssue["type"] {
  const upper = severity.toUpperCase();
  if (upper === "ERROR") return "error";
  if (upper === "INFO") return "info";
  return "warning";
}

const ISSUE_SEVERITY_RANK: Record<AuditIssue["type"], number> = {
  error: 3,
  warning: 2,
  info: 1,
};

const ORIGIN_MISSING_ROOT_CODES = new Set([
  "NO_ORIGIN_DECLARATION",
  "ORIGIN_DECLARATION_MISSING",
  "ORIGIN_DECLARATION_NOT_FOUND",
  "ORIGIN_DECLARATION_REQUIRED",
  "MISSING_ORIGIN_DECLARATION",
]);

function issueRootCode(issue: AuditIssue): string {
  return resolveIssueCode(issue);
}

function normalizeIssue(issue: AuditIssue): AuditIssue {
  const field = issue.field ?? inferIssueCodeFromMessage(issue.message);
  return applyIssueSeverity({
    ...issue,
    field,
    message: canonicalIssueMessage({ ...issue, field }),
  });
}

function shouldPreferIssue(candidate: AuditIssue, existing: AuditIssue): boolean {
  if (ISSUE_SEVERITY_RANK[candidate.type] > ISSUE_SEVERITY_RANK[existing.type]) {
    return true;
  }
  if (ISSUE_SEVERITY_RANK[candidate.type] < ISSUE_SEVERITY_RANK[existing.type]) {
    return false;
  }
  if (candidate.field && !existing.field) {
    return true;
  }
  return candidate.message.length > existing.message.length;
}

function deduplicateIssues(issues: AuditIssue[]): AuditIssue[] {
  const byRoot = new Map<string, AuditIssue>();
  for (const issue of issues) {
    const normalized = normalizeIssue(issue);
    const root = issueRootCode(normalized);
    const existing = byRoot.get(root);
    if (!existing || shouldPreferIssue(normalized, existing)) {
      byRoot.set(root, normalized);
    }
  }
  return Array.from(byRoot.values());
}

function deduplicateWarningStrings(warnings: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const warning of warnings) {
    const key = readinessWarningDedupeKey(warning);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(warning);
    }
  }
  return result;
}

function isOriginDeclarationMissingIssue(issue: AuditIssue): boolean {
  const root = issueRootCode(issue);
  if (isOriginDeclarationMissingCode(root)) {
    return true;
  }
  return isOriginDeclarationMissingMessage(issue.message);
}

function filterFalseValidationWarnings(
  issues: AuditIssue[],
  preferenceOrigin: PreferenceOriginAnalysis
): AuditIssue[] {
  if (!preferenceOrigin.originDeclarationFound) {
    return issues;
  }

  return issues.filter((issue) => {
    const root = issueRootCode(issue);
    if (ORIGIN_MISSING_ROOT_CODES.has(root)) {
      return false;
    }
    if (isCountryOfOriginMissingCode(root)) {
      return false;
    }
    if (isOriginDeclarationMissingIssue(issue)) {
      return false;
    }
    const message = issue.message.toLowerCase();
    return !(
      /missing.*country of origin|no country of origin|country of origin.*missing/i.test(
        message
      )
    );
  });
}

function isDeclarationPackageCountResolved(invoice: NormalizedInvoice): boolean {
  const shipment = invoice.shipment_summary;
  const decision = evaluatePackageCountDecision({
    colliCount: shipment?.package_count ?? null,
    palletCount: shipment?.pallet_count ?? null,
    packageType: shipment?.package_type ?? null,
  });
  return decision.declarationPackageCount != null;
}

function filterFalseEuDestinationWarnings(
  issues: AuditIssue[],
  destinationCountryCode: string | null | undefined
): AuditIssue[] {
  if (isEuDestinationCountry(destinationCountryCode)) {
    return issues;
  }
  return issues.filter((issue) => {
    const root = issueRootCode(issue);
    if (root === EU_DESTINATION) return false;
    return !/destination is within the eu customs territory|within the eu customs territory/i.test(
      issue.message
    );
  });
}

function filterFalseEuDestinationReadinessWarnings(
  warnings: string[],
  destinationCountryCode: string | null | undefined
): string[] {
  if (isEuDestinationCountry(destinationCountryCode)) {
    return warnings;
  }
  return warnings.filter((warning) => {
    const code = inferIssueCodeFromMessage(warning);
    if (code === EU_DESTINATION) return false;
    return !/destination is within the eu customs territory|within the eu customs territory/i.test(
      warning
    );
  });
}

function filterResolvedShipmentWarnings(
  issues: AuditIssue[],
  invoice: NormalizedInvoice
): AuditIssue[] {
  const shipment = invoice.shipment_summary;
  const grossResolved = hasInvoiceGrossWeight(invoice);
  const packageResolved = isDeclarationPackageCountResolved(invoice);

  return issues.filter((issue) => {
    const root = issueRootCode(issue);
    if (root === MISSING_GROSS_WEIGHT && grossResolved) {
      return false;
    }
    if (root === MISSING_NET_WEIGHT && shipment?.net_weight_total != null) {
      return false;
    }
    if (root === MISSING_PACKAGE_COUNT && packageResolved) {
      return false;
    }
    const message = issue.message.toLowerCase();
    if (grossResolved && /missing gross weight|gross shipment weight is missing/i.test(message)) {
      return false;
    }
    if (shipment?.net_weight_total != null && /missing net weight|net shipment weight is missing/i.test(message)) {
      return false;
    }
    if (packageResolved && /missing package count|package count is missing/i.test(message)) {
      return false;
    }
    return true;
  });
}

function filterResolvedHsCodeWarnings(
  issues: AuditIssue[],
  hsCodeCount: number
): AuditIssue[] {
  if (hsCodeCount === 0) return issues;
  return issues.filter((issue) => {
    const root = issueRootCode(issue);
    if (isHsCodeMissingCode(root)) return false;
    if (/no hs code|missing hs|hs code.*missing|hs codes not present|hs codes not detected/i.test(issue.message)) {
      return false;
    }
    return true;
  });
}

function filterGenericShipmentWarningsWhenNoOcrData(
  issues: AuditIssue[],
  invoice: NormalizedInvoice
): AuditIssue[] {
  if (!buildShipmentExtractionDiagnostics(invoice).noOcrShipmentData) {
    return issues;
  }
  return issues.filter((issue) => {
    const root = issueRootCode(issue);
    if (
      root === MISSING_GROSS_WEIGHT ||
      root === MISSING_PACKAGE_COUNT ||
      root === MISSING_NET_WEIGHT
    ) {
      return false;
    }
    const message = issue.message.toLowerCase();
    return !(
      /missing gross weight|gross shipment weight is missing/i.test(message) ||
      /missing package count|package count is missing/i.test(message) ||
      /missing net weight|net weight not found/i.test(message)
    );
  });
}

function filterResolvedShipmentReadinessWarnings(
  warnings: string[],
  invoice: NormalizedInvoice
): string[] {
  if (buildShipmentExtractionDiagnostics(invoice).noOcrShipmentData) {
    return warnings.filter((warning) => {
      const code = inferIssueCodeFromMessage(warning);
      if (
        code === MISSING_GROSS_WEIGHT ||
        code === MISSING_PACKAGE_COUNT ||
        code === MISSING_NET_WEIGHT
      ) {
        return false;
      }
      const lower = warning.toLowerCase();
      return !(
        /missing gross weight|gross shipment weight is missing/i.test(lower) ||
        /missing package count|package count is missing/i.test(lower) ||
        /missing net weight|net weight not found/i.test(lower)
      );
    });
  }

  const shipment = invoice.shipment_summary;
  const grossResolved = hasInvoiceGrossWeight(invoice);
  const packageResolved = isDeclarationPackageCountResolved(invoice);

  return warnings.filter((warning) => {
    const code = inferIssueCodeFromMessage(warning);
    if (code === MISSING_GROSS_WEIGHT && grossResolved) {
      return false;
    }
    if (code === MISSING_NET_WEIGHT && shipment?.net_weight_total != null) {
      return false;
    }
    if (code === MISSING_PACKAGE_COUNT && packageResolved) {
      return false;
    }
    const lower = warning.toLowerCase();
    if (grossResolved && /missing gross weight/i.test(lower)) {
      return false;
    }
    if (shipment?.net_weight_total != null && /missing net weight/i.test(lower)) {
      return false;
    }
    if (packageResolved && /missing package count/i.test(lower)) {
      return false;
    }
    return true;
  });
}

function mapAuthorisationCountryIssues(
  preferenceOrigin: PreferenceOriginAnalysis,
  invoice: NormalizedInvoice
): AuditIssue[] {
  if (
    !preferenceOrigin.authorisedExporterDetected ||
    preferenceOrigin.authorisedExporterCountryMatch !== false
  ) {
    return [];
  }
  const exporterCode =
    resolveCountryFromText(invoice.exporter).country_code ?? "?";
  return [
    applyIssueSeverity({
      id: AUTHORIZATION_COUNTRY_MISMATCH,
      type: "warning",
      message: `${AUTHORIZATION_COUNTRY_MISMATCH_MESSAGE} (authorization ${preferenceOrigin.authorisationCountry ?? "?"} vs exporter ${exporterCode})`,
      field: AUTHORIZATION_COUNTRY_MISMATCH,
    }),
  ];
}

function missingFieldsFromInvoice(invoice: NormalizedInvoice, audit?: AuditReportResponse): string[] {
  const missing: string[] = [];
  if (!invoice.invoice_number?.trim()) missing.push("Invoice number");
  if (!invoice.exporter?.trim()) missing.push("Exporter");
  if (!invoice.consignee?.trim()) missing.push("Consignee");
  if (!invoice.country?.trim() && !invoice.country_code?.trim()) missing.push("Destination country");
  if (!invoice.incoterms?.trim()) missing.push("Incoterms");
  if (parseNumber(invoice.total_value_numeric ?? invoice.total_value) <= 0) {
    missing.push("Invoice value");
  }
  for (const err of audit?.readiness.errors ?? []) {
    if (!missing.includes(err)) missing.push(err);
  }
  return missing;
}

function mapDocumentFlagIssues(invoice: NormalizedInvoice): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const flags = invoice.document_flags ?? {};

  if (flags[PARSER_MAPPING_FAILURE] === true) {
    issues.push(
      applyIssueSeverity({
        id: PARSER_MAPPING_FAILURE,
        type: "error",
        message: "OCR parser failed to map invoice fields — manual review required",
        field: PARSER_MAPPING_FAILURE,
      })
    );
  }

  if (flags[TOTAL_VALUE_PARSING_ERROR] === true) {
    issues.push(
      applyIssueSeverity({
        id: TOTAL_VALUE_PARSING_ERROR,
        type: "warning",
        message: TOTAL_VALUE_PARSING_ERROR_MESSAGE,
        field: TOTAL_VALUE_PARSING_ERROR,
      })
    );
  }

  if (flags[TOTAL_MISMATCH] === true) {
    issues.push(
      applyIssueSeverity({
        id: TOTAL_MISMATCH,
        type: "error",
        message: "Invoice total inconsistent across document sources (TOTAL_MISMATCH)",
        field: TOTAL_MISMATCH,
      })
    );
  }

  if (flags[HS_AGGREGATION_MISSING] === true) {
    issues.push(
      applyIssueSeverity({
        id: HS_AGGREGATION_MISSING,
        type: "error",
        message: "HS codes detected on invoice but aggregation was not generated",
        field: HS_AGGREGATION_MISSING,
      })
    );
  }

  if (flags[TRACEABILITY_MISSING] === true) {
    issues.push(
      applyIssueSeverity({
        id: TRACEABILITY_MISSING,
        type: "error",
        message: "Line items extracted but position traceability table is empty",
        field: TRACEABILITY_MISSING,
      })
    );
  }

  if (flags[EXTRACTION_INTEGRITY_ERROR] === true) {
    issues.push(
      applyIssueSeverity({
        id: EXTRACTION_INTEGRITY_ERROR,
        type: "error",
        message: "Customs extraction integrity check failed",
        field: EXTRACTION_INTEGRITY_ERROR,
      })
    );
  }

  return issues;
}

function mapIssues(
  auditIssues: ApiAuditIssue[] | undefined,
  readinessWarnings: string[] = [],
  shipmentWarnings: AuditIssue[] = []
): AuditIssue[] {
  const fromAudit = (auditIssues ?? []).map((issue, index) => ({
    id: issue.code || `issue-${index}`,
    type: mapSeverity(issue.severity),
    message: issue.message,
    field: issue.code,
  }));

  const fromReadiness = readinessWarnings.map((message, index) =>
    mapReadinessWarningToIssue(message, index)
  );

  return [...fromAudit, ...shipmentWarnings, ...fromReadiness];
}

function mapShipmentSummary(
  invoice: NormalizedInvoice,
  audit?: AuditReportResponse
): ShipmentSummary {
  const auditShip = audit?.shipment_summary;
  const invoiceShip = invoice.shipment_summary;
  const auditHasData =
    auditShip != null &&
    (auditShip.package_count != null ||
      auditShip.gross_weight_total != null ||
      auditShip.net_weight_total != null);
  const source: ApiShipmentSummary | undefined = auditHasData ? auditShip : invoiceShip ?? auditShip;
  const resolvedGross = resolveInvoiceGrossWeight(invoice);
  const colliCount = source?.package_count ?? null;
  const palletCount = source?.pallet_count ?? null;
  const packageDecision = evaluatePackageCountDecision({
    colliCount,
    palletCount,
    packageType: source?.package_type ?? null,
  });

  return {
    packageCount: packageDecision.colliCount ?? colliCount,
    packageType:
      packageDecision.declarationPackageType === "CT"
        ? "CT"
        : packageDecision.declarationPackageType === "COLLI"
          ? "COLLI"
          : packageDecision.declarationPackageType === "PAL"
            ? "PAL"
            : source?.package_type ?? null,
    grossWeightTotal: resolvedGross.gross_weight_total ?? source?.gross_weight_total ?? null,
    grossWeightUnit: resolvedGross.gross_weight_unit ?? source?.gross_weight_unit ?? null,
    grossWeightSource: invoiceShip?.gross_weight_source ?? null,
    grossWeightType: invoiceShip?.gross_weight_type ?? null,
    netWeightTotal:
      invoiceShip?.net_weight_total ??
      source?.net_weight_total ??
      null,
    netWeightUnit: invoiceShip?.net_weight_unit ?? source?.net_weight_unit ?? null,
    netWeightSource: invoiceShip?.net_weight_source ?? null,
    netWeightType: invoiceShip?.net_weight_type ?? null,
    palletCount: packageDecision.palletCount ?? palletCount,
    declarationPackageCount: packageDecision.declarationPackageCount,
    declarationPackageType: packageDecision.declarationPackageType,
    requiresManualPackageReview: packageDecision.requiresManualReview,
    packageVerificationNote: packageDecision.packageVerificationNote,
  };
}

function mapDeliveryAddress(
  invoice: NormalizedInvoice,
  audit?: AuditReportResponse
): DeliveryAddress {
  const source: ApiDeliveryAddress | undefined =
    audit?.delivery_address ?? invoice.delivery_address;

  return {
    company: source?.company ?? null,
    address: source?.address ?? null,
    city: source?.city ?? null,
    postalCode: source?.postal_code ?? null,
    country: source?.country ?? null,
    countryCode: source?.country_code ?? null,
  };
}

function mapShipmentReadinessIssues(invoice: NormalizedInvoice): AuditIssue[] {
  return evaluateShipmentReadiness(invoice).map((finding) => ({
    id: finding.code,
    type: finding.severity,
    message: finding.message,
    field: finding.code,
  }));
}

function filterResolvedVatArticleIssues(
  issues: AuditIssue[],
  invoice: NormalizedInvoice
): AuditIssue[] {
  if (!hasVatExemptionArticle(invoice)) {
    return issues;
  }
  return issues.filter((issue) => resolveIssueCode(issue) !== MISSING_VAT_ARTICLE);
}

function filterResolvedVatArticleWarnings(
  warnings: string[],
  invoice: NormalizedInvoice
): string[] {
  if (!hasVatExemptionArticle(invoice)) {
    return warnings;
  }
  return warnings.filter((warning) => inferIssueCodeFromMessage(warning) !== MISSING_VAT_ARTICLE);
}

function mapInvoiceDateReadinessIssues(invoice: NormalizedInvoice): AuditIssue[] {
  return evaluateInvoiceDateReadiness(invoice).map((issue) => ({
    id: issue.code,
    type: issue.severity,
    message: issue.message,
    field: issue.code,
  }));
}

function mapHsAggregationFromEngine(
  invoice: NormalizedInvoice,
  preferenceOrigin: PreferenceOriginAnalysis
): HsAggregationReport {
  const canonicalInvoiceValue = resolveInvoiceValue(invoice);
  const originCountriesContext = buildOriginCountriesContext(preferenceOrigin);
  const engine = runHsAggregationEngine(invoice, {
    invoiceTotalValue: canonicalInvoiceValue,
    originCountriesContext,
  });
  const lineClassifications = buildLineHsClassifications(invoice);
  const resolvedOriginCountries = resolveOriginCountriesDisplay(
    invoice.items,
    originCountriesContext
  );
  return {
    hsAggregation: engine.hs_aggregation.map((row) => {
      const mappedRow = {
        hsCode: row.hs_code,
        countryOfOrigin: row.country_of_origin,
        preferentialOrigin: row.preferential_origin,
        totalQuantity: row.total_quantity,
        totalValue: row.total_value,
        totalNetWeight: row.total_net_weight,
        itemCount: row.item_count,
        countriesOfOrigin: row.countries_of_origin,
        sourcePositions: row.source_positions,
      };
      const hsMeta = deriveAggregationHsMetadata(mappedRow, lineClassifications);
      return {
        ...mappedRow,
        ...hsMeta,
        wizardHsCode: null,
        verificationStatus: "MISSING" as const,
        wizardConfidence: null,
        verificationReason: "",
      };
    }),
    preferentialSummary: engine.preferential_summary.map((row) => ({
      hsCode: row.hs_code,
      totalValue: row.total_value,
      totalNetWeight: row.total_net_weight,
      totalQuantity: row.total_quantity,
      sourcePositions: row.source_positions,
      weightAllocationUnavailable: row.weight_allocation_unavailable,
    })),
    nonPreferentialSummary: engine.non_preferential_summary.map((row) => ({
      hsCode: row.hs_code,
      totalValue: row.total_value,
      totalNetWeight: row.total_net_weight,
      totalQuantity: row.total_quantity,
      sourcePositions: row.source_positions,
      weightAllocationUnavailable: row.weight_allocation_unavailable,
      displayLabel: row.display_label,
    })),
    unknownPreferenceSummary: engine.unknown_preference_summary.map((row) => ({
      hsCode: row.hs_code,
      totalValue: row.total_value,
      totalNetWeight: row.total_net_weight,
      totalQuantity: row.total_quantity,
      sourcePositions: row.source_positions,
      weightAllocationUnavailable: row.weight_allocation_unavailable,
      displayLabel: row.display_label,
    })),
    nonPreferentialExportSummary: engine.non_preferential_export_summary
      ? {
          hsCode: engine.non_preferential_export_summary.hs_code,
          totalValue: engine.non_preferential_export_summary.total_value,
          totalNetWeight: engine.non_preferential_export_summary.total_net_weight,
          totalQuantity: engine.non_preferential_export_summary.total_quantity,
          sourcePositions: engine.non_preferential_export_summary.source_positions,
          weightAllocationUnavailable:
            engine.non_preferential_export_summary.weight_allocation_unavailable,
          displayLabel: engine.non_preferential_export_summary.display_label,
        }
      : null,
    originCountriesDetected: engine.origin_countries_detected,
    mrnSummary: {
      totalGoodsLines: engine.mrn_summary.total_goods_lines,
      uniqueHsCodes: engine.mrn_summary.unique_hs_codes,
      totalInvoiceValue: engine.mrn_summary.total_invoice_value,
      totalNetWeight: engine.mrn_summary.total_net_weight,
      totalGrossWeight: engine.mrn_summary.total_gross_weight,
      countriesOfOrigin:
        engine.mrn_summary.countries_of_origin.length > 0
          ? engine.mrn_summary.countries_of_origin
          : resolvedOriginCountries.length > 0
            ? resolvedOriginCountries
            : extractCountriesOfOrigin(invoice),
      excludedServiceLines: engine.mrn_summary.excluded_service_lines,
    },
    traceabilityLines: buildPositionTraceability(invoice),
  };
}

function mapRecommendedActions(
  audit: AuditReportResponse,
  issues: AuditIssue[],
  preferenceOrigin: PreferenceOriginAnalysis,
  preferentialConfirmed: boolean
): RecommendedAction[] {
  const fromStrings = filterPreferentialReviewRecommendations(
    audit.recommended_actions ?? [],
    {
      preferentialConfirmed,
      preferentialOriginAnalyzed: isPreferentialOriginAnalyzed(preferenceOrigin),
      preferenceNotDeclared: isPreferenceNotDeclared(preferenceOrigin),
      suppressEur1: shouldSuppressEur1Recommendations(preferenceOrigin),
      ignorePreferenceWorkflow: shouldIgnorePreferenceWorkflow(preferenceOrigin),
    }
  ).map((text, index) => ({
    id: `action-${index}`,
    title: text.split(".")[0]?.slice(0, 80) || text.slice(0, 80),
    description: text,
    priority: "medium" as const,
  }));

  const fromIssues = issues
    .filter((i) => i.type === "error" || i.type === "warning")
    .slice(0, 4)
    .map((issue, index) => ({
      id: `issue-action-${index}`,
      title: issue.message.slice(0, 80),
      description: issue.message,
      priority: issue.type === "error" ? ("high" as const) : ("medium" as const),
    }));

  if (fromStrings.length > 0) return fromStrings;
  return fromIssues;
}

function mapFilingRecommendations(
  audit: AuditReportResponse,
  issues: AuditIssue[],
  preferenceOrigin: PreferenceOriginAnalysis,
  preferentialConfirmed: boolean
): string[] {
  const filtered = filterPreferentialReviewRecommendations(
    audit.recommended_actions ?? [],
    {
      preferentialConfirmed,
      preferenceNotDeclared: isPreferenceNotDeclared(preferenceOrigin),
      suppressEur1: shouldSuppressEur1Recommendations(preferenceOrigin),
      ignorePreferenceWorkflow: shouldIgnorePreferenceWorkflow(preferenceOrigin),
    }
  );
  if (filtered.length > 0) {
    return filtered;
  }
  if (issues.some((issue) => resolveIssueCode(issue) === MISSING_VAT_ARTICLE)) {
    return [REQUEST_MISSING_VAT_ARTICLE];
  }
  return [];
}

function buildExportSummary(
  audit: AuditReportResponse,
  disposition: DispositionResponse | undefined,
  preferenceOrigin: PreferenceOriginAnalysis,
  hsCodeCount: number,
  issues: AuditIssue[],
  options: {
    invoiceFoundationComplete: boolean;
    goodsLines: number;
  }
): string {
  if (
    options.invoiceFoundationComplete &&
    options.goodsLines > 0 &&
    hsCodeCount === 0 &&
    hasOnlyManualHsClassificationReview(issues)
  ) {
    if (preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN") {
      return "Invoice documentation complete with mixed preferential origin. Manual HS classification required before export declaration.";
    }
    return "Invoice documentation complete. Manual HS classification required before export declaration.";
  }

  if (isExportDeclarationReady(preferenceOrigin, hsCodeCount)) {
    const warnings = issues.filter((issue) => issue.type === "warning");
    if (
      warnings.length === 1 &&
      resolveIssueCode(warnings[0]) === MISSING_VAT_ARTICLE
    ) {
      return "Preferential origin confirmed. Ready for export declaration with one remaining documentation warning.";
    }
    if (warnings.length > 0) {
      return `Preferential origin confirmed. Ready for export declaration with ${warnings.length} remaining documentation warning${warnings.length === 1 ? "" : "s"}.`;
    }
    return "Preferential origin confirmed via authorised exporter declaration. Invoice is ready for export declaration.";
  }

  const raw = audit.summary || disposition?.summary;
  if (raw?.trim() && isPreferentialReviewRecommendation(raw)) {
    return "Export audit completed.";
  }
  return raw?.trim() || "Export audit completed.";
}

function buildInvoiceSummary(
  invoice: NormalizedInvoice,
  hsCodes: string[],
  preferenceOrigin: PreferenceOriginAnalysis,
  disposition?: DispositionResponse
): InvoiceSummary {
  const originContext = buildOriginCountriesContext(preferenceOrigin);
  const resolvedOriginCountries = resolveOriginCountriesDisplay(invoice.items, originContext);
  const countriesOfOrigin =
    disposition?.countries_of_origin?.length
      ? disposition.countries_of_origin.map((code) => formatCountryDisplay(code, code))
      : resolvedOriginCountries.length > 0
        ? resolvedOriginCountries
        : extractCountriesOfOrigin(invoice);

  return {
    invoiceNumber: invoice.invoice_number?.trim() || "—",
    invoiceDate: invoice.invoice_date?.trim() || "—",
    exporter: invoice.exporter?.trim() || "—",
    consignee: invoice.consignee?.trim() || "—",
    destinationCountry: formatCountryDisplay(invoice.country, invoice.country_code),
    destinationCountryCode: invoice.country_code?.trim().toUpperCase() || "",
    incoterms: invoice.incoterms?.trim() || "—",
    currency: invoice.currency?.trim() || "EUR",
    invoiceValue: resolveInvoiceValue(invoice),
    lineItemCount: disposition?.total_items ?? countLineItems(invoice),
    uniqueHsCodeCount: hsCodes.length,
    countriesOfOrigin,
  };
}

function mapPreferenceOrigin(
  audit: AuditReportResponse,
  invoice: NormalizedInvoice,
  preferenceOrigin?: PreferenceOriginResponse
): PreferenceOriginAnalysis {
  const po = audit.preference_origin;
  const analysis = preferenceOrigin?.preference_analysis;
  const engine = runPreferentialOriginEngine(invoice);
  const destinationOutsideEu =
    isDestinationOutsideEu(invoice.country_code) ||
    isDestinationOutsideEu(invoice.country) ||
    Boolean(po?.destination_outside_eu ?? analysis?.destination_outside_eu);

  const originDeclarationFound = Boolean(
    po?.origin_declaration_found ||
      analysis?.origin_declaration_found ||
      engine.origin_declaration_found
  );
  const authorisedExporterDetected = Boolean(
    po?.authorised_exporter_found ||
      analysis?.authorised_exporter_found ||
      engine.authorised_exporter_detected
  );

  const invoiceValue = resolveInvoiceValue(invoice);
  const schemeInfo = resolvePreferenceScheme(invoice.country_code, invoice.country);
  const detectionCorpus = collectPreferenceDetectionCorpus(invoice);
  const statementOnOriginDetected = detectStatementOnOrigin(detectionCorpus);
  const rexRegistrationNumber = detectRexRegistration(detectionCorpus);
  const rexRegistrationDetected = rexRegistrationNumber != null;

  const decision = evaluatePreferentialOriginDecision({
    preferenceScheme: schemeInfo,
    originDeclarationDetected: originDeclarationFound,
    authorisedExporterDetected,
    statementOnOriginDetected,
    rexRegistrationDetected,
    invoiceValueEur: invoiceValue,
  });

  const requiredDocuments: string[] = [];

  const lineDerived = applyLineDerivedOriginStatus(decision, engine.lines, {
    originDeclarationFound,
  });
  const mixedOrigin = lineDerived.mixedOrigin;
  const mixedOriginTotals = computeMixedOriginTotals(invoice, engine.lines);
  const preferentialAllocation = computePreferentialAllocation(invoice, engine.lines);
  const authMeta = engine.authorised_exporter_detection;

  return {
    destinationOutsideEu,
    preferenceScheme: schemeInfo.scheme,
    schemeLabel: schemeInfo.schemeLabel,
    applicableProofDocuments: schemeInfo.applicableProofDocuments,
    preferenceWorkflowActive: schemeInfo.workflowActive,
    preferentialOriginStatus: lineDerived.preferentialOriginStatus,
    invoiceDeclarationSufficient: lineDerived.invoiceDeclarationSufficient,
    evidenceStatus: decision.evidenceStatus,
    eur1Recommended: false,
    originDeclarationFound,
    authorisedExporterDetected,
    statementOnOriginDetected,
    rexRegistrationDetected,
    rexRegistrationNumber,
    authorisedExporterNumber:
      engine.authorised_exporter_number ?? invoice.authorised_exporter_number ?? null,
    authorisationCountry: authMeta?.authorisation_country ?? null,
    authorisedExporterDetectionRule: authMeta?.detection_rule ?? null,
    authorisedExporterConfidence: authMeta?.confidence ?? null,
    authorisedExporterCountryMatch: authMeta?.country_match ?? null,
    status: lineDerived.statusLabel,
    recommendation: lineDerived.recommendation,
    requiredDocuments,
    lineItems: engine.lines,
    declarationsDetected: engine.declarations_detected.map((d) => ({
      kind: d.kind,
      text: d.text,
      positions: d.positions,
      excluded_positions: d.excluded_positions,
    })),
    preferentialOriginSummary: engine.summary,
    mixedOrigin,
    mixedOriginTotals,
    preferentialAllocation,
  };
}

function buildDispositionText(
  disposition: DispositionResponse | undefined,
  audit: AuditReportResponse,
  invoice: NormalizedInvoice,
  fileName: string,
  preferenceOrigin: PreferenceOriginAnalysis,
  hsCodes: string[]
): string {
  const originSummary = deriveDispositionOriginSummary(preferenceOrigin, invoice);
  const originLines = formatDispositionOriginSummary(originSummary);

  if (isExportDeclarationReady(preferenceOrigin, hsCodes.length)) {
    const authSuffix = preferenceOrigin.authorisedExporterNumber
      ? ` (authorised exporter number ${preferenceOrigin.authorisedExporterNumber})`
      : "";
    const lines = [
      "EXPORT CUSTOMS DISPOSITION (INDICATIVE)",
      "",
      `Document: ${fileName}`,
      `Invoice: ${invoice.invoice_number ?? "—"}`,
      "Status: READY FOR EXPORT DECLARATION",
      `Exporter: ${invoice.exporter ?? "—"}`,
      `Consignee: ${invoice.consignee ?? "—"}`,
      `Destination: ${formatCountryDisplay(invoice.country, invoice.country_code)}`,
      `Incoterms: ${invoice.incoterms ?? "—"}`,
      "",
      ...originLines,
      ...(originLines.length > 0 ? [""] : []),
      `All line items qualify for preferential origin. EUR.1 is not required because a valid authorised exporter origin declaration is present${authSuffix}.`,
    ];
    const summary = disposition?.summary || audit.summary;
    if (summary?.trim() && !isPreferentialReviewRecommendation(summary)) {
      lines.push("", summary);
    }
    return lines.join("\n");
  }

  if (disposition?.disposition_text?.trim()) {
    return sanitizeDispositionOriginText(disposition.disposition_text, originSummary);
  }

  const shipment = invoice.shipment_summary;
  const grossWeight =
    shipment?.gross_weight_total != null
      ? `${shipment.gross_weight_total} ${shipment.gross_weight_unit || "kg"}`
      : null;
  const netWeight =
    shipment?.net_weight_total != null
      ? `${shipment.net_weight_total} ${shipment.net_weight_unit || "kg"}`
      : null;
  const packageDecision = evaluatePackageCountDecision({
    colliCount: shipment?.package_count ?? null,
    palletCount: shipment?.pallet_count ?? null,
  });

  const logisticsLines = [
    grossWeight ? `Gross Weight: ${grossWeight}` : null,
    netWeight ? `Net Weight: ${netWeight}` : null,
    packageDecision.colliCount != null ? `Packages (Colli): ${packageDecision.colliCount}` : null,
    packageDecision.palletCount != null ? `Pallets: ${packageDecision.palletCount}` : null,
    packageDecision.declarationPackageCount != null
      ? `Declaration Package Count: ${formatDeclarationPackageCount(packageDecision.declarationPackageCount)}`
      : null,
    packageDecision.declarationPackageType
      ? `Declaration Package Type: ${packageDecision.declarationPackageType}`
      : null,
    packageDecision.packageVerificationNote,
  ].filter((line): line is string => Boolean(line));

  const lines = [
    "EXPORT CUSTOMS DISPOSITION (INDICATIVE)",
    "",
    `Document: ${fileName}`,
    `Invoice: ${invoice.invoice_number ?? "—"}`,
    `Status: ${disposition?.status ?? audit.audit_status}`,
    `Exporter: ${invoice.exporter ?? "—"}`,
    `Consignee: ${invoice.consignee ?? "—"}`,
    `Destination: ${formatCountryDisplay(invoice.country, invoice.country_code)}`,
    `Incoterms: ${invoice.incoterms ?? "—"}`,
    "",
    ...logisticsLines,
    ...(logisticsLines.length > 0 ? [""] : []),
    ...originLines,
    ...(originLines.length > 0 ? [""] : []),
    disposition?.summary || audit.summary || "See audit issues and recommended actions.",
  ];
  return lines.join("\n");
}

export function mapAuditReportToExportReport(
  invoice: NormalizedInvoice,
  audit: AuditReportResponse,
  fileName: string,
  extras?: ExportAuditorMapExtras
): ExportAuditReport {
  const { invoice: resolvedInvoice, diagnostics: destinationDiagnostics } =
    resolveDestinationWithDiagnostics(invoice);
  logDestinationCountryDiagnostics(destinationDiagnostics, {
    invoiceNumber: resolvedInvoice.invoice_number ?? undefined,
    fileName,
  });
  invoice = resolvedInvoice;

  const extraHs = extras?.disposition?.tariff_codes ?? [];
  const hsSanity = applyHsClassificationSanity(invoice);
  invoice = hsSanity.invoice;
  const hsWorkflowSummary = buildHsWorkflowSummary(invoice);
  const extractedHsCodes = extractHsCodes(invoice, extraHs);
  const hsCodes =
    hsWorkflowSummary.finalHsCodes.length > 0
      ? hsWorkflowSummary.finalHsCodes
      : extractedHsCodes;
  const readiness = extras?.readiness;
  const preferenceOrigin = mapPreferenceOrigin(audit, invoice, extras?.preferenceOrigin);
  const shipmentReadinessIssues = mapShipmentReadinessIssues(invoice);
  const invoiceDateReadinessIssues = mapInvoiceDateReadinessIssues(invoice);
  const readinessWarnings = deduplicateWarningStrings(
    filterFalseEuDestinationReadinessWarnings(
      filterResolvedVatArticleWarnings(
        filterResolvedShipmentReadinessWarnings(
          [
            ...(readiness?.warnings ?? []),
            ...(audit.readiness.warnings ?? []),
          ],
          invoice
        ),
        invoice
      ),
      destinationDiagnostics.destinationCountryCode
    )
  );
  let issues = mapIssues(audit.issues, readinessWarnings, [
    ...invoiceDateReadinessIssues,
    ...shipmentReadinessIssues,
    ...mapDocumentFlagIssues(invoice),
    ...collectInvalidHsCodeIssues(invoice).map((issue) => applyIssueSeverity(issue)),
    ...collectUnknownHsCodeIssues(invoice).map((issue) => applyIssueSeverity(issue)),
    ...mapAuthorisationCountryIssues(preferenceOrigin, invoice),
    ...hsSanity.warnings.map((warning) =>
      applyIssueSeverity({
        id: MULTIPLE_HS_CANDIDATES_DETECTED,
        type: "warning",
        message: warning.message,
        field: MULTIPLE_HS_CANDIDATES_DETECTED,
      })
    ),
  ]);
  issues = filterFalseValidationWarnings(issues, preferenceOrigin);
  issues = filterFalseEuDestinationWarnings(issues, destinationDiagnostics.destinationCountryCode);
  issues = filterGenericShipmentWarningsWhenNoOcrData(issues, invoice);
  issues = filterResolvedShipmentWarnings(issues, invoice);
  issues = filterResolvedHsCodeWarnings(issues, hsCodes.length);
  issues = filterResolvedVatArticleIssues(issues, invoice);
  const supportingDocumentsDetected = detectSupportingDocuments(invoice, preferenceOrigin, issues);
  issues = filterSupportingDocumentIssues(issues);
  issues = reclassifyHsCodeIssues(issues, hsCodes.length);
  issues = filterSupersededPreferentialAuditIssues(issues, preferenceOrigin);
  issues = reclassifyOriginIssues(issues, preferenceOrigin);
  issues = deduplicateIssues(issues);
  const hsAggregationReport = mapHsAggregationFromEngine(invoice, preferenceOrigin);

  const integrity = validateCustomsExtractionIntegrity(invoice, {
    invoiceTotalValue: resolveInvoiceValue(invoice),
  });
  logExtractionIntegrityForensic(invoice, integrity, fileName);
  const dispositionTotal =
    extras?.disposition?.total_value_numeric ??
    parseLocaleNumber(extras?.disposition?.total_value);
  const totalConsistency = validateInvoiceTotalConsistency(invoice, {
    customsDispositionValue: dispositionTotal,
  });
  invoice = {
    ...invoice,
    document_flags: {
      ...invoice.document_flags,
      ...integrity.flags,
      ...totalConsistency.flags,
    },
  };
  issues = deduplicateIssues([
    ...issues,
    ...integrity.issues.map((issue) => applyIssueSeverity(issue)),
    ...totalConsistency.issues.map((issue) => applyIssueSeverity(issue)),
    ...mapDocumentFlagIssues(invoice),
  ]);
  issues = reclassifyHsCodeIssues(issues, hsCodes.length);
  issues = deduplicateIssues(issues);
  const errorCount = issues.filter((i) => i.type === "error").length;
  const invoiceFoundationComplete = isInvoiceFoundationComplete(invoice, preferenceOrigin);
  const apiScore = readiness?.score ?? audit.readiness.score;
  const readinessScore = adjustReadinessScore(apiScore, preferenceOrigin, issues, {
    hsCodeCount: hsCodes.length,
    mrnExportReady: isMrnExportReady({ hsAggregationReport }, issues),
    invoiceFoundationComplete,
  });
  const checksTotal = readiness?.checks_total ?? 8;
  const checksPassed =
    readiness?.checks_passed ?? Math.round((readinessScore / 100) * checksTotal);
  const missingFields = missingFieldsFromInvoice(invoice, audit);
  const preferentialConfirmed = isPreferentialOriginConfirmed(preferenceOrigin);

  const goodsLines = Math.max(
    hsAggregationReport.mrnSummary.totalGoodsLines,
    countLineItems(invoice)
  );
  const hasBlockingIssue = issues.some(isCriticalBlocker);

  const confidenceResult = computeConfidenceScores(invoice, {
    checksPassed,
    checksTotal,
    readinessScore,
  });

  const base: Omit<ExportAuditReport, "readinessScore"> = {
    documentId: invoice.invoice_number || fileName,
    fileName,
    processedAt: new Date().toISOString(),
    auditStatus: mapAuditStatus(
      readinessScore,
      errorCount,
      hsCodes.length,
      goodsLines,
      hasBlockingIssue
    ),
    missingFields,
    invoiceSummary: buildInvoiceSummary(invoice, hsCodes, preferenceOrigin, extras?.disposition),
    shipmentSummary: mapShipmentSummary(invoice, audit),
    deliveryAddress: mapDeliveryAddress(invoice, audit),
    hsAggregationReport,
    confidence: {
      ocrQuality: confidenceResult.ocrQuality,
      dataCompleteness: confidenceResult.dataCompleteness,
      overallConfidence: confidenceResult.overallConfidence,
    },
    confidenceBreakdown: confidenceResult.confidenceBreakdown,
    extractionProvenance: confidenceResult.extractionProvenance,
    preferenceOrigin,
    hsCodesDetected: hsCodes,
    issues,
    supportingDocumentsDetected,
    recommendedActions: mapRecommendedActions(
      audit,
      issues,
      preferenceOrigin,
      preferentialConfirmed
    ),
    customsDisposition: buildDispositionText(
      extras?.disposition,
      audit,
      invoice,
      fileName,
      preferenceOrigin,
      hsCodes
    ),
    exportSummary: buildExportSummary(
      audit,
      extras?.disposition,
      preferenceOrigin,
      hsCodes.length,
      issues,
      { invoiceFoundationComplete, goodsLines }
    ),
    filingRecommendations: mapFilingRecommendations(
      audit,
      issues,
      preferenceOrigin,
      preferentialConfirmed
    ),
    mrnExportReady: isMrnExportReady({ hsAggregationReport }, issues),
  };

  const report: ExportAuditReport = {
    ...base,
    readinessScore,
    ocrObservability: buildOcrObservability(
      invoice,
      extras?.pageCount ?? invoice.ocr_metadata?.page_count ?? 1
    ),
  };

  report.ocrSessionMetrics = aggregateOcrSessionMetrics(
    report.ocrObservability ? [report.ocrObservability] : []
  );
  report.shipmentExtractionDiagnostics = buildShipmentExtractionDiagnostics(invoice);

  report.hsWorkflowSummary = hsWorkflowSummary;
  const hsVerificationSummary = buildHsVerificationSummary(invoice);
  report.hsVerificationSummary = hsVerificationSummary;
  report.hsAggregationReport = {
    ...report.hsAggregationReport,
    traceabilityLines: enrichTraceabilityWithVerification(
      report.hsAggregationReport.traceabilityLines,
      hsVerificationSummary.lineResults
    ),
    hsAggregation: report.hsAggregationReport.hsAggregation.map((row) => ({
      ...row,
      ...deriveAggregationHsVerification(row, hsVerificationSummary.lineResults),
    })),
  };
  report.dataRecoveryDiagnostics = buildDataRecoveryDiagnostics(invoice, {
    hsWorkflowSummary: report.hsWorkflowSummary,
  });
  report.customsReadiness = applyRecoveryReadinessDowngrade(
    evaluateCustomsReadiness(report, invoice),
    report.dataRecoveryDiagnostics.recoveryPercentage
  );
  report.declarationReadiness = evaluateDeclarationReadiness(report, invoice);

  return applyEnterpriseCommercialSummary(
    report,
    invoice,
    extras?.disposition?.total_items
  );
}
