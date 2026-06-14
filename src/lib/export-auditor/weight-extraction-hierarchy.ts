/**
 * Weight extraction hierarchy — document shipment weights beat calculated line sums.
 * Priority:
 * 1) Document-level shipment net weight (authoritative)
 * 2) Document-level gross only — net remains UNKNOWN
 * 3) Aggregated line net totals (fallback only)
 * Never treat unit net weight as shipment net weight.
 */

import type { ShipmentSummary } from "@/lib/export-auditor/api-types";

export type WeightExtractionSource = "DOCUMENT" | "CALCULATED" | "OCR_TABLE" | "OCR_TEXT";
export type WeightType = "UNIT" | "LINE" | "SHIPMENT";

export interface ResolvedWeightHierarchy {
  netWeightTotal: number | null;
  netWeightUnit: string | null;
  grossWeightTotal: number | null;
  grossWeightUnit: string | null;
  netWeightSource: WeightExtractionSource | null;
  grossWeightSource: WeightExtractionSource | null;
  netWeightType: WeightType | null;
  grossWeightType: WeightType | null;
  calculatedLineNet: number | null;
  unitWeightMisuseDetected: boolean;
}

export interface WeightHierarchyInput {
  existing?: ShipmentSummary;
  documentNet: Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit">;
  documentGross: Pick<ShipmentSummary, "gross_weight_total" | "gross_weight_unit">;
  calculatedNet: Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit">;
  unitWeightMisuseLikely?: boolean;
}

function isPositiveWeight(value: number | null | undefined): value is number {
  return value != null && value > 0;
}

function isDocumentNetSource(source: WeightExtractionSource | null | undefined): boolean {
  return source === "DOCUMENT" || source === "OCR_TEXT" || source === "OCR_TABLE";
}

/** Resolve net/gross weights without letting calculated totals override document-level values. */
export function resolveWeightHierarchy(input: WeightHierarchyInput): ResolvedWeightHierarchy {
  const { existing, documentNet, documentGross, calculatedNet, unitWeightMisuseLikely } = input;

  let grossWeightTotal: number | null = null;
  let grossWeightUnit: string | null = null;
  let grossWeightSource: WeightExtractionSource | null = null;
  let grossWeightType: WeightType | null = null;

  if (isPositiveWeight(existing?.gross_weight_total)) {
    grossWeightTotal = existing.gross_weight_total;
    grossWeightUnit = existing.gross_weight_unit ?? "kg";
    grossWeightSource = existing.gross_weight_source ?? "DOCUMENT";
    grossWeightType = existing.gross_weight_type ?? "SHIPMENT";
  } else if (isPositiveWeight(documentGross.gross_weight_total)) {
    grossWeightTotal = documentGross.gross_weight_total;
    grossWeightUnit = documentGross.gross_weight_unit ?? "kg";
    grossWeightSource = "OCR_TEXT";
    grossWeightType = "SHIPMENT";
  }

  let netWeightTotal: number | null = null;
  let netWeightUnit: string | null = null;
  let netWeightSource: WeightExtractionSource | null = null;
  let netWeightType: WeightType | null = null;

  const hasDocumentNet =
    (isPositiveWeight(existing?.net_weight_total) &&
      existing?.net_weight_source != null &&
      isDocumentNetSource(existing.net_weight_source)) ||
    isPositiveWeight(documentNet.net_weight_total);

  const hasDocumentGross = isPositiveWeight(grossWeightTotal);
  const calculatedLineNet = calculatedNet.net_weight_total ?? null;

  let unitWeightMisuseDetected = Boolean(unitWeightMisuseLikely);

  const existingNetExceedsGross =
    isPositiveWeight(existing?.net_weight_total) &&
    isPositiveWeight(grossWeightTotal) &&
    existing!.net_weight_total! > grossWeightTotal!;

  const existingIsExplicitCalculated = existing?.net_weight_source === "CALCULATED";
  const existingIsExplicitDocument =
    existing?.net_weight_source != null && isDocumentNetSource(existing.net_weight_source);
  const existingIsStructuredDocument =
    isPositiveWeight(existing?.net_weight_total) &&
    !existingIsExplicitCalculated &&
    (!existingNetExceedsGross || !hasDocumentGross);

  if (existingIsExplicitDocument || (existingIsStructuredDocument && existing?.net_weight_source == null)) {
    netWeightTotal = existing!.net_weight_total!;
    netWeightUnit = existing!.net_weight_unit ?? "kg";
    netWeightSource = existing!.net_weight_source ?? "DOCUMENT";
    netWeightType = existing!.net_weight_type ?? "SHIPMENT";
  } else if (isPositiveWeight(documentNet.net_weight_total)) {
    netWeightTotal = documentNet.net_weight_total;
    netWeightUnit = documentNet.net_weight_unit ?? "kg";
    netWeightSource = "OCR_TEXT";
    netWeightType = "SHIPMENT";
  } else if (hasDocumentGross) {
    netWeightTotal = null;
    netWeightUnit = null;
    netWeightSource = null;
    netWeightType = null;
    if (
      isPositiveWeight(calculatedLineNet) &&
      grossWeightTotal != null &&
      calculatedLineNet > grossWeightTotal * 1.1
    ) {
      unitWeightMisuseDetected = true;
    }
  } else if (isPositiveWeight(calculatedLineNet)) {
    netWeightTotal = calculatedLineNet;
    netWeightUnit = calculatedNet.net_weight_unit ?? "kg";
    netWeightSource = "CALCULATED";
    netWeightType = "LINE";
  }

  if (
    hasDocumentNet &&
    hasDocumentGross &&
    netWeightTotal != null &&
    grossWeightTotal != null &&
    netWeightTotal > grossWeightTotal
  ) {
    unitWeightMisuseDetected = true;
  }

  return {
    netWeightTotal,
    netWeightUnit,
    grossWeightTotal,
    grossWeightUnit,
    netWeightSource,
    grossWeightSource,
    netWeightType,
    grossWeightType,
    calculatedLineNet,
    unitWeightMisuseDetected,
  };
}

/** Apply hierarchy onto a shipment summary — document weights beat calculated line sums. */
export function applyWeightHierarchyToShipmentSummary(
  summary: ShipmentSummary,
  input: Omit<WeightHierarchyInput, "existing">
): ShipmentSummary {
  const resolved = resolveWeightHierarchy({ existing: summary, ...input });

  const staleCalculatedNet =
    summary.net_weight_source === "CALCULATED" ||
    (summary.net_weight_source == null &&
      isPositiveWeight(summary.net_weight_total) &&
      (isPositiveWeight(resolved.grossWeightTotal) || isPositiveWeight(input.documentGross.gross_weight_total)));

  const staleNetExceedsGross =
    isPositiveWeight(summary.net_weight_total) &&
    isPositiveWeight(resolved.grossWeightTotal) &&
    summary.net_weight_total! > resolved.grossWeightTotal!;

  const shouldApplyResolved =
    staleCalculatedNet ||
    staleNetExceedsGross ||
    summary.net_weight_source === "CALCULATED" ||
    (isPositiveWeight(resolved.grossWeightTotal) &&
      (resolved.netWeightSource !== "CALCULATED" || resolved.netWeightTotal == null));

  let netWeightTotal = summary.net_weight_total ?? resolved.netWeightTotal;
  let netWeightUnit = summary.net_weight_unit ?? resolved.netWeightUnit;
  let netWeightSource = summary.net_weight_source ?? resolved.netWeightSource;
  let netWeightType = summary.net_weight_type ?? resolved.netWeightType;

  if (shouldApplyResolved) {
    netWeightTotal = resolved.netWeightTotal;
    netWeightUnit = resolved.netWeightUnit;
    netWeightSource = resolved.netWeightSource;
    netWeightType = resolved.netWeightType;
  }

  return {
    ...summary,
    net_weight_total: netWeightTotal,
    net_weight_unit: netWeightUnit,
    gross_weight_total: summary.gross_weight_total ?? resolved.grossWeightTotal,
    gross_weight_unit: summary.gross_weight_unit ?? resolved.grossWeightUnit,
    net_weight_source: netWeightSource,
    gross_weight_source: summary.gross_weight_source ?? resolved.grossWeightSource,
    net_weight_type: netWeightType,
    gross_weight_type: summary.gross_weight_type ?? resolved.grossWeightType,
  };
}
