import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";

export type ExtractionSource =
  | "table_parser"
  | "invoice_parser"
  | "ocr_primary"
  | "ocr_fallback"
  | "heuristic_recovery"
  | "regex_rescue"
  | "consignee_parser"
  | "preferential_origin_engine";

export interface ExtractionProvenanceEntry {
  field: string;
  value: string;
  source: ExtractionSource;
}

export const FALLBACK_SOURCES: ReadonlySet<ExtractionSource> = new Set([
  "ocr_fallback",
  "heuristic_recovery",
  "regex_rescue",
]);

export function appendProvenance(
  invoice: NormalizedInvoice,
  entry: ExtractionProvenanceEntry
): NormalizedInvoice {
  const existing = invoice.extraction_provenance ?? [];
  const duplicate = existing.some(
    (row) => row.field === entry.field && row.source === entry.source && row.value === entry.value
  );
  if (duplicate) return invoice;
  return {
    ...invoice,
    extraction_provenance: [...existing, entry],
  };
}

export function appendProvenanceMany(
  invoice: NormalizedInvoice,
  entries: ExtractionProvenanceEntry[]
): NormalizedInvoice {
  let updated = invoice;
  for (const entry of entries) {
    updated = appendProvenance(updated, entry);
  }
  return updated;
}

export function provenanceBreakdown(
  entries: ExtractionProvenanceEntry[]
): Record<string, string> {
  const breakdown: Record<string, string> = {};
  for (const entry of entries) {
    breakdown[entry.field] = entry.source;
  }
  return breakdown;
}

export function hasFallbackSource(entries: ExtractionProvenanceEntry[]): boolean {
  return entries.some((entry) => FALLBACK_SOURCES.has(entry.source));
}
