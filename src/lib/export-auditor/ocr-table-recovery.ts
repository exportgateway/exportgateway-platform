import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import type { AuditIssue } from "@/lib/export-auditor/types";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import { normalizeHsToken } from "@/lib/export-auditor/hs-code-normalize";
import { reconcileInvoiceFinancials } from "@/lib/export-auditor/financial-reconciliation";

export const OCR_TABLE_NOT_EXTRACTED = "OCR_TABLE_NOT_EXTRACTED";
export const OCR_TABLE_NOT_EXTRACTED_MESSAGE =
  "Invoice product table was not extracted by OCR provider.";
export const OCR_TABLE_RECOVERY_REJECTED = "RECOVERY_REJECTED";
export const OCR_TABLE_RECOVERY_REJECTED_MESSAGE =
  "OCR table recovery was rejected because it would reduce invoice quality.";
export const OCR_TABLE_RECOVERY_MIN_SCORE = 70;
export const OCR_TABLE_RECOVERY_MIN_ITEMS = 3;

export type OcrTableRecoveryStatus =
  | "NOT_NEEDED"
  | "RECOVERED"
  | typeof OCR_TABLE_NOT_EXTRACTED
  | typeof OCR_TABLE_RECOVERY_REJECTED;

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

export interface OcrRecoveryQualityDecision {
  accepted: boolean;
  score: number;
  acceptance_reason: string | null;
  rejection_reason: string | null;
  recovered_item_count: number;
  commercial_row_quality: number;
  valid_hs_ratio: number;
  financial_reconciliation_status: string;
  invoice_total_match: boolean;
  header_metadata_preserved: boolean;
  header_fields_lost: string[];
  address_footer_rows: number;
}

export interface OcrTableRecoveryOptions {
  pdfText?: string | null;
  secondaryRecoveryAttempted?: boolean;
  secondaryRecoveryError?: string | null;
  recoverySource?: OcrTableRecoverySource | null;
  recoveryQuality?: OcrRecoveryQualityDecision | null;
}

const GENERIC_ZERO_LINE_CODES = new Set([
  "MISSING_HS_CODE",
  "NO_HS_CODE",
  "NO_HS_CODES",
  "NO_HS_CODES_DETECTED",
  "HS_AGGREGATION_MISSING",
  "TRACEABILITY_MISSING",
  "EXTRACTION_INTEGRITY_ERROR",
  "FINANCIAL_RECONCILIATION_FAIL",
  "FINANCIAL_RECONCILIATION_WARNING",
]);

function itemCount(invoice: NormalizedInvoice): number {
  return invoice.items?.length ?? 0;
}

function isNonEmpty(value: string | number | null | undefined): boolean {
  if (value == null) return false;
  return String(value).trim().length > 0;
}

function hasItemValue(item: ApiInvoiceItem, field: keyof ApiInvoiceItem): boolean {
  const value = item[field];
  if (value == null) return false;
  return String(value).trim().length > 0;
}

const ADDRESS_OR_FOOTER_ROW_RE =
  /\b(?:rue|avenue|boulevard|street|cesta|bp\s*\d*|po box|postal|zip|tel\.?|phone|fax|email|www\.|iban|swift|bank|authori[sz]ed|exporter|origin declaration|products covered by this|preferential origin|invoice declaration|sales representative|signature)\b/i;

function rowContainsAddressOrFooterContent(item: ApiInvoiceItem): boolean {
  const text = [item.item_code, item.description, item.country_of_origin, item.hs_code]
    .map((part) => String(part ?? ""))
    .join(" ");
  return ADDRESS_OR_FOOTER_ROW_RE.test(text);
}

function commercialRowQuality(items: ApiInvoiceItem[]): {
  quality: number;
  addressFooterRows: number;
} {
  if (items.length === 0) return { quality: 0, addressFooterRows: 0 };

  let goodRows = 0;
  let addressFooterRows = 0;
  for (const item of items) {
    const addressFooter = rowContainsAddressOrFooterContent(item);
    if (addressFooter) addressFooterRows += 1;
    const hasCommercialShape =
      hasItemValue(item, "description") &&
      hasItemValue(item, "quantity") &&
      hasItemValue(item, "line_total") &&
      !addressFooter;
    if (hasCommercialShape) goodRows += 1;
  }

  return {
    quality: Math.round((goodRows / items.length) * 100),
    addressFooterRows,
  };
}

function validHsRatio(items: ApiInvoiceItem[]): number {
  if (items.length === 0) return 0;
  const withHs = items.filter((item) => {
    const raw = item.final_hs_code ?? item.hs_code ?? item.invoice_hs_code ?? item.wizard_hs_code;
    return normalizeHsToken(raw) != null;
  }).length;
  return Math.round((withHs / items.length) * 100);
}

function lostHeaderFields(primary: NormalizedInvoice, recovered: NormalizedInvoice): string[] {
  const fields = [
    ["invoice_number", primary.invoice_number, recovered.invoice_number],
    ["invoice_date", primary.invoice_date, recovered.invoice_date],
    ["incoterms", primary.incoterms, recovered.incoterms],
  ] as const;
  return fields
    .filter(([, before, after]) => isNonEmpty(before) && !isNonEmpty(after))
    .map(([field]) => field);
}

function scoreRecoveryQuality(input: {
  recoveredItemCount: number;
  reconciliationStatus: string;
  invoiceTotalMatch: boolean;
  commercialQuality: number;
  headerMetadataPreserved: boolean;
  hsRatio: number;
}): number {
  const itemScore = Math.min(input.recoveredItemCount / OCR_TABLE_RECOVERY_MIN_ITEMS, 1) * 20;
  const reconciliationScore =
    input.reconciliationStatus === "PASS"
      ? 25
      : input.reconciliationStatus === "WARNING"
        ? 10
        : 0;
  const totalScore = input.invoiceTotalMatch ? 10 : 0;
  const rowScore = input.commercialQuality * 0.2;
  const headerScore = input.headerMetadataPreserved ? 15 : 0;
  const hsScore = input.hsRatio * 0.1;
  return Math.round(itemScore + reconciliationScore + totalScore + rowScore + headerScore + hsScore);
}

export function evaluateOcrRecoveryQuality(
  primary: NormalizedInvoice,
  recovered: NormalizedInvoice
): OcrRecoveryQualityDecision {
  const recoveredItems = recovered.items ?? [];
  const recoveredItemCount = recoveredItems.length;
  const reconciliation = reconcileInvoiceFinancials(recovered);
  const invoiceTotalMatch = reconciliation.validation_status === "PASS";
  const rowQuality = commercialRowQuality(recoveredItems);
  const hsRatio = validHsRatio(recoveredItems);
  const headerFieldsLost = lostHeaderFields(primary, recovered);
  const headerMetadataPreserved = headerFieldsLost.length === 0;
  const score = scoreRecoveryQuality({
    recoveredItemCount,
    reconciliationStatus: reconciliation.validation_status,
    invoiceTotalMatch,
    commercialQuality: rowQuality.quality,
    headerMetadataPreserved,
    hsRatio,
  });

  const rejectionReasons: string[] = [];
  if (recoveredItemCount < OCR_TABLE_RECOVERY_MIN_ITEMS) {
    rejectionReasons.push(
      `recovered item count ${recoveredItemCount} is below minimum ${OCR_TABLE_RECOVERY_MIN_ITEMS}`
    );
  }
  if (reconciliation.validation_status === "FAIL") {
    rejectionReasons.push("financial reconciliation failed");
  }
  if (rowQuality.addressFooterRows > 0) {
    rejectionReasons.push(`${rowQuality.addressFooterRows} recovered row(s) contain address/footer content`);
  }
  if (headerFieldsLost.includes("invoice_number")) {
    rejectionReasons.push("invoice number would be lost");
  }
  if (headerFieldsLost.includes("invoice_date")) {
    rejectionReasons.push("invoice date would be lost");
  }
  if (headerFieldsLost.includes("incoterms")) {
    rejectionReasons.push("incoterms would be lost");
  }
  if (score < OCR_TABLE_RECOVERY_MIN_SCORE) {
    rejectionReasons.push(`recovery quality score ${score} is below threshold ${OCR_TABLE_RECOVERY_MIN_SCORE}`);
  }

  return {
    accepted: rejectionReasons.length === 0,
    score,
    acceptance_reason:
      rejectionReasons.length === 0
        ? `accepted recovery score ${score}; ${recoveredItemCount} recovered item(s)`
        : null,
    rejection_reason: rejectionReasons.join("; ") || null,
    recovered_item_count: recoveredItemCount,
    commercial_row_quality: rowQuality.quality,
    valid_hs_ratio: hsRatio,
    financial_reconciliation_status: reconciliation.validation_status,
    invoice_total_match: invoiceTotalMatch,
    header_metadata_preserved: headerMetadataPreserved,
    header_fields_lost: headerFieldsLost,
    address_footer_rows: rowQuality.addressFooterRows,
  };
}

function hasShipmentMetadata(invoice: NormalizedInvoice): boolean {
  const shipment = invoice.shipment_summary;
  return Boolean(
    shipment?.package_count != null ||
      shipment?.pallet_count != null ||
      shipment?.gross_weight_total != null ||
      shipment?.net_weight_total != null
  );
}

function hasDeliveryMetadata(invoice: NormalizedInvoice): boolean {
  const delivery = invoice.delivery_address;
  return Boolean(
    delivery?.company?.trim() ||
      delivery?.address?.trim() ||
      delivery?.city?.trim() ||
      delivery?.country?.trim() ||
      delivery?.country_code?.trim()
  );
}

export function hasInvoiceMetadata(invoice: NormalizedInvoice): boolean {
  return Boolean(
    isNonEmpty(invoice.invoice_number) ||
      isNonEmpty(invoice.invoice_date) ||
      isNonEmpty(invoice.exporter) ||
      isNonEmpty(invoice.consignee) ||
      isNonEmpty(invoice.country) ||
      isNonEmpty(invoice.country_code) ||
      isNonEmpty(invoice.incoterms) ||
      resolveInvoiceValue(invoice) > 0 ||
      hasShipmentMetadata(invoice) ||
      hasDeliveryMetadata(invoice) ||
      (invoice.ocr_text?.trim().length ?? 0) > 0 ||
      invoice.ocr_metadata?.raw_ocr_has_ocr_text === true ||
      invoice.ocr_metadata?.raw_ocr_has_delivery_address === true ||
      invoice.ocr_metadata?.raw_ocr_has_shipment_summary === true
  );
}

export function isScannedImageInvoice(
  invoice: NormalizedInvoice,
  pdfText?: string | null
): boolean {
  const pageCount = invoice.ocr_metadata?.page_count ?? 1;
  const localPdfTextLength =
    pdfText?.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "").trim().length ??
    invoice.ocr_metadata?.pdf_text_length ??
    0;
  const ocrTextLength = invoice.ocr_text?.length ?? invoice.ocr_metadata?.ocr_text_length ?? 0;

  return pageCount > 0 && localPdfTextLength < 100 && ocrTextLength > 500;
}

export function shouldAttemptSecondaryOcrTableRecovery(invoice: NormalizedInvoice): boolean {
  return itemCount(invoice) === 0 && hasInvoiceMetadata(invoice);
}

function inferRecoverySource(
  recoveredInvoice: NormalizedInvoice,
  options?: OcrTableRecoveryOptions
): OcrTableRecoverySource {
  if (options?.recoverySource) return options.recoverySource;
  const lineRecovery = recoveredInvoice.parser_recovery_provenance?.find(
    (entry) => entry.field === "line_items"
  );
  if (lineRecovery?.recovery_source === "TABLE_RECONSTRUCTION") {
    return "TABLE_RECONSTRUCTION";
  }
  if (recoveredInvoice.document_flags?.line_items_recovered === true) {
    return "TABLE_RECONSTRUCTION";
  }
  return "PRIMARY_OCR";
}

export function buildOcrTableRecoveryDiagnostics(
  rawInvoice: NormalizedInvoice,
  recoveredInvoice: NormalizedInvoice,
  options?: OcrTableRecoveryOptions
): OcrTableRecoveryDiagnostics {
  const rawItems = itemCount(rawInvoice);
  const recoveredItems =
    options?.recoveryQuality?.recovered_item_count ?? itemCount(recoveredInvoice);
  const metadataDetected = hasInvoiceMetadata(rawInvoice);
  const scannedImageInvoice = isScannedImageInvoice(rawInvoice, options?.pdfText);

  let status: OcrTableRecoveryStatus = "NOT_NEEDED";
  let recoverySource: OcrTableRecoverySource = "PRIMARY_OCR";

  if (options?.recoveryQuality && !options.recoveryQuality.accepted) {
    status = OCR_TABLE_RECOVERY_REJECTED;
    recoverySource = options.recoverySource ?? "NO_TABLE_RECOVERED";
  } else if (rawItems === 0 && recoveredItems > 0) {
    status = "RECOVERED";
    recoverySource = inferRecoverySource(recoveredInvoice, options);
  } else if (rawItems === 0 && metadataDetected && recoveredItems === 0) {
    status = OCR_TABLE_NOT_EXTRACTED;
    recoverySource = options?.secondaryRecoveryAttempted
      ? "NO_TABLE_RECOVERED"
      : "SECONDARY_OCR_UNAVAILABLE";
  }

  return {
    status,
    ocr_raw_items: rawItems,
    ocr_recovered_items: recoveredItems,
    recovery_source: recoverySource,
    metadata_detected: metadataDetected,
    scanned_image_invoice: scannedImageInvoice,
    secondary_recovery_attempted: options?.secondaryRecoveryAttempted ?? false,
    secondary_recovery_error: options?.secondaryRecoveryError ?? null,
    recovery_score: options?.recoveryQuality?.score ?? null,
    acceptance_reason: options?.recoveryQuality?.acceptance_reason ?? null,
    rejection_reason: options?.recoveryQuality?.rejection_reason ?? null,
  };
}

export function annotateOcrTableRecovery(
  rawInvoice: NormalizedInvoice,
  recoveredInvoice: NormalizedInvoice,
  options?: OcrTableRecoveryOptions
): NormalizedInvoice {
  const diagnostics = buildOcrTableRecoveryDiagnostics(rawInvoice, recoveredInvoice, options);
  const flags = {
    ...recoveredInvoice.document_flags,
    ...(diagnostics.status === OCR_TABLE_NOT_EXTRACTED
      ? { [OCR_TABLE_NOT_EXTRACTED]: true }
      : {}),
    ...(diagnostics.status === "RECOVERED" ? { ocr_table_recovered: true } : {}),
    ...(diagnostics.status === OCR_TABLE_RECOVERY_REJECTED
      ? { ocr_table_recovery_rejected: true }
      : {}),
  };

  return {
    ...recoveredInvoice,
    document_flags: flags,
    ocr_table_recovery: diagnostics,
    ocr_metadata: {
      ...recoveredInvoice.ocr_metadata,
      scanned_image_invoice: diagnostics.scanned_image_invoice,
      ocr_raw_items: diagnostics.ocr_raw_items,
      ocr_recovered_items: diagnostics.ocr_recovered_items,
      recovery_source: diagnostics.recovery_source,
      ...(diagnostics.recovery_score != null
        ? { recovery_score: diagnostics.recovery_score }
        : {}),
      ...(diagnostics.rejection_reason
        ? { recovery_rejection_reason: diagnostics.rejection_reason }
        : {}),
    },
  };
}

export function mergeRecoveredInvoiceItems(
  primary: NormalizedInvoice,
  recovered: NormalizedInvoice,
  quality: OcrRecoveryQualityDecision = evaluateOcrRecoveryQuality(primary, recovered)
): NormalizedInvoice {
  const primaryCount = itemCount(primary);
  const recoveredItems = recovered.items ?? [];
  if (recoveredItems.length <= primaryCount) return primary;
  if (!quality.accepted) return primary;

  return {
    ...primary,
    items: recoveredItems.map((item: ApiInvoiceItem, index: number) => ({
      ...item,
      position_number: item.position_number ?? index + 1,
    })),
    document_flags: {
      ...primary.document_flags,
      ocr_table_recovered: true,
      line_items_recovered: true,
    },
  };
}

export function ocrTableRecoveryIssues(
  diagnostics: OcrTableRecoveryDiagnostics | undefined
): AuditIssue[] {
  if (!diagnostics) return [];
  if (diagnostics.status === OCR_TABLE_RECOVERY_REJECTED) {
    return [
      {
        id: OCR_TABLE_RECOVERY_REJECTED,
        type: "warning",
        field: OCR_TABLE_RECOVERY_REJECTED,
        message:
          diagnostics.rejection_reason ??
          OCR_TABLE_RECOVERY_REJECTED_MESSAGE,
      },
    ];
  }
  if (diagnostics.status !== OCR_TABLE_NOT_EXTRACTED) return [];
  return [
    {
      id: OCR_TABLE_NOT_EXTRACTED,
      type: "warning",
      field: OCR_TABLE_NOT_EXTRACTED,
      message: OCR_TABLE_NOT_EXTRACTED_MESSAGE,
    },
  ];
}

export function filterGenericIssuesForOcrTableFailure(
  issues: AuditIssue[],
  diagnostics: OcrTableRecoveryDiagnostics | undefined
): AuditIssue[] {
  if (
    !diagnostics ||
    (diagnostics.status !== OCR_TABLE_NOT_EXTRACTED &&
      diagnostics.status !== OCR_TABLE_RECOVERY_REJECTED)
  ) {
    return issues;
  }
  return issues.filter((issue) => {
    const code = issue.field ?? issue.id;
    if (GENERIC_ZERO_LINE_CODES.has(code)) return false;
    if (/no hs code|missing hs|traceability.*empty|aggregation.*not generated/i.test(issue.message)) {
      return false;
    }
    return true;
  });
}
