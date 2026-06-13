import type { NormalizedInvoice, ShipmentSummary } from "@/lib/export-auditor/api-types";

export type ShipmentExtractionSourceLabel =
  | "OCR Structured"
  | "OCR Text"
  | "PDF Text"
  | "Not Available";

export const NO_OCR_SHIPMENT_DATA = "NO_OCR_SHIPMENT_DATA";
export const NO_OCR_SHIPMENT_DATA_MESSAGE =
  "No shipment data returned by OCR provider.";

export interface ShipmentExtractionDiagnostics {
  primarySource: ShipmentExtractionSourceLabel;
  availableSources: ShipmentExtractionSourceLabel[];
  ocrStructuredAvailable: boolean;
  ocrTextAvailable: boolean;
  pdfTextAvailable: boolean;
  noOcrShipmentData: boolean;
  providerMessage: string | null;
}

const PAGE_MARKER_ONLY_RE = /^[\s\-–—0-9of]+$/i;

function hasStructuredShipmentData(summary?: ShipmentSummary | null): boolean {
  if (!summary) return false;
  return (
    summary.package_count != null ||
    summary.gross_weight_total != null ||
    summary.net_weight_total != null ||
    summary.pallet_count != null
  );
}

function hasStructuredDeliveryAddress(
  address?: NormalizedInvoice["delivery_address"]
): boolean {
  if (!address) return false;
  return Boolean(
    address.company?.trim() ||
      address.address?.trim() ||
      address.city?.trim() ||
      address.country?.trim() ||
      address.country_code?.trim()
  );
}

function isMeaningfulPdfText(pdfTextLength: number, pdfText?: string | null): boolean {
  if (pdfTextLength <= 0) return false;
  const text = pdfText?.trim() ?? "";
  if (!text) return pdfTextLength > 40;
  const withoutMarkers = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .trim();
  if (withoutMarkers.length < 20) return false;
  if (PAGE_MARKER_ONLY_RE.test(withoutMarkers.replace(/\s+/g, ""))) return false;
  return true;
}

function readRawOcrFlags(invoice: NormalizedInvoice): {
  ocrStructuredAvailable: boolean;
  ocrTextAvailable: boolean;
  pdfTextLength: number;
} {
  const meta = invoice.ocr_metadata;
  const ocrStructuredAvailable =
    meta?.raw_ocr_has_shipment_summary != null
      ? meta.raw_ocr_has_shipment_summary
      : hasStructuredShipmentData(invoice.shipment_summary);
  const ocrTextAvailable =
    meta?.raw_ocr_has_ocr_text != null
      ? meta.raw_ocr_has_ocr_text
      : Boolean(invoice.ocr_text?.trim());
  const pdfTextLength = meta?.pdf_text_length ?? 0;

  return { ocrStructuredAvailable, ocrTextAvailable, pdfTextLength };
}

/** Build shipment extraction diagnostics for UI and readiness messaging. */
export function buildShipmentExtractionDiagnostics(
  invoice: NormalizedInvoice,
  options?: { pdfText?: string | null }
): ShipmentExtractionDiagnostics {
  const { ocrStructuredAvailable, ocrTextAvailable, pdfTextLength } =
    readRawOcrFlags(invoice);

  const pdfTextAvailable = isMeaningfulPdfText(pdfTextLength, options?.pdfText ?? null);

  const rawOcrFlagsCaptured =
    invoice.ocr_metadata?.raw_ocr_has_shipment_summary != null &&
    invoice.ocr_metadata?.raw_ocr_has_ocr_text != null &&
    invoice.ocr_metadata?.raw_ocr_has_delivery_address != null;

  const noOcrShipmentData = rawOcrFlagsCaptured
    ? invoice.ocr_metadata!.raw_ocr_has_shipment_summary === false &&
      invoice.ocr_metadata!.raw_ocr_has_ocr_text === false &&
      invoice.ocr_metadata!.raw_ocr_has_delivery_address === false &&
      !pdfTextAvailable
    : !ocrStructuredAvailable && !ocrTextAvailable && !pdfTextAvailable;

  const availableSources: ShipmentExtractionSourceLabel[] = [];
  if (ocrStructuredAvailable) availableSources.push("OCR Structured");
  if (ocrTextAvailable) availableSources.push("OCR Text");
  if (pdfTextAvailable) availableSources.push("PDF Text");
  if (availableSources.length === 0) availableSources.push("Not Available");

  let primarySource: ShipmentExtractionSourceLabel = "Not Available";
  if (hasStructuredShipmentData(invoice.shipment_summary) && ocrStructuredAvailable) {
    primarySource = "OCR Structured";
  } else if (ocrTextAvailable) {
    primarySource = "OCR Text";
  } else if (pdfTextAvailable) {
    primarySource = "PDF Text";
  } else if (ocrStructuredAvailable) {
    primarySource = "OCR Structured";
  }

  return {
    primarySource,
    availableSources,
    ocrStructuredAvailable,
    ocrTextAvailable,
    pdfTextAvailable,
    noOcrShipmentData,
    providerMessage: noOcrShipmentData ? NO_OCR_SHIPMENT_DATA_MESSAGE : null,
  };
}

/** Capture raw OCR shipment availability before platform enrichment mutates fields. */
export function attachRawOcrShipmentMetadata(
  invoice: NormalizedInvoice,
  pdfTextLength: number
): NormalizedInvoice {
  return {
    ...invoice,
    ocr_metadata: {
      ...invoice.ocr_metadata,
      pdf_text_length: pdfTextLength,
      raw_ocr_has_shipment_summary: hasStructuredShipmentData(invoice.shipment_summary),
      raw_ocr_has_ocr_text: Boolean(invoice.ocr_text?.trim()),
      raw_ocr_has_delivery_address: hasStructuredDeliveryAddress(invoice.delivery_address),
    },
  };
}
