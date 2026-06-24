/** Types aligned with the Export Auditor backend API. */

export type HsSource = "INVOICE" | "WIZARD" | "USER" | "IMPORTED";

export interface ApiInvoiceItem {
  item_code?: string;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  hs_code?: string | null;
  /** HS as printed on invoice before wizard/user/import override. */
  invoice_hs_code?: string | null;
  /** Declaration HS after wizard/user/import — takes precedence over hs_code. */
  final_hs_code?: string | null;
  hs_source?: HsSource | null;
  /** Wizard-suggested HS for verification — never auto-applied as final HS. */
  wizard_hs_code?: string | null;
  /** Wizard classification confidence (0–100). */
  wizard_confidence?: number | null;
  /** Description-to-classification similarity (0–100) from wizard. */
  similarity_score?: number | null;
  country_of_origin?: string;
  position_number?: number | null;
  net_weight?: number | string | null;
}

export type FinancialReconciliationStatus = "PASS" | "WARNING" | "FAIL";

export interface FinancialReconciliationSource {
  id: "invoice_total" | "net_total" | "taxable_amount";
  label: string;
  value: number;
}

export interface FinancialReconciliationResult {
  invoice_total: number | null;
  calculated_total: number | null;
  difference: number | null;
  difference_ratio: number | null;
  validation_status: FinancialReconciliationStatus;
  compared_sources: FinancialReconciliationSource[];
  warning: string | null;
  likely_ocr_failure: boolean;
}

export type OcrTableRecoveryStatus =
  | "NOT_NEEDED"
  | "RECOVERED"
  | "OCR_TABLE_NOT_EXTRACTED"
  | "RECOVERY_REJECTED";

export type OcrTableRecoverySource =
  | "PRIMARY_OCR"
  | "TABLE_RECONSTRUCTION"
  | "TABLE_FOCUSED_OCR"
  | "SECONDARY_OCR_UNAVAILABLE"
  | "NO_TABLE_RECOVERED";

export interface OcrTableRecoveryDiagnostics {
  status: OcrTableRecoveryStatus;
  ocr_raw_items: number;
  ocr_recovered_items: number;
  recovery_source: OcrTableRecoverySource;
  metadata_detected: boolean;
  scanned_image_invoice: boolean;
  secondary_recovery_attempted: boolean;
  secondary_recovery_error?: string | null;
  recovery_score?: number | null;
  acceptance_reason?: string | null;
  rejection_reason?: string | null;
}

export type WeightExtractionSource = "DOCUMENT" | "CALCULATED" | "OCR_TABLE" | "OCR_TEXT";
export type WeightType = "UNIT" | "LINE" | "SHIPMENT";

export interface ShipmentSummary {
  package_count: number | null;
  package_type: string | null;
  gross_weight_total: number | null;
  gross_weight_unit: string | null;
  gross_weight_source?: WeightExtractionSource | null;
  gross_weight_type?: WeightType | null;
  net_weight_total: number | null;
  net_weight_unit: string | null;
  net_weight_source?: WeightExtractionSource | null;
  net_weight_type?: WeightType | null;
  pallet_dimensions: string | null;
  pallet_count: number | null;
}

export interface DeliveryAddress {
  company: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  country_code: string | null;
}

export interface NormalizedInvoice {
  invoice_number?: string | null;
  invoice_date?: string | null;
  exporter?: string | null;
  consignee?: string | null;
  country?: string | null;
  country_code?: string | null;
  incoterms?: string | null;
  currency?: string | null;
  /** Amount EUR from invoice totals page — highest priority for canonical value. */
  amount_eur?: string | number | null;
  total_value?: string | number | null;
  total_value_numeric?: number | null;
  vat_article?: string | null;
  items?: ApiInvoiceItem[];
  document_flags?: Record<string, boolean | string | number>;
  /** Per-field extraction source tracking for confidence scoring. */
  extraction_provenance?: import("@/lib/export-auditor/extraction-provenance").ExtractionProvenanceEntry[];
  /** Parser OCR output snapshot — captured before platform enrichment (not sent to backend). */
  parser_input_snapshot?: import("@/lib/export-auditor/parser-recovery-provenance").ParserInputSnapshot;
  /** Fields recovered when parser output was missing or invalid. */
  parser_recovery_provenance?: import("@/lib/export-auditor/parser-recovery-provenance").ParserRecoveryEntry[];
  /** Optional OCR-extracted origin / preference declaration block (footer legal text). */
  origin_declaration_text?: string | null;
  preference_declarations?: string[];
  /** Full OCR text for shipment-level pattern extraction (invoice-level only). */
  ocr_text?: string | null;
  shipment_notes?: string | null;
  packing_info?: string | null;
  footer_text?: string | null;
  delivery_notes?: string | null;
  shipment_summary?: ShipmentSummary;
  delivery_address?: DeliveryAddress;
  authorised_exporter_number?: string | null;
  /** Platform-side mandatory validation before HS Wizard enrichment. Not sent to backend. */
  financial_reconciliation?: FinancialReconciliationResult;
  /** OCR table recovery diagnostics for scanned/image-only invoice tables. */
  ocr_table_recovery?: OcrTableRecoveryDiagnostics;
  /** Page count and other OCR pipeline metadata (set server-side after PDF parse). */
  ocr_metadata?: {
    page_count?: number;
    pdf_text_length?: number;
    ocr_text_length?: number;
    extraction_source?: string;
    /** Cached pdf-parse text for re-enrichment after client round-trip. */
    extracted_pdf_text?: string;
    shipment_fields_detected?: string[];
    shipment_fields_missing?: string[];
    raw_ocr_has_shipment_summary?: boolean;
    raw_ocr_has_ocr_text?: boolean;
    raw_ocr_has_delivery_address?: boolean;
    scanned_image_invoice?: boolean;
    ocr_raw_items?: number;
    ocr_recovered_items?: number;
    recovery_source?: string;
    recovery_score?: number;
    recovery_rejection_reason?: string;
  };
}

export interface ReadinessResponse {
  score: number;
  status: string;
  checks_passed: number;
  checks_total: number;
  warnings: string[];
  errors: string[];
}

export interface PreferenceAnalysis {
  destination_outside_eu?: boolean;
  invoice_value?: number;
  origin_declaration_found?: boolean;
  authorised_exporter_found?: boolean;
  eur1_recommended?: boolean;
  required_documents?: string[];
  reason?: string;
  recommendation?: string;
}

export interface PreferenceOriginResponse {
  preference_analysis: PreferenceAnalysis;
}

export interface DispositionResponse {
  status?: string;
  exporter?: string;
  consignee?: string;
  country?: string;
  country_code?: string;
  invoice_number?: string;
  invoice_date?: string;
  incoterms?: string;
  currency?: string;
  total_value?: string;
  total_value_numeric?: number;
  vat_article?: string;
  total_items?: number;
  tariff_codes?: string[];
  countries_of_origin?: string[];
  missing_tariff_codes?: number;
  missing_country_of_origin?: number;
  summary?: string;
  disposition_text?: string;
}

export interface ApiAuditIssue {
  severity: "ERROR" | "WARNING" | "INFO" | string;
  code?: string;
  message: string;
  recommendation?: string;
}

export interface AuditReportResponse {
  audit_status: "READY" | "WARNING" | "ERROR" | string;
  readiness: {
    score: number;
    status: string;
    warnings: string[];
    errors: string[];
  };
  preference_origin: {
    preference_status?: string;
    destination_outside_eu?: boolean;
    invoice_value?: number;
    origin_declaration_found?: boolean;
    authorised_exporter_found?: boolean;
    eur1_recommended?: boolean;
    required_documents?: string[];
    recommendation?: string;
  };
  issues: ApiAuditIssue[];
  recommended_actions: string[];
  summary: string;
  shipment_summary?: ShipmentSummary;
  delivery_address?: DeliveryAddress;
  hs_aggregation?: ApiHsAggregationRow[];
  preferential_summary?: ApiPreferenceAggregationRow[];
  non_preferential_summary?: ApiPreferenceAggregationRow[];
  unknown_preference_summary?: ApiPreferenceAggregationRow[];
  mrn_summary?: ApiMrnSummary;
  mrn_export_ready?: boolean;
}

export interface ApiHsAggregationRow {
  hs_code: string;
  total_quantity: number;
  total_value: number;
  total_net_weight?: number | null;
  item_count: number;
  countries_of_origin: string[];
  source_positions?: number[];
}

export interface ApiPreferenceAggregationRow {
  hs_code: string;
  total_value: number;
  total_net_weight?: number | null;
  total_quantity?: number;
  source_positions?: number[];
}

export interface ApiMrnSummary {
  total_goods_lines: number;
  unique_hs_codes: number;
  total_invoice_value: number;
  total_net_weight?: number | null;
  total_gross_weight?: number | null;
  countries_of_origin: string[];
  excluded_service_lines?: number;
}

export interface ExportAuditorPipelineResponse {
  invoice: NormalizedInvoice;
  readiness: ReadinessResponse;
  disposition: DispositionResponse;
  preferenceOrigin: PreferenceOriginResponse;
  auditReport: AuditReportResponse;
}
