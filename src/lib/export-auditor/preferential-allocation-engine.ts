/**
 * Preferential Allocation Engine — quantity, value, and weight splits for MRN preparation.
 */
import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  parseAllocationQuantity,
  resolveLineAllocationValue,
} from "@/lib/export-auditor/allocation-source-validation";
import {
  INVOICE_VALUE_DIVERGENCE_RATIO,
  parseLocaleNumber,
  resolveInvoiceValue,
  roundMoney,
} from "@/lib/export-auditor/parse-locale-number";
import type { LinePreferentialOrigin } from "@/lib/export-auditor/preferential-origin-engine";
import {
  hasNonPreferentialLines,
  hasPreferentialLines,
  isAllNotDeclaredLines,
} from "@/lib/export-auditor/mixed-origin-status-engine";

export interface PreferentialAllocation {
  isMixed: boolean;
  preferentialQuantity: number;
  preferentialValue: number;
  preferentialWeight: number | null;
  nonPreferentialQuantity: number;
  nonPreferentialValue: number;
  nonPreferentialWeight: number | null;
}

function parseLineWeight(item: ApiInvoiceItem): number | null {
  const weight = parseLocaleNumber(item.net_weight);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function resolveItem(
  items: ApiInvoiceItem[],
  positionNumber: number
): ApiInvoiceItem | undefined {
  return (
    items.find((item) => item.position_number === positionNumber) ??
    items[positionNumber - 1]
  );
}

function allocateProportionalWeight(
  shipmentNetWeight: number | null | undefined,
  partValue: number,
  totalValue: number
): number | null {
  if (shipmentNetWeight == null || shipmentNetWeight <= 0 || totalValue <= 0 || partValue <= 0) {
    return null;
  }
  return Math.round(((partValue / totalValue) * shipmentNetWeight) * 1000) / 1000;
}

function needsReconciliation(canonical: number, classified: number): boolean {
  if (canonical <= 0 || classified <= 0) return false;
  const larger = Math.max(canonical, classified);
  const smaller = Math.min(canonical, classified);
  return larger / smaller > INVOICE_VALUE_DIVERGENCE_RATIO;
}

/** Scale classified preferential / non-preferential values to canonical invoice total. */
function reconcileValuesToInvoiceTotal(
  preferentialValue: number,
  nonPreferentialValue: number,
  canonicalInvoiceTotal: number
): { preferentialValue: number; nonPreferentialValue: number } {
  const classifiedSum = preferentialValue + nonPreferentialValue;
  if (!needsReconciliation(canonicalInvoiceTotal, classifiedSum)) {
    return {
      preferentialValue: roundMoney(preferentialValue),
      nonPreferentialValue: roundMoney(nonPreferentialValue),
    };
  }

  const scale = canonicalInvoiceTotal / classifiedSum;
  return {
    preferentialValue: roundMoney(preferentialValue * scale),
    nonPreferentialValue: roundMoney(nonPreferentialValue * scale),
  };
}

function reconcileWeightsToShipmentNet(
  preferentialWeight: number | null,
  nonPreferentialWeight: number | null,
  shipmentNet: number | null
): { preferentialWeight: number | null; nonPreferentialWeight: number | null } {
  if (shipmentNet == null || shipmentNet <= 0) {
    return { preferentialWeight, nonPreferentialWeight };
  }

  const pref = preferentialWeight ?? 0;
  const nonPref = nonPreferentialWeight ?? 0;
  const classifiedSum = pref + nonPref;
  if (classifiedSum <= 0) {
    return { preferentialWeight, nonPreferentialWeight };
  }

  if (!needsReconciliation(shipmentNet, classifiedSum)) {
    return {
      preferentialWeight:
        preferentialWeight != null ? Math.round(preferentialWeight * 1000) / 1000 : null,
      nonPreferentialWeight:
        nonPreferentialWeight != null ? Math.round(nonPreferentialWeight * 1000) / 1000 : null,
    };
  }

  const scale = shipmentNet / classifiedSum;
  return {
    preferentialWeight:
      preferentialWeight != null
        ? Math.round(preferentialWeight * scale * 1000) / 1000
        : null,
    nonPreferentialWeight:
      nonPreferentialWeight != null
        ? Math.round(nonPreferentialWeight * scale * 1000) / 1000
        : null,
  };
}

/** Aggregate preferential / non-preferential quantity, value, and weight from line markers. */
export function computePreferentialAllocation(
  invoice: NormalizedInvoice,
  lines: LinePreferentialOrigin[]
): PreferentialAllocation | null {
  if (lines.length === 0) {
    return null;
  }

  if (isAllNotDeclaredLines(lines)) {
    const items = invoice.items ?? [];
    let totalQuantity = 0;
    let totalValue = 0;
    let totalWeight = 0;
    let weightKnown = false;

    for (const line of lines) {
      const item = resolveItem(items, line.position_number);
      if (!item) continue;
      totalQuantity += parseAllocationQuantity(item.quantity);
      totalValue += resolveLineAllocationValue(item).value;
      const lineWeight = parseLineWeight(item);
      if (lineWeight != null) {
        totalWeight += lineWeight;
        weightKnown = true;
      }
    }

    const canonicalInvoiceTotal = resolveInvoiceValue(invoice);
    const reconciledValue =
      canonicalInvoiceTotal > 0 ? roundMoney(canonicalInvoiceTotal) : roundMoney(totalValue);
    const shipmentNet = invoice.shipment_summary?.net_weight_total ?? null;
    const weight = weightKnown
      ? Math.round(totalWeight * 1000) / 1000
      : shipmentNet != null && shipmentNet > 0
        ? shipmentNet
        : null;

    return {
      isMixed: false,
      preferentialQuantity: 0,
      preferentialValue: 0,
      preferentialWeight: null,
      nonPreferentialQuantity: totalQuantity,
      nonPreferentialValue: reconciledValue,
      nonPreferentialWeight: weight,
    };
  }

  if (!hasPreferentialLines(lines) && !hasNonPreferentialLines(lines)) {
    return null;
  }

  const items = invoice.items ?? [];
  let preferentialQuantity = 0;
  let preferentialValue = 0;
  let preferentialWeight = 0;
  let preferentialWeightKnown = false;
  let nonPreferentialQuantity = 0;
  let nonPreferentialValue = 0;
  let nonPreferentialWeight = 0;
  let nonPreferentialWeightKnown = false;

  for (const line of lines) {
    const item = resolveItem(items, line.position_number);
    if (!item) continue;

    const quantity = parseAllocationQuantity(item.quantity);
    const value = resolveLineAllocationValue(item).value;
    const lineWeight = parseLineWeight(item);

    if (line.preferential_origin === "YES") {
      preferentialQuantity += quantity;
      preferentialValue += value;
      if (lineWeight != null) {
        preferentialWeight += lineWeight;
        preferentialWeightKnown = true;
      }
    } else if (line.preferential_origin === "NO") {
      nonPreferentialQuantity += quantity;
      nonPreferentialValue += value;
      if (lineWeight != null) {
        nonPreferentialWeight += lineWeight;
        nonPreferentialWeightKnown = true;
      }
    }
  }

  const canonicalInvoiceTotal = resolveInvoiceValue(invoice);
  const reconciledValues = reconcileValuesToInvoiceTotal(
    preferentialValue,
    nonPreferentialValue,
    canonicalInvoiceTotal
  );

  const classifiedValueTotal = reconciledValues.preferentialValue + reconciledValues.nonPreferentialValue;
  const shipmentNet = invoice.shipment_summary?.net_weight_total ?? null;

  let prefWeight = preferentialWeightKnown
    ? Math.round(preferentialWeight * 1000) / 1000
    : allocateProportionalWeight(
        shipmentNet,
        reconciledValues.preferentialValue,
        classifiedValueTotal
      );

  let nonPrefWeight = nonPreferentialWeightKnown
    ? Math.round(nonPreferentialWeight * 1000) / 1000
    : allocateProportionalWeight(
        shipmentNet,
        reconciledValues.nonPreferentialValue,
        classifiedValueTotal
      );

  if (preferentialWeightKnown || nonPreferentialWeightKnown) {
    const reconciledWeights = reconcileWeightsToShipmentNet(prefWeight, nonPrefWeight, shipmentNet);
    prefWeight = reconciledWeights.preferentialWeight;
    nonPrefWeight = reconciledWeights.nonPreferentialWeight;
  }

  return {
    isMixed: hasPreferentialLines(lines) && hasNonPreferentialLines(lines),
    preferentialQuantity,
    preferentialValue: reconciledValues.preferentialValue,
    preferentialWeight: prefWeight,
    nonPreferentialQuantity,
    nonPreferentialValue: reconciledValues.nonPreferentialValue,
    nonPreferentialWeight: nonPrefWeight,
  };
}

export function computeMixedOriginTotals(
  invoice: NormalizedInvoice,
  lines: LinePreferentialOrigin[]
): PreferentialAllocation | null {
  const allocation = computePreferentialAllocation(invoice, lines);
  return allocation?.isMixed ? allocation : null;
}
