import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { evaluatePackageCountDecision } from "@/lib/export-auditor/package-count-decision-engine";
import {
  buildShipmentExtractionDiagnostics,
  NO_OCR_SHIPMENT_DATA,
  NO_OCR_SHIPMENT_DATA_MESSAGE,
} from "@/lib/export-auditor/shipment-extraction-diagnostics";
import { hasInvoiceGrossWeight } from "@/lib/export-auditor/shipment-summary-extractor";
import {
  evaluateWeightValidation,
  NET_EXCEEDS_GROSS,
  UNIT_WEIGHT_MISUSE,
  UNIT_WEIGHT_MISUSE_MESSAGE,
  NET_EXCEEDS_GROSS_MESSAGE,
} from "@/lib/export-auditor/weight-validation";
import { aggregateLineNetWeightsForShipment } from "@/lib/export-auditor/weight-line-aggregation";

export { NO_OCR_SHIPMENT_DATA, NO_OCR_SHIPMENT_DATA_MESSAGE };
export { NET_EXCEEDS_GROSS, UNIT_WEIGHT_MISUSE, UNIT_WEIGHT_MISUSE_MESSAGE, NET_EXCEEDS_GROSS_MESSAGE };

export const MISSING_PACKAGE_COUNT = "MISSING_PACKAGE_COUNT";
export const MISSING_GROSS_WEIGHT = "MISSING_GROSS_WEIGHT";
export const MISSING_NET_WEIGHT = "MISSING_NET_WEIGHT";

export const MISSING_NET_WEIGHT_MESSAGE =
  "Net weight not found on invoice. Recommended for customs preparation.";

export interface ShipmentReadinessFinding {
  code:
    | typeof MISSING_PACKAGE_COUNT
    | typeof MISSING_GROSS_WEIGHT
    | typeof MISSING_NET_WEIGHT
    | typeof NO_OCR_SHIPMENT_DATA
    | typeof NET_EXCEEDS_GROSS
    | typeof UNIT_WEIGHT_MISUSE;
  message: string;
  severity: "warning" | "info";
}

/** Shipment packaging readiness checks — customs-relevant shipment-level fields. */
export function evaluateShipmentReadiness(invoice: NormalizedInvoice): ShipmentReadinessFinding[] {
  const diagnostics = buildShipmentExtractionDiagnostics(invoice);
  if (diagnostics.noOcrShipmentData) {
    return [
      {
        code: NO_OCR_SHIPMENT_DATA,
        severity: "info",
        message: NO_OCR_SHIPMENT_DATA_MESSAGE,
      },
    ];
  }

  const summary = invoice.shipment_summary;
  const findings: ShipmentReadinessFinding[] = [];

  const packageDecision = evaluatePackageCountDecision({
    colliCount: summary?.package_count ?? null,
    palletCount: summary?.pallet_count ?? null,
  });
  if (packageDecision.declarationPackageCount == null) {
    findings.push({
      code: MISSING_PACKAGE_COUNT,
      severity: "warning",
      message:
        "Package count is missing. Package quantity is commonly required for export declarations.",
    });
  }

  if (!hasInvoiceGrossWeight(invoice)) {
    findings.push({
      code: MISSING_GROSS_WEIGHT,
      severity: "warning",
      message:
        "Gross shipment weight is missing. Gross weight is commonly required for customs declarations.",
    });
  }

  if (summary?.net_weight_total == null) {
    findings.push({
      code: MISSING_NET_WEIGHT,
      severity: "info",
      message: MISSING_NET_WEIGHT_MESSAGE,
    });
  }

  const lineAggregation = aggregateLineNetWeightsForShipment(
    invoice.items,
    summary?.gross_weight_total ?? null
  );
  for (const finding of evaluateWeightValidation({
    netWeightTotal: summary?.net_weight_total ?? null,
    grossWeightTotal: summary?.gross_weight_total ?? null,
    netWeightSource: summary?.net_weight_source ?? null,
    grossWeightSource: summary?.gross_weight_source ?? null,
    calculatedLineNet: lineAggregation.rawLineSum ?? lineAggregation.unitAdjustedSum,
    unitWeightMisuseDetected: lineAggregation.unitWeightMisuseLikely,
  })) {
    findings.push({
      code: finding.code,
      severity: finding.severity === "review" ? "warning" : "warning",
      message: finding.message,
    });
  }

  return findings;
}
