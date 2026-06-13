import type { ShipmentSummary } from "@/lib/export-auditor/api-types";
import {
  buildLabelAlternation,
  MULTILINGUAL_FIELD_LABELS,
} from "@/lib/export-auditor/multilingual-invoice-labels";

function parseTableWeight(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (/^\d+\.\d{1,3}$/.test(t)) return parseFloat(t);
  if (/^\d+,\d{1,3}$/.test(t)) return parseFloat(t.replace(",", "."));
  const normalized = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Multilingual tabular invoice footer headers (packages / net / gross weight). */
const PACKAGE_HEADER = new RegExp(
  `(?:${buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.packages)})`,
  "i"
);
const NET_HEADER = new RegExp(
  `(?:${buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.netWeight)})`,
  "i"
);
const GROSS_HEADER = new RegExp(
  `(?:${buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.grossWeight)})`,
  "i"
);

/** Numeric row: package_count net_weight gross_weight (whitespace-separated). */
const TABULAR_VALUES_ROW = /^\s*(\d+)\s+([\d.,]+)\s+([\d.,]+)\s*(?:kg)?\s*$/im;

/**
 * Extract shipment metrics from bilingual tabular invoice footers
 * (e.g. EL-CAR: headers then row `1 770 850`).
 */
export function extractTabularShipmentMetrics(corpus: string): Pick<
  ShipmentSummary,
  | "package_count"
  | "gross_weight_total"
  | "gross_weight_unit"
  | "net_weight_total"
  | "net_weight_unit"
> {
  const empty = {
    package_count: null,
    gross_weight_total: null,
    gross_weight_unit: null,
    net_weight_total: null,
    net_weight_unit: null,
  };

  const packageIdx = corpus.search(PACKAGE_HEADER);
  if (packageIdx < 0) return empty;

  const block = corpus.slice(packageIdx, packageIdx + 700);
  if (!NET_HEADER.test(block) || !GROSS_HEADER.test(block)) return empty;

  const rowMatch = block.match(TABULAR_VALUES_ROW);
  if (!rowMatch) return empty;

  const packageCount = parseInt(rowMatch[1], 10);
  const netWeight = parseTableWeight(rowMatch[2]);
  const grossWeight = parseTableWeight(rowMatch[3]);

  if (!Number.isFinite(packageCount) || netWeight == null || grossWeight == null) {
    return empty;
  }

  return {
    package_count: packageCount,
    net_weight_total: netWeight,
    net_weight_unit: "kg",
    gross_weight_total: grossWeight,
    gross_weight_unit: "kg",
  };
}
