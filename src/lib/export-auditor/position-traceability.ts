import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { generateCustomsDescription } from "@/lib/export-auditor/customs-description";
import { classifyLineHs } from "@/lib/export-auditor/hs-classification-workflow";
import {
  filterGoodsLines,
  isServiceOrTransportLine,
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

function filterTraceabilityLines(items: NormalizedAggregationItem[]): NormalizedAggregationItem[] {
  return items.filter((item) => !isServiceOrTransportLine(item.description));
}

/** Build auditable goods-line traceability from normalized invoice items. */
export function buildPositionTraceability(invoice: NormalizedInvoice): PositionTraceabilityLine[] {
  const normalized = normalizeAggregationItems(invoice);
  const withHs = filterGoodsLines(normalized);
  const items = withHs.length > 0 ? withHs : filterTraceabilityLines(normalized);
  return items.map((item) => mapItemToTraceabilityLine(item, findRawItemForPosition(invoice, item.position_number)));
}

function mapItemToTraceabilityLine(
  item: NormalizedAggregationItem,
  rawItem?: ItemWithUnit
): PositionTraceabilityLine {
  const description = item.description;
  const hsMeta = rawItem ? classifyLineHs(rawItem, item.position_number) : null;
  const finalHsCode = hsMeta?.finalHsCode ?? item.hs_code;

  return {
    positionNumber: item.position_number,
    description,
    quantity: item.quantity,
    value: item.line_total,
    netWeight: item.net_weight,
    countryOfOrigin: formatCountryOfOriginField(item.country_of_origin),
    preferentialOrigin: item.preferential_origin,
    hsCode: finalHsCode ?? "",
    invoiceHsCode: hsMeta?.invoiceHsCode ?? null,
    normalizedHsCode: hsMeta?.normalizedHsCode ?? finalHsCode,
    finalHsCode: hsMeta?.finalHsCode ?? finalHsCode,
    hsStatus: hsMeta?.hsStatus ?? (finalHsCode ? "VALID" : "MISSING"),
    hsSource: hsMeta?.hsSource ?? (finalHsCode ? "INVOICE" : null),
    repairApplied: hsMeta?.repairApplied ?? false,
    validationSource: hsMeta?.validationSource ?? "none",
    hsConfidence: hsMeta?.hsConfidence ?? (finalHsCode ? 100 : 0),
    wizardHsCode: null,
    verificationStatus: "MISSING",
    wizardConfidence: null,
    similarityScore: null,
    verificationReason: "",
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
  aggregationRow: Pick<
    HsAggregationRow,
    "hsCode" | "sourcePositions" | "countryOfOrigin" | "preferentialOrigin" | "countriesOfOrigin"
  >,
  traceabilityLines: PositionTraceabilityLine[]
): PositionTraceabilityLine[] {
  const positions = new Set(getSourcePositionsForHs(hsCode, aggregationRow));
  const bucketPref = aggregationRow.preferentialOrigin;

  return traceabilityLines
    .filter((line) => {
      if (line.hsCode !== hsCode || !positions.has(line.positionNumber)) return false;
      if (bucketPref && line.preferentialOrigin !== bucketPref) return false;
      return true;
    })
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

/** Resolve UOM for an aggregation bucket — unanimous unit, else majority, else PCS. */
export function resolveAggregationUnit(lines: PositionTraceabilityLine[]): string {
  const units = lines
    .map((line) => line.unit?.trim().toUpperCase())
    .filter((unit): unit is string => Boolean(unit));
  if (units.length === 0) return "PCS";

  const unique = new Set(units);
  if (unique.size === 1) return [...unique][0]!;

  const counts = new Map<string, number>();
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}
