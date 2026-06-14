import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { isRejectedConsigneeText } from "@/lib/export-auditor/english-invoice-field-extractor";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";

export type RecoverySource =
  | "OCR_TOTAL_RECOVERY"
  | "OCR_CONSIGNEE_RECOVERY"
  | "OCR_DESTINATION_RECOVERY"
  | "TABLE_RECONSTRUCTION"
  | "WIZARD_HS_RECOVERY"
  | "WEIGHT_HIERARCHY_RECOVERY";

export interface ParserRecoveryEntry {
  field: string;
  original_value: string | null;
  recovered_value: string;
  recovery_source: RecoverySource;
}

export interface ParserInputSnapshot {
  invoice_number?: string | null;
  invoice_date?: string | null;
  exporter?: string | null;
  consignee?: string | null;
  country?: string | null;
  country_code?: string | null;
  total_value?: string | number | null;
  total_value_numeric?: number | null;
  item_count: number;
  gross_weight_total?: number | null;
  net_weight_total?: number | null;
  hs_code_count: number;
}

export function serializeRecoveryValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function captureParserInputSnapshot(invoice: NormalizedInvoice): ParserInputSnapshot {
  let hsCodeCount = 0;
  for (const item of invoice.items ?? []) {
    const raw = item.hs_code ?? item.invoice_hs_code ?? null;
    if (raw && normalizeHsToken(raw)) {
      hsCodeCount += 1;
    }
  }

  return {
    invoice_number: invoice.invoice_number ?? null,
    invoice_date: invoice.invoice_date ?? null,
    exporter: invoice.exporter ?? null,
    consignee: invoice.consignee ?? null,
    country: invoice.country ?? null,
    country_code: invoice.country_code ?? null,
    total_value: invoice.total_value ?? null,
    total_value_numeric: invoice.total_value_numeric ?? null,
    item_count: invoice.items?.length ?? 0,
    gross_weight_total: invoice.shipment_summary?.gross_weight_total ?? null,
    net_weight_total: invoice.shipment_summary?.net_weight_total ?? null,
    hs_code_count: hsCodeCount,
  };
}

export function isParserConsigneeInvalid(consignee: string | null | undefined): boolean {
  return isRejectedConsigneeText(consignee);
}

export function isParserFieldValid(field: string, snapshot: ParserInputSnapshot): boolean {
  switch (field) {
    case "invoice_number":
      return Boolean(snapshot.invoice_number?.trim());
    case "invoice_date":
      return Boolean(snapshot.invoice_date?.trim());
    case "exporter":
      return Boolean(snapshot.exporter?.trim());
    case "consignee":
      return Boolean(snapshot.consignee?.trim()) && !isParserConsigneeInvalid(snapshot.consignee);
    case "invoice_value":
      return resolveInvoiceValue(snapshot as NormalizedInvoice) > 0;
    case "destination_country":
      return Boolean(snapshot.country_code?.trim() || snapshot.country?.trim());
    case "line_items":
      return snapshot.item_count > 0;
    case "gross_weight":
      return (snapshot.gross_weight_total ?? 0) > 0;
    case "net_weight":
      return (snapshot.net_weight_total ?? 0) > 0;
    case "hs_codes":
      return snapshot.hs_code_count > 0;
    default:
      return false;
  }
}

export function recordParserRecovery(
  invoice: NormalizedInvoice,
  entry: Omit<ParserRecoveryEntry, "original_value"> & { original_value?: string | null }
): NormalizedInvoice {
  const snapshot = invoice.parser_input_snapshot;
  const original =
    entry.original_value ??
    (snapshot ? readSnapshotFieldValue(snapshot, entry.field) : null);

  const normalized: ParserRecoveryEntry = {
    field: entry.field,
    original_value: original,
    recovered_value: entry.recovered_value,
    recovery_source: entry.recovery_source,
  };

  const existing = invoice.parser_recovery_provenance ?? [];
  const next = existing.filter((row) => row.field !== entry.field);
  next.push(normalized);

  return {
    ...invoice,
    parser_recovery_provenance: next,
  };
}

function readSnapshotFieldValue(snapshot: ParserInputSnapshot, field: string): string | null {
  switch (field) {
    case "invoice_number":
      return serializeRecoveryValue(snapshot.invoice_number);
    case "invoice_date":
      return serializeRecoveryValue(snapshot.invoice_date);
    case "exporter":
      return serializeRecoveryValue(snapshot.exporter);
    case "consignee":
      return serializeRecoveryValue(snapshot.consignee);
    case "invoice_value":
      return serializeRecoveryValue(
        snapshot.total_value_numeric ?? snapshot.total_value ?? null
      );
    case "destination_country":
      return serializeRecoveryValue(snapshot.country_code ?? snapshot.country);
    case "line_items":
      return snapshot.item_count > 0 ? String(snapshot.item_count) : null;
    case "gross_weight":
      return serializeRecoveryValue(snapshot.gross_weight_total);
    case "net_weight":
      return serializeRecoveryValue(snapshot.net_weight_total);
    case "hs_codes":
      return snapshot.hs_code_count > 0 ? String(snapshot.hs_code_count) : null;
    default:
      return null;
  }
}

export function attachParserInputSnapshot(invoice: NormalizedInvoice): NormalizedInvoice {
  if (invoice.parser_input_snapshot) {
    return invoice;
  }
  return {
    ...invoice,
    parser_input_snapshot: captureParserInputSnapshot(invoice),
  };
}
