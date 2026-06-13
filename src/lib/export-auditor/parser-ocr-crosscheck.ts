import type { NormalizedInvoice, ShipmentSummary } from "@/lib/export-auditor/api-types";
import { extractHsCodes } from "@/lib/export-auditor/invoice-fields";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";
import {
  collectShipmentCorpus,
  extractFooterShipmentMetrics,
} from "@/lib/export-auditor/shipment-summary-extractor";
import { extractTabularHsCodes, enrichItemHsCodesFromOcr } from "@/lib/export-auditor/tabular-hs-extractor";
import { extractTabularShipmentMetrics } from "@/lib/export-auditor/tabular-shipment-extractor";

export const PARSER_MAPPING_FAILURE = "PARSER_MAPPING_FAILURE";

export interface ParserOcrCrosscheckResult {
  invoice: NormalizedInvoice;
  signals: string[];
}

function mergeOcrShipmentSignals(corpus: string): Pick<
  ShipmentSummary,
  | "package_count"
  | "gross_weight_total"
  | "gross_weight_unit"
  | "net_weight_total"
  | "net_weight_unit"
> {
  const tabular = extractTabularShipmentMetrics(corpus);
  const footer = extractFooterShipmentMetrics(corpus);

  return {
    package_count: footer.package_count ?? tabular.package_count,
    gross_weight_total: footer.gross_weight_total ?? tabular.gross_weight_total,
    gross_weight_unit: footer.gross_weight_unit ?? tabular.gross_weight_unit,
    net_weight_total: footer.net_weight_total ?? tabular.net_weight_total,
    net_weight_unit: footer.net_weight_unit ?? tabular.net_weight_unit,
  };
}

/**
 * Compare OCR-extracted shipment/HS values with structured parser output.
 * When OCR has a value but structured fields are null, apply OCR fallback
 * and emit PARSER_MAPPING_FAILURE (internal signal, not a blocking warning).
 */
export function applyParserOcrCrosscheck(invoice: NormalizedInvoice): ParserOcrCrosscheckResult {
  const corpus = collectShipmentCorpus(invoice);
  const ocrShipment = mergeOcrShipmentSignals(corpus);
  const signals: string[] = [];
  let updated: NormalizedInvoice = { ...invoice };

  const summary = { ...(updated.shipment_summary ?? {}) };
  let shipmentChanged = false;

  if (summary.package_count == null && ocrShipment.package_count != null) {
    summary.package_count = ocrShipment.package_count;
    shipmentChanged = true;
    signals.push(PARSER_MAPPING_FAILURE);
    updated = appendProvenance(updated, {
      field: "package_count",
      value: String(ocrShipment.package_count),
      source: "ocr_fallback",
    });
  }
  if (summary.net_weight_total == null && ocrShipment.net_weight_total != null) {
    summary.net_weight_total = ocrShipment.net_weight_total;
    summary.net_weight_unit = ocrShipment.net_weight_unit ?? "kg";
    shipmentChanged = true;
    signals.push(PARSER_MAPPING_FAILURE);
    updated = appendProvenance(updated, {
      field: "net_weight_total",
      value: String(ocrShipment.net_weight_total),
      source: "ocr_fallback",
    });
  }
  if (summary.gross_weight_total == null && ocrShipment.gross_weight_total != null) {
    summary.gross_weight_total = ocrShipment.gross_weight_total;
    summary.gross_weight_unit = ocrShipment.gross_weight_unit ?? "kg";
    shipmentChanged = true;
    signals.push(PARSER_MAPPING_FAILURE);
    updated = appendProvenance(updated, {
      field: "gross_weight_total",
      value: String(ocrShipment.gross_weight_total),
      source: "ocr_fallback",
    });
  }

  if (shipmentChanged) {
    updated = {
      ...updated,
      shipment_summary: {
        package_count: null,
        package_type: null,
        gross_weight_total: null,
        gross_weight_unit: null,
        net_weight_total: null,
        net_weight_unit: null,
        pallet_dimensions: null,
        pallet_count: null,
        ...summary,
      },
    };
  }

  const structuredHsCount = extractHsCodes(updated).length;
  const ocrHsCodes = extractTabularHsCodes(corpus);
  if (structuredHsCount === 0 && ocrHsCodes.length > 0) {
    updated = enrichItemHsCodesFromOcr(updated);
    signals.push(PARSER_MAPPING_FAILURE);
  }

  return {
    invoice: updated,
    signals: [...new Set(signals)],
  };
}
