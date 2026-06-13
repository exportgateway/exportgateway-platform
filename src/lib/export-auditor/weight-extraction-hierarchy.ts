/**
 * Weight extraction hierarchy — document-level weights always beat calculated line sums.
 * Priority: 1) Document-level Net Weight 2) Document-level Gross Weight 3) Aggregated line-item weights (fallback only).
 */

import type { ShipmentSummary } from "@/lib/export-auditor/api-types";

export type WeightExtractionSource = "DOCUMENT" | "CALCULATED" | "OCR_TABLE" | "OCR_TEXT";

export interface ResolvedWeightHierarchy {
  netWeightTotal: number | null;
  netWeightUnit: string | null;
  grossWeightTotal: number | null;
  grossWeightUnit: string | null;
  netWeightSource: WeightExtractionSource | null;
  grossWeightSource: WeightExtractionSource | null;
}

export interface WeightHierarchyInput {
  existing?: ShipmentSummary;
  documentNet: Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit">;
  documentGross: Pick<ShipmentSummary, "gross_weight_total" | "gross_weight_unit">;
  calculatedNet: Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit">;
}

function isPositiveWeight(value: number | null | undefined): value is number {
  return value != null && value > 0;
}

/** Resolve net/gross weights without letting calculated totals override document-level values. */
export function resolveWeightHierarchy(input: WeightHierarchyInput): ResolvedWeightHierarchy {
  const { existing, documentNet, documentGross, calculatedNet } = input;

  let netWeightTotal: number | null = null;
  let netWeightUnit: string | null = null;
  let netWeightSource: WeightExtractionSource | null = null;

  if (isPositiveWeight(existing?.net_weight_total)) {
    netWeightTotal = existing.net_weight_total;
    netWeightUnit = existing.net_weight_unit ?? "kg";
    netWeightSource = "DOCUMENT";
  } else if (isPositiveWeight(documentNet.net_weight_total)) {
    netWeightTotal = documentNet.net_weight_total;
    netWeightUnit = documentNet.net_weight_unit ?? "kg";
    netWeightSource = existing?.net_weight_total != null ? "DOCUMENT" : "OCR_TEXT";
  } else if (isPositiveWeight(documentGross.gross_weight_total)) {
    netWeightTotal = documentGross.gross_weight_total;
    netWeightUnit = documentGross.gross_weight_unit ?? "kg";
    netWeightSource = "DOCUMENT";
  } else if (isPositiveWeight(calculatedNet.net_weight_total)) {
    netWeightTotal = calculatedNet.net_weight_total;
    netWeightUnit = calculatedNet.net_weight_unit ?? "kg";
    netWeightSource = "CALCULATED";
  }

  let grossWeightTotal: number | null = null;
  let grossWeightUnit: string | null = null;
  let grossWeightSource: WeightExtractionSource | null = null;

  if (isPositiveWeight(existing?.gross_weight_total)) {
    grossWeightTotal = existing.gross_weight_total;
    grossWeightUnit = existing.gross_weight_unit ?? "kg";
    grossWeightSource = "DOCUMENT";
  } else if (isPositiveWeight(documentGross.gross_weight_total)) {
    grossWeightTotal = documentGross.gross_weight_total;
    grossWeightUnit = documentGross.gross_weight_unit ?? "kg";
    grossWeightSource = "OCR_TEXT";
  }

  return {
    netWeightTotal,
    netWeightUnit,
    grossWeightTotal,
    grossWeightUnit,
    netWeightSource,
    grossWeightSource,
  };
}

/** Apply hierarchy onto a shipment summary — never overwrites populated document fields. */
export function applyWeightHierarchyToShipmentSummary(
  summary: ShipmentSummary,
  input: Omit<WeightHierarchyInput, "existing">
): ShipmentSummary {
  const resolved = resolveWeightHierarchy({ existing: summary, ...input });

  return {
    ...summary,
    net_weight_total: summary.net_weight_total ?? resolved.netWeightTotal,
    net_weight_unit: summary.net_weight_unit ?? resolved.netWeightUnit,
    gross_weight_total: summary.gross_weight_total ?? resolved.grossWeightTotal,
    gross_weight_unit: summary.gross_weight_unit ?? resolved.grossWeightUnit,
    net_weight_source: summary.net_weight_source ?? resolved.netWeightSource,
    gross_weight_source: summary.gross_weight_source ?? resolved.grossWeightSource,
  };
}
