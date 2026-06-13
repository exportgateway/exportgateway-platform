/** Export Auditor domain types — aligned with export-auditor backend contract (frontend-only) */

export type AuditStatusLevel = "READY" | "WARNING" | "ERROR";

export type AuditProgressStepId =
  | "upload"
  | "ocr"
  | "analysis"
  | "report"
  | "complete";

export type AuditProgressStepStatus = "pending" | "active" | "complete" | "error";

export interface AuditProgressStep {
  id: AuditProgressStepId;
  label: string;
  status: AuditProgressStepStatus;
}

export const AUDIT_PROGRESS_STEPS: { id: AuditProgressStepId; label: string }[] = [
  { id: "upload", label: "Uploading Document" },
  { id: "ocr", label: "OCR Extraction" },
  { id: "analysis", label: "Export Audit Analysis" },
  { id: "report", label: "Generating Report" },
  { id: "complete", label: "Complete" },
];

export const AUDIT_PROCESSING_TIMELINE = [
  "OCR Extraction",
  "Invoice Parsing",
  "HS Classification Detection",
  "Origin Analysis",
  "Compliance Review",
] as const;

export type ProcessingTimelineStatus = "pending" | "active" | "complete";

export interface ProcessingTimelineStep {
  label: string;
  status: ProcessingTimelineStatus;
}

export interface InvoiceSummary {
  invoiceNumber: string;
  invoiceDate: string;
  exporter: string;
  consignee: string;
  destinationCountry: string;
  destinationCountryCode: string;
  incoterms: string;
  currency: string;
  invoiceValue: number;
  lineItemCount: number;
  uniqueHsCodeCount: number;
  countriesOfOrigin: string[];
}

export interface ConfidenceScores {
  /** OCR engine confidence — whether OCR extraction succeeded. */
  ocrQuality: number;
  dataCompleteness: number;
  overallConfidence: number;
}

export type CustomsReadinessStatus = "CUSTOMS_READY" | "CUSTOMS_REVIEW" | "CUSTOMS_BLOCKED";

export interface CustomsReadinessResult {
  status: CustomsReadinessStatus;
  label: string;
  reasons: string[];
}

export type DeclarationReadinessStatus = "READY FOR DECLARATION" | "REVIEW REQUIRED";

export interface DeclarationReadinessField {
  box: string;
  label: string;
  fieldKey: string;
}

export interface DeclarationReadinessResult {
  status: DeclarationReadinessStatus;
  missingFields: DeclarationReadinessField[];
  ready: boolean;
}

export type WeightExtractionSource = "DOCUMENT" | "CALCULATED" | "OCR_TABLE" | "OCR_TEXT";

export type PreferentialOriginEvidenceStatus = "DECLARED" | "NOT_DECLARED" | "UNVERIFIED";

export type IssueSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface OcrObservability {
  ocrProvider: string;
  pageCount: number;
  ocrTextLength: number;
  extractionSource: string;
  itemsExtracted: number;
  itemsWithHsCode: number;
  itemsWithCountryOfOrigin: number;
  itemsWithLineTotal: number;
  /** Data extraction completeness 0–100 (field coverage — not OCR engine failure). */
  ocrQualityScore: number;
  /** Alias for UI — same as ocrQualityScore. */
  dataExtractionCompleteness?: number;
  estimatedOcrCostUsd: number;
  costPerPageUsd: number;
  /** Shipment fields populated by OCR backend (gross_weight_total, package_count, etc.). */
  shipmentFieldsDetected?: string[];
  /** Shipment fields absent from OCR backend response. */
  shipmentFieldsMissing?: string[];
}

export interface OcrSessionMetrics {
  invoiceCount: number;
  totalOcrPages: number;
  totalOcrCostUsd: number;
  averageOcrCostPerInvoiceUsd: number;
  averageOcrQuality: number;
}

export interface LinePreferentialOrigin {
  position_number: number;
  country_of_origin: string;
  preferential_origin: "YES" | "NO" | "UNKNOWN" | "NOT_DECLARED";
  preference_reason: string;
  preference_source:
    | "invoice_declaration"
    | "supplier_declaration_reference"
    | "manufacturer_declaration_reference"
    | "authorised_exporter_statement"
    | "excluded_positions_list"
    | "none";
}

export interface DetectedPreferenceDeclaration {
  kind: string;
  text: string;
  positions?: number[];
  excluded_positions?: number[];
}

export type PreferentialOriginDocumentStatus =
  | "CONFIRMED"
  | "NOT_DECLARED"
  | "MIXED_ORIGIN"
  | "NON_PREFERENTIAL_EXPORT";

export type PreferenceScheme = import("@/lib/export-auditor/preference-scheme").PreferenceScheme;
export type PreferenceProofDocument =
  import("@/lib/export-auditor/preference-scheme").PreferenceProofDocument;

export interface PreferenceOriginAnalysis {
  destinationOutsideEu: boolean;
  /** Preferential proof scheme determined by destination country. */
  preferenceScheme: PreferenceScheme;
  schemeLabel: string;
  applicableProofDocuments: PreferenceProofDocument[];
  preferenceWorkflowActive: boolean;
  /** Document-level status from decision engine — not inferred from country of origin. */
  preferentialOriginStatus: PreferentialOriginDocumentStatus;
  /** True only when a valid PEM preferential origin statement is on the invoice. */
  invoiceDeclarationSufficient: boolean;
  /** Document-level preferential evidence status from decision engine. */
  evidenceStatus: PreferentialOriginEvidenceStatus;
  /** @deprecated Always false — EUR.1 is never auto-recommended from invoice data alone. */
  eur1Recommended: boolean;
  originDeclarationFound: boolean;
  authorisedExporterDetected: boolean;
  statementOnOriginDetected: boolean;
  rexRegistrationDetected: boolean;
  rexRegistrationNumber: string | null;
  status: string;
  recommendation: string;
  requiredDocuments: string[];
  /** Per-line preferential origin engine output */
  lineItems: LinePreferentialOrigin[];
  declarationsDetected: DetectedPreferenceDeclaration[];
  preferentialOriginSummary: string;
  authorisedExporterNumber: string | null;
  mixedOrigin: boolean;
  mixedOriginTotals: MixedOriginTotals | null;
  /** Preferential / non-preferential allocation for MRN preparation (line-marker driven). */
  preferentialAllocation: MixedOriginTotals | null;
}

export interface AuditIssue {
  id: string;
  type: "error" | "warning" | "info";
  /** Normalized severity — maps from type and issue code. */
  severity?: IssueSeverity;
  message: string;
  field?: string;
}

export type SupportingDocumentKind =
  | "delivery_note"
  | "certificate_of_origin"
  | "packing_list"
  | "eur1"
  | "long_term_supplier_declaration";

export interface SupportingDocumentReference {
  kind: SupportingDocumentKind;
  label: string;
}

export interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export type DeclarationPackageType = "PAL" | "COLLI" | "CT";

export type DeclarationPackageCount = number | "MANUAL REVIEW REQUIRED";

export interface MixedOriginTotals {
  isMixed: boolean;
  preferentialQuantity: number;
  preferentialValue: number;
  preferentialWeight: number | null;
  nonPreferentialQuantity: number;
  nonPreferentialValue: number;
  nonPreferentialWeight: number | null;
}

export interface ShipmentSummary {
  /** Colli / package count from invoice footer (stored separately from pallets). */
  packageCount: number | null;
  packageType: string | null;
  grossWeightTotal: number | null;
  grossWeightUnit: string | null;
  grossWeightSource?: WeightExtractionSource | null;
  netWeightTotal: number | null;
  netWeightUnit: string | null;
  netWeightSource?: WeightExtractionSource | null;
  palletCount: number | null;
  /** Customs declaration package count — pallet priority when both Colli and Pallets exist. */
  declarationPackageCount: DeclarationPackageCount | null;
  declarationPackageType: DeclarationPackageType | null;
  requiresManualPackageReview: boolean;
  packageVerificationNote: string | null;
}

export interface DeliveryAddress {
  company: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface HsAggregationRow {
  hsCode: string;
  totalQuantity: number;
  totalValue: number;
  totalNetWeight: number | null;
  itemCount: number;
  countriesOfOrigin: string[];
  sourcePositions: number[];
}

export type DeclarationLanguage = "en" | "si" | "hr" | "sr" | "de";

export type DeclarationDescriptionSource =
  | "hs_library"
  | "ai_generated"
  | "user_edited"
  | "rule_based";

export interface DeclarationDescriptionEntry {
  originalDescription: string;
  declarationDescription: string;
  language: DeclarationLanguage;
  source: DeclarationDescriptionSource;
  descriptionReviewRecommended?: boolean;
  translations?: Partial<
    Record<DeclarationLanguage, { description: string; source: DeclarationDescriptionSource }>
  >;
}

export interface PositionTraceabilityLine {
  positionNumber: number;
  description: string;
  quantity: number;
  value: number;
  netWeight: number | null;
  countryOfOrigin: string;
  preferentialOrigin: "YES" | "NO" | "UNKNOWN" | "NOT_DECLARED";
  hsCode: string;
  unit?: string | null;
  customsDescription?: string;
  declarationDescription?: string;
  declarationDescriptionSource?: DeclarationDescriptionSource;
  descriptionReviewRecommended?: boolean;
  declarationDescriptionsByLanguage?: Partial<
    Record<DeclarationLanguage, { description: string; source: DeclarationDescriptionSource }>
  >;
}

export interface PreferenceAggregationRow {
  hsCode: string;
  totalValue: number;
  totalNetWeight: number | null;
  totalQuantity: number;
  sourcePositions: number[];
  weightAllocationUnavailable?: boolean;
  /** Display label when hsCode is a synthetic bucket (e.g. non-preferential export). */
  displayLabel?: string;
}

export interface MrnSummary {
  totalGoodsLines: number;
  uniqueHsCodes: number;
  totalInvoiceValue: number;
  totalNetWeight: number | null;
  totalGrossWeight: number | null;
  countriesOfOrigin: string[];
  excludedServiceLines: number;
}

export interface HsAggregationReport {
  hsAggregation: HsAggregationRow[];
  preferentialSummary: PreferenceAggregationRow[];
  nonPreferentialSummary: PreferenceAggregationRow[];
  unknownPreferenceSummary: PreferenceAggregationRow[];
  /** Single bucket when all lines are NOT_DECLARED — not split by country of origin. */
  nonPreferentialExportSummary: PreferenceAggregationRow | null;
  /** Informational COO line counts — never used for preferential allocation. */
  originCountriesDetected: string | null;
  mrnSummary: MrnSummary;
  traceabilityLines: PositionTraceabilityLine[];
}

export interface ExportAuditReport {
  documentId: string;
  fileName: string;
  processedAt: string;
  auditStatus: AuditStatusLevel;
  readinessScore: number;
  missingFields: string[];
  invoiceSummary: InvoiceSummary;
  shipmentSummary: ShipmentSummary;
  deliveryAddress: DeliveryAddress;
  hsAggregationReport: HsAggregationReport;
  confidence: ConfidenceScores;
  /** Internal/debug — field → extraction source. Not shown in UI. */
  confidenceBreakdown?: Record<string, string>;
  extractionProvenance?: Array<{ field: string; value: string; source: string }>;
  preferenceOrigin: PreferenceOriginAnalysis;
  issues: AuditIssue[];
  supportingDocumentsDetected: SupportingDocumentReference[];
  recommendedActions: RecommendedAction[];
  customsDisposition: string;
  hsCodesDetected: string[];
  exportSummary: string;
  filingRecommendations: string[];
  mrnExportReady: boolean;
  declarationDescriptions?: DeclarationDescriptionEntry[];
  ocrObservability?: OcrObservability;
  ocrSessionMetrics?: OcrSessionMetrics;
  shipmentExtractionDiagnostics?: import("@/lib/export-auditor/shipment-extraction-diagnostics").ShipmentExtractionDiagnostics;
  customsReadiness?: CustomsReadinessResult;
  declarationReadiness?: DeclarationReadinessResult;
}

export interface OcrExtractionResult {
  documentId: string;
  rawTextPreview: string;
  pageCount: number;
}

export interface ReadinessResult {
  status: AuditStatusLevel;
  blockingIssues: number;
  warningCount: number;
}

export interface DispositionResult {
  dispositionText: string;
  generatedAt: string;
}

export type ExportAuditorApiError = {
  code: string;
  message: string;
};

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"] as const;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
