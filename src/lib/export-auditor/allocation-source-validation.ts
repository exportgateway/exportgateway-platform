/**
 * Allocation source validation — audit raw OCR line values before reconciliation scaling.
 */
import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  INVOICE_VALUE_DIVERGENCE_RATIO,
  parseLocaleNumber,
  resolveInvoiceValue,
  roundMoney,
} from "@/lib/export-auditor/parse-locale-number";
import type { LinePreferentialOrigin } from "@/lib/export-auditor/preferential-origin-engine";

export type AllocationValueSource = "line_total" | "unit_price×quantity" | "none";

export type AllocationLineFlag =
  | "LINE_TOTAL_EXCEEDS_INVOICE"
  | "LINE_TOTAL_EXCEEDS_HALF_INVOICE"
  | "UNIT_QTY_MISMATCH";

export interface AllocationLineAudit {
  position: number;
  quantity: number;
  quantityRaw: string | number | null | undefined;
  unitPrice: number;
  unitPriceRaw: string | number | null | undefined;
  lineTotal: number;
  lineTotalRaw: string | number | null | undefined;
  computedUnitTimesQty: number;
  preferentialFlag: LinePreferentialOrigin["preferential_origin"] | "—";
  valueSource: AllocationValueSource;
  /** Raw value included in classified allocation sum (before scaling). */
  allocatedValue: number;
  flags: AllocationLineFlag[];
}

export interface AllocationSourceValidation {
  lines: AllocationLineAudit[];
  rawLineSum: number;
  rawPreferentialSum: number;
  rawNonPreferentialSum: number;
  canonicalInvoiceTotal: number;
  /** 1 when no reconciliation scaling is required. */
  scalingFactor: number;
  scalingApplied: boolean;
  topHighestValueLines: AllocationLineAudit[];
  flaggedLines: AllocationLineAudit[];
  /** True when any line-level corruption flag is raised. */
  corruptionDetected: boolean;
}

const UNIT_QTY_ABS_TOLERANCE = 0.05;
const UNIT_QTY_REL_TOLERANCE = 0.05;

export function parseAllocationQuantity(value: number | string | null | undefined): number {
  const parsed = parseLocaleNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function resolveLineAllocationValue(item: ApiInvoiceItem): {
  value: number;
  source: AllocationValueSource;
  parsedLineTotal: number;
  parsedUnitPrice: number;
  quantity: number;
  computedUnitTimesQty: number;
} {
  const quantity = parseAllocationQuantity(item.quantity);
  const parsedLineTotal = parseLocaleNumber(item.line_total);
  const parsedUnitPrice = parseLocaleNumber(item.unit_price);
  const computedUnitTimesQty =
    parsedUnitPrice > 0 ? roundMoney(parsedUnitPrice * quantity) : 0;

  if (parsedLineTotal > 0) {
    return {
      value: parsedLineTotal,
      source: "line_total",
      parsedLineTotal,
      parsedUnitPrice,
      quantity,
      computedUnitTimesQty,
    };
  }

  if (computedUnitTimesQty > 0) {
    return {
      value: computedUnitTimesQty,
      source: "unit_price×quantity",
      parsedLineTotal,
      parsedUnitPrice,
      quantity,
      computedUnitTimesQty,
    };
  }

  return {
    value: 0,
    source: "none",
    parsedLineTotal,
    parsedUnitPrice,
    quantity,
    computedUnitTimesQty,
  };
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

function unitQtyMismatch(
  parsedLineTotal: number,
  computedUnitTimesQty: number
): boolean {
  if (parsedLineTotal <= 0 || computedUnitTimesQty <= 0) {
    return false;
  }
  const diff = Math.abs(parsedLineTotal - computedUnitTimesQty);
  const tolerance = Math.max(
    UNIT_QTY_ABS_TOLERANCE,
    parsedLineTotal * UNIT_QTY_REL_TOLERANCE
  );
  return diff > tolerance;
}

function auditLineFlags(
  parsedLineTotal: number,
  computedUnitTimesQty: number,
  parsedUnitPrice: number,
  quantity: number,
  canonicalInvoiceTotal: number
): AllocationLineFlag[] {
  const flags: AllocationLineFlag[] = [];

  if (canonicalInvoiceTotal > 0 && parsedLineTotal > canonicalInvoiceTotal) {
    flags.push("LINE_TOTAL_EXCEEDS_INVOICE");
  }
  if (
    canonicalInvoiceTotal > 0 &&
    parsedLineTotal > canonicalInvoiceTotal * 0.5
  ) {
    flags.push("LINE_TOTAL_EXCEEDS_HALF_INVOICE");
  }
  if (
    parsedUnitPrice > 0 &&
    quantity > 0 &&
    unitQtyMismatch(parsedLineTotal, computedUnitTimesQty)
  ) {
    flags.push("UNIT_QTY_MISMATCH");
  }

  return flags;
}

function computeScalingFactor(
  canonicalTotal: number,
  classifiedSum: number
): { scalingFactor: number; scalingApplied: boolean } {
  if (canonicalTotal <= 0 || classifiedSum <= 0) {
    return { scalingFactor: 1, scalingApplied: false };
  }
  const larger = Math.max(canonicalTotal, classifiedSum);
  const smaller = Math.min(canonicalTotal, classifiedSum);
  if (larger / smaller <= INVOICE_VALUE_DIVERGENCE_RATIO) {
    return { scalingFactor: 1, scalingApplied: false };
  }
  return {
    scalingFactor: canonicalTotal / classifiedSum,
    scalingApplied: true,
  };
}

/** Validate raw line-level allocation sources before reconciliation scaling. */
export function validateAllocationSources(
  invoice: NormalizedInvoice,
  preferenceLines: LinePreferentialOrigin[]
): AllocationSourceValidation {
  const items = invoice.items ?? [];
  const canonicalInvoiceTotal = resolveInvoiceValue(invoice);
  const preferenceByPosition = new Map(
    preferenceLines.map((line) => [line.position_number, line.preferential_origin])
  );

  const lines: AllocationLineAudit[] = [];
  let rawPreferentialSum = 0;
  let rawNonPreferentialSum = 0;

  for (const prefLine of preferenceLines) {
    const item = resolveItem(items, prefLine.position_number);
    if (!item) continue;

    const resolved = resolveLineAllocationValue(item);
    const flags = auditLineFlags(
      resolved.parsedLineTotal,
      resolved.computedUnitTimesQty,
      resolved.parsedUnitPrice,
      resolved.quantity,
      canonicalInvoiceTotal
    );

    if (prefLine.preferential_origin === "YES") {
      rawPreferentialSum += resolved.value;
    } else if (prefLine.preferential_origin === "NO") {
      rawNonPreferentialSum += resolved.value;
    }

    lines.push({
      position: prefLine.position_number,
      quantity: resolved.quantity,
      quantityRaw: item.quantity,
      unitPrice: resolved.parsedUnitPrice,
      unitPriceRaw: item.unit_price,
      lineTotal: resolved.parsedLineTotal,
      lineTotalRaw: item.line_total,
      computedUnitTimesQty: resolved.computedUnitTimesQty,
      preferentialFlag: prefLine.preferential_origin,
      valueSource: resolved.source,
      allocatedValue: resolved.value,
      flags,
    });
  }

  const rawLineSum = roundMoney(rawPreferentialSum + rawNonPreferentialSum);
  const { scalingFactor, scalingApplied } = computeScalingFactor(
    canonicalInvoiceTotal,
    rawLineSum
  );

  const flaggedLines = lines.filter((line) => line.flags.length > 0);
  const topHighestValueLines = [...lines]
    .sort((a, b) => b.allocatedValue - a.allocatedValue)
    .slice(0, 10);

  return {
    lines,
    rawLineSum,
    rawPreferentialSum: roundMoney(rawPreferentialSum),
    rawNonPreferentialSum: roundMoney(rawNonPreferentialSum),
    canonicalInvoiceTotal: roundMoney(canonicalInvoiceTotal),
    scalingFactor: Math.round(scalingFactor * 1_000_000) / 1_000_000,
    scalingApplied,
    topHighestValueLines,
    flaggedLines,
    corruptionDetected: flaggedLines.length > 0,
  };
}
