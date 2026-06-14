/**
 * Line-level net weight aggregation for shipment totals.
 * Never treats raw unit weights as shipment net — sums line totals (qty × unit when needed).
 */

import type { ApiInvoiceItem } from "@/lib/export-auditor/api-types";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";
import { parseQuantity } from "@/lib/export-auditor/parse-quantity";

function parseWeightNumber(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (/^\d+\.\d{1,3}$/.test(t)) return parseFloat(t);
  if (/^\d+,\d{1,3}$/.test(t)) return parseFloat(t.replace(",", "."));
  const normalized = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveQuantity(item: ApiInvoiceItem): number {
  const qty = parseQuantity(item.quantity ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export interface LineNetAggregation {
  net_weight_total: number | null;
  net_weight_unit: string | null;
  /** Sum treating each net_weight as a line total (no qty multiply). */
  rawLineSum: number | null;
  /** Sum treating each net_weight as unit weight × quantity. */
  unitAdjustedSum: number | null;
  unitWeightMisuseLikely: boolean;
}

/**
 * Aggregate line net weights into a shipment-level total.
 * When document gross is known and raw sum exceeds gross by >10%, flags unit-weight misuse.
 */
export function aggregateLineNetWeightsForShipment(
  items: ApiInvoiceItem[] | undefined,
  documentGross?: number | null
): LineNetAggregation {
  if (!items?.length) {
    return {
      net_weight_total: null,
      net_weight_unit: null,
      rawLineSum: null,
      unitAdjustedSum: null,
      unitWeightMisuseLikely: false,
    };
  }

  let rawLineSum = 0;
  let unitAdjustedSum = 0;
  let weightedLines = 0;
  let hasMultiQty = false;

  for (const item of items) {
    if (item.net_weight == null) continue;
    const weight = parseWeightNumber(String(item.net_weight));
    if (weight == null) continue;
    const qty = resolveQuantity(item);
    if (qty > 1) hasMultiQty = true;
    rawLineSum += weight;
    unitAdjustedSum += weight * qty;
    weightedLines += 1;
  }

  if (weightedLines === 0) {
    return {
      net_weight_total: null,
      net_weight_unit: null,
      rawLineSum: null,
      unitAdjustedSum: null,
      unitWeightMisuseLikely: false,
    };
  }

  let total = rawLineSum;
  let unitWeightMisuseLikely = false;

  if (documentGross != null && documentGross > 0) {
    if (rawLineSum > documentGross * 1.1 || unitAdjustedSum > documentGross * 1.1) {
      unitWeightMisuseLikely = true;
    }
  } else if (hasMultiQty && unitAdjustedSum > rawLineSum * 1.2) {
    total = unitAdjustedSum;
  }

  return {
    net_weight_total: total,
    net_weight_unit: "kg",
    rawLineSum,
    unitAdjustedSum,
    unitWeightMisuseLikely,
  };
}
