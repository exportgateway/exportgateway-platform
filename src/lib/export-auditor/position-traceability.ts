import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { generateCustomsDescription } from "@/lib/export-auditor/customs-description";
import {
  filterGoodsLines,
  normalizeAggregationItems,
  type NormalizedAggregationItem,
} from "@/lib/export-auditor/hs-aggregation-engine";
import { formatCountryOfOriginField } from "@/lib/export-auditor/origin-countries-summary";
import type { HsAggregationRow, PositionTraceabilityLine } from "@/lib/export-auditor/types";

type ItemWithUnit = ApiInvoiceItem & {
  unit?: string | null;
  unit_of_measure?: string | null;
};

/** Resolve commercial unit from item fields or quantity text (e.g. "1225 M"). */
export function resolveItemUnit(item: ItemWithUnit): string | null {
  if (typeof item.unit === "string" && item.unit.trim()) {
    return item.unit.trim();
  }
  if (typeof item.unit_of_measure === "string" && item.unit_of_measure.trim()) {
    return item.unit_of_measure.trim();
  }
  const quantity = item.quantity;
  if (typeof quantity === "string") {
    const match = quantity.trim().match(/^[\d.,]+\s+([A-Za-z]+)$/);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function findRawItemForPosition(
  invoice: NormalizedInvoice,
  positionNumber: number
): ItemWithUnit | undefined {
  const items = invoice.items ?? [];
  return items.find((item, index) => {
    const extended = item as ItemWithUnit & { position_number?: number | null };
    const resolvedPosition =
      typeof extended.position_number === "number" && extended.position_number > 0
        ? extended.position_number
        : index + 1;
    return resolvedPosition === positionNumber;
  }) as ItemWithUnit | undefined;
}

/** Build auditable goods-line traceability from normalized invoice items. */
export function buildPositionTraceability(invoice: NormalizedInvoice): PositionTraceabilityLine[] {
  const items = filterGoodsLines(normalizeAggregationItems(invoice));
  return items.map((item) => mapItemToTraceabilityLine(item, findRawItemForPosition(invoice, item.position_number)));
}

function mapItemToTraceabilityLine(
  item: NormalizedAggregationItem,
  rawItem?: ItemWithUnit
): PositionTraceabilityLine {
  const description = item.description;
  return {
    positionNumber: item.position_number,
    description,
    quantity: item.quantity,
    value: item.line_total,
    netWeight: item.net_weight,
    countryOfOrigin: formatCountryOfOriginField(item.country_of_origin),
    preferentialOrigin: item.preferential_origin,
    hsCode: item.hs_code,
    unit: rawItem ? resolveItemUnit(rawItem) : null,
    customsDescription: generateCustomsDescription(description),
  };
}

/** Resolve source invoice positions for an HS aggregation row. */
export function getSourcePositionsForHs(
  hsCode: string,
  aggregationRow: Pick<HsAggregationRow, "hsCode" | "sourcePositions">
): number[] {
  if (aggregationRow.hsCode !== hsCode) return [];
  return [...aggregationRow.sourcePositions].sort((a, b) => a - b);
}

/** Filter traceability lines that contributed to an HS aggregation row. */
export function getTraceabilityLinesForHs(
  hsCode: string,
  aggregationRow: Pick<HsAggregationRow, "hsCode" | "sourcePositions">,
  traceabilityLines: PositionTraceabilityLine[]
): PositionTraceabilityLine[] {
  const positions = new Set(getSourcePositionsForHs(hsCode, aggregationRow));
  return traceabilityLines
    .filter((line) => line.hsCode === hsCode && positions.has(line.positionNumber))
    .sort((a, b) => a.positionNumber - b.positionNumber);
}

/** Derive preferential origin status label for an HS aggregation export row. */
export function derivePreferentialStatusForHs(
  sourcePositions: number[],
  traceabilityLines: PositionTraceabilityLine[]
): string {
  const statuses = new Set(
    traceabilityLines
      .filter((line) => sourcePositions.includes(line.positionNumber))
      .map((line) => line.preferentialOrigin)
  );

  if (statuses.size === 0) return "UNKNOWN";
  if (statuses.size === 1) return [...statuses][0];
  return "MIXED";
}

export function formatSourcePositions(positions: number[]): string {
  return positions.length > 0 ? positions.join(",") : "";
}
