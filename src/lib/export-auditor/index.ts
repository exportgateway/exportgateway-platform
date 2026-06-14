export * from "@/lib/export-auditor/types";
export {
  DELIVERY_NOTE_DETECTED,
  CERTIFICATE_OF_ORIGIN_REFERENCED,
  PACKING_LIST_REFERENCED,
  EUR1_REFERENCED,
  LTSD_REFERENCED,
  detectSupportingDocuments,
  filterSupportingDocumentIssues,
  isSupportingDocumentReferenceIssue,
  extractSupportingDocumentsFromIssues,
  SUPPORTING_DOCUMENT_LABELS,
  SUPPORTING_DOCUMENT_ISSUE_CODES,
} from "@/lib/export-auditor/supporting-documents-detect";
export {
  adjustReadinessScore,
  calculateExportReadinessScore,
  getReadinessVerdict,
  countIssuesBySeverity,
} from "@/lib/export-auditor/readiness-score";
export {
  isPreferentialOriginConfirmed,
  isExportDeclarationReady,
  isPreferentialReviewRecommendation,
  isDocumentationOnlyWarnings,
  isInvoiceFoundationComplete,
  isReadyWithManualClassificationReview,
  filterPreferentialReviewRecommendations,
  isPreferenceNotDeclared,
  shouldSuppressEur1Recommendations,
  shouldIgnorePreferenceWorkflow,
  REQUEST_MISSING_VAT_ARTICLE,
} from "@/lib/export-auditor/preferential-export-readiness";
export {
  evaluatePreferentialOriginDecision,
  destinationSupportsPreferentialTrade,
  INVOICE_DECLARATION_VALUE_THRESHOLD_EUR,
  CASE1_MESSAGE,
  CASE2_MESSAGE,
  CASE3_MESSAGE,
  CASE4_MESSAGE,
  NO_PREFERENCE_MESSAGE,
} from "@/lib/export-auditor/preferential-origin-decision-engine";
export {
  resolvePreferenceScheme,
  detectStatementOnOrigin,
  detectRexRegistration,
  collectPreferenceDetectionCorpus,
  PEM_COUNTRY_CODES,
  UK_COUNTRY_CODES,
  REX_COUNTRY_CODES,
} from "@/lib/export-auditor/preference-scheme";
export {
  generateCustomsDescription,
  aggregateCustomsDescriptions,
} from "@/lib/export-auditor/customs-description";
export {
  deriveDispositionOriginSummary,
  sanitizeDispositionOriginText,
} from "@/lib/export-auditor/customs-disposition-summary";
export {
  parseLocaleNumber,
  roundMoney,
  sumLineTotals,
  resolveInvoiceValue,
  resolveAmountEurFromText,
  formatInvoiceValueDisplay,
} from "@/lib/export-auditor/parse-locale-number";
export {
  collectInvoiceValueSurfaces,
  assertInvoiceValueConsistent,
} from "@/lib/export-auditor/invoice-value-consistency";
export {
  collectShipmentDataSurfaces,
  assertShipmentDataConsistent,
} from "@/lib/export-auditor/shipment-data-consistency";
export {
  evaluatePackageCountDecision,
  formatDeclarationPackageCount,
  MANUAL_REVIEW_REQUIRED,
} from "@/lib/export-auditor/package-count-decision-engine";
export {
  computeMixedOriginTotals,
  computePreferentialAllocation,
} from "@/lib/export-auditor/preferential-allocation-engine";
export {
  validateAllocationSources,
  resolveLineAllocationValue,
  parseAllocationQuantity,
  type AllocationSourceValidation,
  type AllocationLineAudit,
  type AllocationLineFlag,
  type AllocationValueSource,
} from "@/lib/export-auditor/allocation-source-validation";
export {
  deriveLineBasedPreferentialStatus,
  applyLineDerivedOriginStatus,
  isAllNotDeclaredLines,
  MIXED_ORIGIN_STATUS_LABEL,
  NON_PREFERENTIAL_EXPORT_STATUS_LABEL,
} from "@/lib/export-auditor/mixed-origin-status-engine";
export {
  formatOriginCountriesDetected,
  countLinesByOriginCountry,
} from "@/lib/export-auditor/origin-countries-summary";
export {
  resolveUnifiedReadiness,
  resolveUnifiedReadinessFromParts,
} from "@/lib/export-auditor/unified-readiness";
export {
  resolveCommercialSummary,
  applyEnterpriseCommercialSummary,
  hasParsedInvoiceLines,
} from "@/lib/export-auditor/enterprise-commercial-summary";
export {
  hasOriginEvidence,
  isMixedPreferentialOrigin,
} from "@/lib/export-auditor/customs-disposition-summary";
export { applyHsClassificationStatusCap } from "@/lib/export-auditor/readiness-score";
export { lineHasPreferentialAsteriskMarker } from "@/lib/export-auditor/preferential-origin-engine";
export { hasVatExemptionArticle } from "@/lib/export-auditor/vat-article-detection";
export {
  MISSING_VAT_ARTICLE,
  HS_CODE_NOT_ON_INVOICE,
  HS_CODE_NOT_ON_INVOICE_MESSAGE,
  VAT_ARTICLE_CANONICAL_MESSAGE,
  DESCRIPTION_REVIEW_RECOMMENDED,
  DESCRIPTION_REVIEW_RECOMMENDED_MESSAGE,
  resolveIssueCode,
  isCriticalBlocker,
  hasOnlyManualHsClassificationReview,
  reclassifyHsCodeIssues,
  reclassifyOriginIssues,
  NO_ORIGIN_DECLARATION,
  MISSING_COUNTRY_OF_ORIGIN,
  NO_ORIGIN_DECLARATION_INFO_MESSAGE,
  MISSING_COUNTRY_OF_ORIGIN_INFO_MESSAGE,
  shouldUpgradeOriginDeclarationToWarning,
  isOriginDeclarationMissingCode,
} from "@/lib/export-auditor/issue-readiness";
export {
  runFullExportAudit,
  validateUploadFile,
} from "@/lib/export-auditor/api-client";
export {
  postExportAuditorOcrAction,
  postExportAuditorReadinessAction,
  postExportAuditorDispositionAction,
  postExportAuditorPreferenceOriginAction,
  postExportAuditorAuditReportAction,
  runExportAuditAnalysisAction,
  runFullExportAuditAction,
} from "@/lib/export-auditor/server-actions";
export {
  runPreferentialOriginEngine,
  detectDeclarations,
  collectDeclarationCorpus,
  parsePositionNumbers,
  eur1ExplicitlyCoversRemainingPositions,
} from "@/lib/export-auditor/preferential-origin-engine";
export {
  extractDestinationFromConsignee,
  resolveDestinationCountry,
  resolveDestinationWithDiagnostics,
  resolveDestinationCandidates,
  buildDestinationCountryDiagnostics,
  isEuDestinationCountry,
  logDestinationCountryDiagnostics,
  type DestinationCountryDiagnostics,
  type DestinationCountrySource,
  type ResolvedDestination,
} from "@/lib/export-auditor/destination-country";
export {
  formatOriginCountriesList,
  formatCountryOfOriginField,
  ORIGIN_COUNTRIES_NOT_PROVIDED,
  ORIGIN_EU_DECLARED,
  buildOriginCountriesContext,
  resolveOriginCountriesDisplay,
  resolveOriginCountriesDetectedText,
  hasExplicitCountryOfOrigin,
} from "@/lib/export-auditor/origin-countries-summary";
export { EU_DESTINATION } from "@/lib/export-auditor/issue-readiness";
export {
  enrichInvoiceShipmentData,
  collectShipmentCorpus,
  extractShipmentSummary,
  extractPackageCount,
  extractGrossWeight,
  extractFooterShipmentMetrics,
  extractDeliveryAddress,
  extractLineItemNetWeightTotal,
  extractNetWeight,
  resolveInvoiceGrossWeight,
  hasInvoiceGrossWeight,
} from "@/lib/export-auditor/shipment-summary-extractor";
export {
  resolveWeightHierarchy,
  applyWeightHierarchyToShipmentSummary,
  type WeightType,
  type WeightExtractionSource,
  type ResolvedWeightHierarchy,
} from "@/lib/export-auditor/weight-extraction-hierarchy";
export {
  aggregateLineNetWeightsForShipment,
  type LineNetAggregation,
} from "@/lib/export-auditor/weight-line-aggregation";
export {
  evaluateWeightValidation,
  evaluateReportWeightValidation,
  NET_EXCEEDS_GROSS,
  UNIT_WEIGHT_MISUSE,
  NET_EXCEEDS_GROSS_MESSAGE,
  UNIT_WEIGHT_MISUSE_MESSAGE,
} from "@/lib/export-auditor/weight-validation";
export {
  enrichEnglishInvoiceFieldsFromOcr,
  extractEnglishInvoiceNumber,
  extractEnglishConsignee,
  extractEnglishExporter,
  extractEnglishLineItems,
} from "@/lib/export-auditor/english-invoice-field-extractor";
export { filterSupersededPreferentialAuditIssues } from "@/lib/export-auditor/issue-readiness";
export {
  extractTabularShipmentMetrics,
} from "@/lib/export-auditor/tabular-shipment-extractor";
export {
  SUPPORTED_INVOICE_LANGUAGE_GROUPS,
  MULTILINGUAL_FIELD_LABELS,
  buildLabelAlternation,
  buildLabelGroupPattern,
  buildSectionHeaderPattern,
} from "@/lib/export-auditor/multilingual-invoice-labels";
export {
  extractMultilingualShipmentMetrics,
  extractMultilingualDeliveryAddress,
  extractMultilingualConsigneeBlock,
  extractMultilingualOriginCountry,
  detectMultilingualPreferentialOrigin,
  mergeMultilingualIntoShipmentSummary,
} from "@/lib/export-auditor/multilingual-field-extractor";
export {
  extractTabularHsCodes,
  extractTabularHsByPosition,
  enrichItemHsCodesFromOcr,
} from "@/lib/export-auditor/tabular-hs-extractor";
export {
  applyParserOcrCrosscheck,
  PARSER_MAPPING_FAILURE,
} from "@/lib/export-auditor/parser-ocr-crosscheck";
export {
  evaluateShipmentReadiness,
  MISSING_PACKAGE_COUNT,
  MISSING_GROSS_WEIGHT,
  MISSING_NET_WEIGHT,
  MISSING_NET_WEIGHT_MESSAGE,
} from "@/lib/export-auditor/shipment-readiness";
export {
  evaluateInvoiceDateReadiness,
  parseInvoiceDate,
  INVOICE_DATE_IN_FUTURE,
  INVOICE_DATE_OLDER_THAN_180_DAYS,
  INVOICE_DATE_READINESS_PENALTIES,
} from "@/lib/export-auditor/invoice-date-readiness";
export {
  runHsAggregationEngine,
  buildAggregationKey,
  isServiceOrTransportLine,
  normalizeAggregationItems,
  filterGoodsLines,
} from "@/lib/export-auditor/hs-aggregation-engine";
export {
  isPlaceholderServiceHsCode,
  shouldSkipHsValidationForLine,
  LINE_TYPE_GOODS,
  LINE_TYPE_SERVICE,
  resolveInvoiceLineType,
  type InvoiceLineType,
} from "@/lib/export-auditor/service-line-detection";
export {
  buildPositionTraceability,
  getSourcePositionsForHs,
  getTraceabilityLinesForHs,
  derivePreferentialStatusForHs,
  formatSourcePositions,
  resolveItemUnit,
} from "@/lib/export-auditor/position-traceability";
export {
  classifyLineHs,
  buildLineHsClassifications,
  buildHsWorkflowSummary,
  deriveAggregationHsMetadata,
  evaluateDocumentHsStatus,
  hasHsForCustomsReady,
  resolveFinalHsCodeForItem,
  resolveInvoiceHsCodeForItem,
  formatHsStatusLabel,
  formatHsSourceLabel,
  collectFinalHsCodes,
  collectInvalidHsCodeIssues,
  collectUnknownHsCodeIssues,
} from "@/lib/export-auditor/hs-classification-workflow";
export {
  buildHsVerificationSummary,
  buildLineHsVerificationResults,
  evaluateLineHsVerification,
  enrichTraceabilityWithVerification,
  deriveAggregationHsVerification,
  hasHighConfidenceHsDiscrepancy,
  computeHsSimilarity,
  formatHsVerificationStatusLabel,
} from "@/lib/export-auditor/hs-verification-engine";
export {
  HS_VERIFICATION_CONFIDENCE_THRESHOLD,
  HS_VERIFICATION_SIMILARITY_THRESHOLD,
} from "@/lib/export-auditor/hs-verification-config";
export {
  buildMrnExportDataset,
  generateMrnCsv,
  generateMrnExcelBuffer,
  isMrnExportReady,
  downloadMrnCsv,
  downloadMrnExcel,
  MRN_WORKSHEET_NAME,
  TRACEABILITY_WORKSHEET_NAME,
  MRN_EXPORT_COLUMNS,
  TRACEABILITY_EXPORT_COLUMNS,
  DECLARATION_DESCRIPTION_DISCLAIMER,
  MRN_EXPORT_FOOTER_WITH_DISCLAIMER,
  summarizeDeclarationDescriptionSources,
} from "@/lib/export-auditor/mrn-export";
export {
  formatDeclarationDescriptionSource,
  resolveLineDeclarationDescription,
  MAX_DECLARATION_DESCRIPTION_LENGTH,
} from "@/lib/export-auditor/declaration-description-display";
export {
  generateDeclarationDescription,
  generateDeclarationDescriptionsBatch,
  enrichReportWithDeclarationDescriptions,
  DECLARATION_DESCRIPTION_CLASSIFICATION_GUARD,
} from "@/lib/export-auditor/declaration-description-engine";
export {
  evaluateDescriptionReview,
} from "@/lib/export-auditor/declaration-description-review";
export {
  hashOriginalDescription,
  normalizeDescriptionForHash,
  normalizeDeclarationDescriptionSource,
  InMemoryDeclarationDescriptionCache,
  JsonFileDeclarationDescriptionCache,
  setDeclarationDescriptionCache,
  getDeclarationDescriptionCache,
} from "@/lib/export-auditor/declaration-description-cache";
export {
  sanitizeCommercialDescription,
} from "@/lib/export-auditor/declaration-description-sanitizer";
export {
  lookupHsDeclarationDescription,
} from "@/lib/export-auditor/hs-description-library";
export {
  InMemoryDeclarationDescriptionLearningStore,
  JsonFileDeclarationDescriptionLearningStore,
  getDeclarationDescriptionLearningStore,
  setDeclarationDescriptionLearningStore,
  saveUserEditedDescription,
  recordApprovedDescriptionUsage,
  getPreferredDescriptionForHs,
} from "@/lib/export-auditor/declaration-description-learning";
export {
  DECLARATION_LANGUAGE_LABELS,
  DECLARATION_LANGUAGES,
  getDeclarationLanguage,
  setDeclarationLanguage,
  getExportLanguage,
  getExportLanguageOverride,
  setExportLanguageOverride,
} from "@/lib/export-auditor/declaration-language-prefs";
export {
  prepareReportForDeclarationExport,
  saveDeclarationDescriptionOverride,
} from "@/lib/export-auditor/declaration-description-client";
export { getExportAuditorApiUrl } from "@/lib/api-config";
export {
  repairPdfFontText,
  repairPdfExtractedText,
  extractPdfText,
  extractPdfPageCount,
  type PdfFontRepairContext,
} from "@/lib/export-auditor/pdf-text-extract";
export {
  BALKAN_PLACE_DICTIONARY,
  SUPPLIER_ENCODING_PROFILES,
  UNKNOWN_PDF_ENCODING_CHARACTER,
  type PdfFontRepairResult,
} from "@/lib/export-auditor/balkan-pdf-text-repair";
export {
  exportValidationPdf,
  buildValidationReportHtmlForTest,
  EXPORT_AUDITOR_VERSION,
} from "@/lib/export-auditor/validation-pdf-export";
export {
  detectGoldenAnomalies,
  compareGoldenResults,
  extractGoldenCapturedFields,
  processGoldenInvoiceSource,
  buildExpectedResultsFromCapture,
  generateGoldenDatasetReviewMarkdown,
  buildDatasetSummary,
  formatFieldDifferences,
  GOLDEN_COMPARE_FIELDS,
} from "@/lib/export-auditor/golden-dataset";
export type {
  GoldenExpectedResults,
  GoldenCapturedFields,
  GoldenAnomaly,
  GoldenAnomalyCode,
  GoldenInvoiceCompareResult,
  GoldenDatasetSummary,
  GoldenFieldDifference,
} from "@/lib/export-auditor/golden-dataset";
