import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";

/** Fields accepted by export-auditor NormalizedInvoice.ocr_metadata. */
const BACKEND_OCR_METADATA_KEYS = [
  "page_count",
  "ocr_text_length",
  "extraction_source",
  "shipment_fields_detected",
  "shipment_fields_missing",
  "raw_ocr_has_shipment_summary",
  "raw_ocr_has_ocr_text",
  "raw_ocr_has_delivery_address",
] as const;

/**
 * Strip platform-only invoice fields before POSTing to export-auditor JSON endpoints.
 * Backend nested models use extra=forbid and reject unknown keys (e.g. pdf_text_length
 * before backend schema catch-up).
 */
export function sanitizeInvoiceForBackendApi(invoice: NormalizedInvoice): NormalizedInvoice {
  const {
    extraction_provenance: _provenance,
    preference_declarations: _prefs,
    ...rest
  } = invoice;

  const meta = invoice.ocr_metadata;
  if (!meta) {
    return rest;
  }

  const ocr_metadata: NonNullable<NormalizedInvoice["ocr_metadata"]> = {};
  for (const key of BACKEND_OCR_METADATA_KEYS) {
    const value = meta[key];
    if (value !== undefined) {
      (ocr_metadata as Record<string, unknown>)[key] = value;
    }
  }

  return {
    ...rest,
    ocr_metadata: Object.keys(ocr_metadata).length > 0 ? ocr_metadata : undefined,
  };
}
