import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { isValidConsigneeText } from "@/lib/export-auditor/english-invoice-field-extractor";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import type { HsWorkflowSummary } from "@/lib/export-auditor/types";
import {
  type ParserInputSnapshot,
  type ParserRecoveryEntry,
  type RecoverySource,
  serializeRecoveryValue,
} from "@/lib/export-auditor/parser-recovery-provenance";

export type FieldRecoveryStatusKind = "parsed" | "recovered" | "missing";

export interface FieldRecoveryStatus {
  field: string;
  label: string;
  status: FieldRecoveryStatusKind;
  recovery_source?: RecoverySource;
  original_value?: string | null;
  recovered_value?: string | null;
  display_value?: string | null;
}

export interface DataRecoveryDiagnostics {
  fieldsParsedNormally: number;
  fieldsRecovered: number;
  fieldsMissing: number;
  recoveryCount: number;
  recoveryPercentage: number;
  totalTrackedFields: number;
  fieldStatuses: FieldRecoveryStatus[];
  recoveries: ParserRecoveryEntry[];
  highRecoveryRisk: boolean;
}

const TRACKED_FIELDS: Array<{ field: string; label: string }> = [
  { field: "invoice_number", label: "Invoice Number" },
  { field: "consignee", label: "Consignee" },
  { field: "exporter", label: "Exporter" },
  { field: "invoice_value", label: "Invoice Value" },
  { field: "destination_country", label: "Destination Country" },
  { field: "line_items", label: "Line Items" },
  { field: "gross_weight", label: "Gross Weight" },
  { field: "hs_codes", label: "HS Codes" },
];

export const HIGH_RECOVERY_RISK_THRESHOLD = 30;

function readFinalFieldValue(invoice: NormalizedInvoice, field: string): string | null {
  switch (field) {
    case "invoice_number":
      return serializeRecoveryValue(invoice.invoice_number);
    case "invoice_date":
      return serializeRecoveryValue(invoice.invoice_date);
    case "exporter":
      return serializeRecoveryValue(invoice.exporter);
    case "consignee":
      return isValidConsigneeText(invoice.consignee)
        ? serializeRecoveryValue(invoice.consignee)
        : null;
    case "invoice_value": {
      const value = resolveInvoiceValue(invoice);
      return value > 0 ? String(value) : null;
    }
    case "destination_country":
      return serializeRecoveryValue(invoice.country_code ?? invoice.country);
    case "line_items": {
      const count = invoice.items?.length ?? 0;
      return count > 0 ? String(count) : null;
    }
    case "gross_weight":
      return serializeRecoveryValue(invoice.shipment_summary?.gross_weight_total);
    case "net_weight":
      return serializeRecoveryValue(invoice.shipment_summary?.net_weight_total);
    case "hs_codes": {
      let count = 0;
      for (const item of invoice.items ?? []) {
        const raw =
          item.final_hs_code ?? item.hs_code ?? item.invoice_hs_code ?? null;
        if (raw && normalizeHsToken(raw)) {
          count += 1;
        }
      }
      return count > 0 ? String(count) : null;
    }
    default:
      return null;
  }
}

function isFinalFieldPresent(invoice: NormalizedInvoice, field: string): boolean {
  return readFinalFieldValue(invoice, field) != null;
}

function buildRecoveryMap(recoveries: ParserRecoveryEntry[]): Map<string, ParserRecoveryEntry> {
  return new Map(recoveries.map((entry) => [entry.field, entry]));
}

export function buildDataRecoveryDiagnostics(
  invoice: NormalizedInvoice,
  options?: { hsWorkflowSummary?: HsWorkflowSummary }
): DataRecoveryDiagnostics {
  const snapshot = invoice.parser_input_snapshot;
  let recoveries = [...(invoice.parser_recovery_provenance ?? [])];

  if (options?.hsWorkflowSummary) {
    const wizardLines = options.hsWorkflowSummary.lineClassifications.filter(
      (line) => line.hsSource === "WIZARD" && line.finalHsCode
    );
    if (
      wizardLines.length > 0 &&
      !recoveries.some((entry) => entry.field === "hs_codes")
    ) {
      recoveries = [
        ...recoveries,
        {
          field: "hs_codes",
          original_value: snapshot?.hs_code_count ? String(snapshot.hs_code_count) : null,
          recovered_value: String(wizardLines.length),
          recovery_source: "WIZARD_HS_RECOVERY",
        },
      ];
    }
  }

  const recoveryMap = buildRecoveryMap(recoveries);
  const fieldStatuses: FieldRecoveryStatus[] = TRACKED_FIELDS.map(({ field, label }) => {
    const recovery = recoveryMap.get(field);
    const display_value = readFinalFieldValue(invoice, field);

    if (recovery) {
      return {
        field,
        label,
        status: "recovered",
        recovery_source: recovery.recovery_source,
        original_value: recovery.original_value,
        recovered_value: recovery.recovered_value,
        display_value,
      };
    }

    if (display_value) {
      return {
        field,
        label,
        status: "parsed",
        display_value,
      };
    }

    return {
      field,
      label,
      status: "missing",
      original_value: snapshot ? readSnapshotFieldValue(snapshot, field) : null,
      display_value: null,
    };
  });

  const fieldsParsedNormally = fieldStatuses.filter((row) => row.status === "parsed").length;
  const fieldsRecovered = fieldStatuses.filter((row) => row.status === "recovered").length;
  const fieldsMissing = fieldStatuses.filter((row) => row.status === "missing").length;
  const totalTrackedFields = fieldStatuses.length;
  const recoveryPercentage =
    totalTrackedFields > 0
      ? Math.round((fieldsRecovered / totalTrackedFields) * 100)
      : 0;

  return {
    fieldsParsedNormally,
    fieldsRecovered,
    fieldsMissing,
    recoveryCount: fieldsRecovered,
    recoveryPercentage,
    totalTrackedFields,
    fieldStatuses,
    recoveries,
    highRecoveryRisk: recoveryPercentage > HIGH_RECOVERY_RISK_THRESHOLD,
  };
}

function readSnapshotFieldValue(snapshot: ParserInputSnapshot, field: string): string | null {
  switch (field) {
    case "invoice_number":
      return serializeRecoveryValue(snapshot.invoice_number);
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
    case "hs_codes":
      return snapshot.hs_code_count > 0 ? String(snapshot.hs_code_count) : null;
    default:
      return null;
  }
}

export function formatFieldRecoveryStatus(row: FieldRecoveryStatus): string {
  if (row.status === "parsed") return "Parsed";
  if (row.status === "recovered" && row.recovery_source) {
    return `Recovered (${row.recovery_source})`;
  }
  if (row.status === "recovered") return "Recovered";
  return "Missing";
}

export function applyRecoveryReadinessDowngrade<T extends { status: string; label: string; reasons: string[] }>(
  result: T,
  recoveryPercentage: number
): T {
  if (recoveryPercentage <= HIGH_RECOVERY_RISK_THRESHOLD) {
    return result;
  }

  const reason = `High parser recovery rate (${recoveryPercentage}% of tracked fields recovered via OCR fallback)`;

  if (result.status === "CUSTOMS_READY") {
    return {
      ...result,
      status: "CUSTOMS_REVIEW",
      label: "Customs Review",
      reasons: [...new Set([...result.reasons, reason])],
    };
  }

  if (result.status === "CUSTOMS_REVIEW") {
    return {
      ...result,
      reasons: [...new Set([...result.reasons, reason])],
    };
  }

  return result;
}
