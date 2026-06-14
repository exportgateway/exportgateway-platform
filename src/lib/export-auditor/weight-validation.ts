/**
 * Shipment weight plausibility checks for customs readiness.
 */

import type { ShipmentSummary as ReportShipmentSummary } from "@/lib/export-auditor/types";

export const NET_EXCEEDS_GROSS = "NET_EXCEEDS_GROSS";
export const UNIT_WEIGHT_MISUSE = "UNIT_WEIGHT_MISUSE";

export const NET_EXCEEDS_GROSS_MESSAGE = "Net weight exceeds gross weight";
export const UNIT_WEIGHT_MISUSE_MESSAGE =
  "Detected unit-level weights. Shipment net weight requires recalculation.";

const DOCUMENT_LEVEL_SOURCES = new Set(["DOCUMENT", "OCR_TEXT", "OCR_TABLE"]);

export interface WeightValidationFinding {
  code: typeof NET_EXCEEDS_GROSS | typeof UNIT_WEIGHT_MISUSE;
  message: string;
  severity: "review" | "warning";
}

export interface WeightValidationInput {
  netWeightTotal?: number | null;
  grossWeightTotal?: number | null;
  netWeightSource?: string | null;
  grossWeightSource?: string | null;
  calculatedLineNet?: number | null;
  unitWeightMisuseDetected?: boolean;
}

export function evaluateWeightValidation(
  shipment: WeightValidationInput
): WeightValidationFinding[] {
  const findings: WeightValidationFinding[] = [];
  const net = shipment.netWeightTotal;
  const gross = shipment.grossWeightTotal;

  if (
    net != null &&
    gross != null &&
    gross > 0 &&
    net > gross &&
    DOCUMENT_LEVEL_SOURCES.has(shipment.netWeightSource ?? "") &&
    DOCUMENT_LEVEL_SOURCES.has(shipment.grossWeightSource ?? "")
  ) {
    findings.push({
      code: NET_EXCEEDS_GROSS,
      message: NET_EXCEEDS_GROSS_MESSAGE,
      severity: "review",
    });
  }

  const calcNet = shipment.calculatedLineNet;
  const misuse =
    shipment.unitWeightMisuseDetected ||
    (calcNet != null && gross != null && gross > 0 && calcNet > gross * 1.1);

  if (misuse) {
    findings.push({
      code: UNIT_WEIGHT_MISUSE,
      message: UNIT_WEIGHT_MISUSE_MESSAGE,
      severity: "warning",
    });
  }

  return findings;
}

export function evaluateReportWeightValidation(
  shipmentSummary: ReportShipmentSummary,
  options?: Pick<WeightValidationInput, "calculatedLineNet" | "unitWeightMisuseDetected">
): WeightValidationFinding[] {
  return evaluateWeightValidation({
    netWeightTotal: shipmentSummary.netWeightTotal,
    grossWeightTotal: shipmentSummary.grossWeightTotal,
    netWeightSource: shipmentSummary.netWeightSource,
    grossWeightSource: shipmentSummary.grossWeightSource,
    calculatedLineNet: options?.calculatedLineNet,
    unitWeightMisuseDetected: options?.unitWeightMisuseDetected,
  });
}
