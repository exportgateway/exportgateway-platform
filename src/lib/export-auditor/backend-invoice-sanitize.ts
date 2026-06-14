import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";

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

/** Platform-only flags — never forwarded to export-auditor JSON endpoints. */
const INTERNAL_DOCUMENT_FLAG_KEYS = new Set([
  "PARSER_MAPPING_FAILURE",
  "TOTAL_VALUE_PARSING_ERROR",
]);

function toBackendString(value: number | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function deriveUnitPrice(
  quantity: string | undefined,
  lineTotal: string | undefined,
  unitPrice: string | undefined
): string {
  if (unitPrice) return unitPrice;
  if (!quantity || !lineTotal) return "0.00";
  const qty = parseLocaleNumber(quantity);
  const total = parseLocaleNumber(lineTotal);
  if (qty > 0 && total > 0) {
    return (total / qty).toFixed(2);
  }
  return "0.00";
}

/** Backend InvoiceItem schema requires quantity, unit_price, line_total as strings. */
function sanitizeItemForBackend(item: ApiInvoiceItem): ApiInvoiceItem {
  const quantity = toBackendString(item.quantity) ?? "1";
  const line_total = toBackendString(item.line_total) ?? "0.00";
  const unit_price = deriveUnitPrice(
    quantity,
    line_total,
    toBackendString(item.unit_price)
  );

  const sanitized: ApiInvoiceItem = {
    ...item,
    quantity,
    unit_price,
    line_total,
  };

  if (item.net_weight != null) {
    sanitized.net_weight = toBackendString(item.net_weight) ?? String(item.net_weight);
  }

  if (item.description != null) {
    sanitized.description = String(item.description);
  }

  return sanitized;
}

function sanitizeItemsForBackend(items: ApiInvoiceItem[] | undefined): ApiInvoiceItem[] | undefined {
  if (!items?.length) return items;
  return items.map(sanitizeItemForBackend);
}

function sanitizeDocumentFlagsForBackend(
  flags: NormalizedInvoice["document_flags"]
): Record<string, string> | undefined {
  if (!flags) return undefined;

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (INTERNAL_DOCUMENT_FLAG_KEYS.has(key)) continue;
    if (typeof value === "string" && value.trim()) {
      sanitized[key] = value.trim();
    } else if (value === true) {
      sanitized[key] = "true";
    } else if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = String(value);
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeOcrMetadata(
  meta: NonNullable<NormalizedInvoice["ocr_metadata"]> | undefined
): NormalizedInvoice["ocr_metadata"] {
  if (!meta) return undefined;

  const ocr_metadata: NonNullable<NormalizedInvoice["ocr_metadata"]> = {};
  for (const key of BACKEND_OCR_METADATA_KEYS) {
    const value = meta[key];
    if (value !== undefined) {
      (ocr_metadata as Record<string, unknown>)[key] = value;
    }
  }

  return Object.keys(ocr_metadata).length > 0 ? ocr_metadata : undefined;
}

function sanitizeTopLevelScalars(invoice: NormalizedInvoice): NormalizedInvoice {
  const next = { ...invoice };

  if (typeof next.total_value === "number") {
    next.total_value = next.total_value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (typeof next.amount_eur === "number") {
    next.amount_eur = String(next.amount_eur);
  }

  return next;
}

/** Remove null values — backend Pydantic rejects null where str is required. */
function omitNullFields<T>(value: T): T {
  if (value === null || value === undefined) {
    return undefined as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => omitNullFields(entry)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === null || entry === undefined) continue;
      const cleaned = omitNullFields(entry);
      if (cleaned !== undefined && cleaned !== null) {
        out[key] = cleaned;
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Strip platform-only invoice fields before POSTing to export-auditor JSON endpoints.
 * Backend nested models use extra=forbid and reject unknown keys (e.g. pdf_text_length
 * before backend schema catch-up).
 *
 * Also coerces line-item numeric fields to strings — Pydantic rejects number quantity
 * with "Input should be a valid string" (common after OCR table recovery).
 */
export function sanitizeInvoiceForBackendApi(invoice: NormalizedInvoice): NormalizedInvoice {
  const {
    extraction_provenance: _provenance,
    preference_declarations: _prefs,
    parser_input_snapshot: _parserSnapshot,
    parser_recovery_provenance: _parserRecovery,
    document_flags,
    items,
    ocr_metadata,
    ...rest
  } = sanitizeTopLevelScalars(invoice);

  const sanitized: NormalizedInvoice = {
    ...rest,
    items: sanitizeItemsForBackend(items),
    document_flags: sanitizeDocumentFlagsForBackend(document_flags),
    ocr_metadata: sanitizeOcrMetadata(ocr_metadata),
  };

  return omitNullFields(sanitized) as NormalizedInvoice;
}
