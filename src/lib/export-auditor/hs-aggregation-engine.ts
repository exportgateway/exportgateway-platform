import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { resolveFinalHsCodeForItem } from "@/lib/export-auditor/hs-classification-workflow";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import { parseLocaleNumber, roundMoney } from "@/lib/export-auditor/parse-locale-number";
import {
  runPreferentialOriginEngine,
  type LinePreferentialOrigin,
  type PreferentialOriginStatus,
} from "@/lib/export-auditor/preferential-origin-engine";
import {
  formatOriginCountriesDetected,
  resolveOriginCountriesDetectedText,
  type OriginCountriesPreferentialContext,
} from "@/lib/export-auditor/origin-countries-summary";
import { resolveIso2CountryCode } from "@/lib/export-auditor/country-resolution";
import { isNonGoodsLine, isServiceOrTransportLine } from "@/lib/export-auditor/service-line-detection";
import { isInvoiceMetadataLine } from "@/lib/export-auditor/commercial-line-detector";
import { rebuildHsAggregationOrigins } from "@/lib/export-auditor/hs-origin-aggregation-rebuilder";

export {
  isServiceOrTransportLine,
  isPackagingLine,
  isNonGoodsLine,
  LINE_TYPE_GOODS,
  LINE_TYPE_SERVICE,
  LINE_TYPE_PACKAGING,
  resolveInvoiceLineType,
  type InvoiceLineType,
} from "@/lib/export-auditor/service-line-detection";

export const NON_PREFERENTIAL_EXPORT_HS_CODE = "NON_PREFERENTIAL_EXPORT";
export const NON_PREFERENTIAL_EXPORT_LABEL = "Non-Preferential Export Goods";

function normalizeCountryCode(raw: string | undefined | null): string {
  return resolveIso2CountryCode(raw) ?? "";
}

function resolveHsCode(item: ApiInvoiceItem): string | null {
  return resolveFinalHsCodeForItem(item);
}

export interface NormalizedAggregationItem {
  position_number: number;
  description: string;
  quantity: number;
  line_total: number;
  hs_code: string;
  country_of_origin: string;
  net_weight: number | null;
  preferential_origin: PreferentialOriginStatus;
}

export interface HsAggregationRow {
  hs_code: string;
  /** Display label — comma-separated ISO2 countries in bucket. */
  country_of_origin: string;
  /** Preferential status for this bucket — never merged across YES/NO/UNKNOWN. */
  preferential_origin: PreferentialOriginStatus;
  total_quantity: number;
  total_value: number;
  total_net_weight: number | null;
  item_count: number;
  countries_of_origin: string[];
  source_positions: number[];
}

/** Customs declarant aggregation key — HS + preferential origin (COO merged in row). */
export function buildAggregationKey(
  item: Pick<NormalizedAggregationItem, "hs_code" | "preferential_origin">
): string {
  return `${item.hs_code}|${item.preferential_origin}`;
}

export interface PreferenceAggregationRow {
  hs_code: string;
  total_value: number;
  total_net_weight: number | null;
  total_quantity: number;
  source_positions: number[];
  weight_allocation_unavailable?: boolean;
  display_label?: string;
}

export interface MrnSummary {
  total_goods_lines: number;
  unique_hs_codes: number;
  total_invoice_value: number;
  total_net_weight: number | null;
  total_gross_weight: number | null;
  countries_of_origin: string[];
  excluded_service_lines: number;
}

export interface HsAggregationResult {
  hs_aggregation: HsAggregationRow[];
  preferential_summary: PreferenceAggregationRow[];
  non_preferential_summary: PreferenceAggregationRow[];
  unknown_preference_summary: PreferenceAggregationRow[];
  non_preferential_export_summary: PreferenceAggregationRow | null;
  origin_countries_detected: string | null;
  mrn_summary: MrnSummary;
}

function parseNumeric(value: number | string | null | undefined): number {
  return parseLocaleNumber(value);
}

function roundValue(n: number): number {
  return roundMoney(n);
}

function roundWeight(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function buildPreferenceMap(
  invoice: NormalizedInvoice,
  preferenceLines?: LinePreferentialOrigin[]
): Map<number, PreferentialOriginStatus> {
  const lines = preferenceLines ?? runPreferentialOriginEngine(invoice).lines;
  return new Map(lines.map((line) => [line.position_number, line.preferential_origin]));
}

/** Normalize OCR items into aggregation-ready rows (multi-page safe via position_number). */
export function normalizeAggregationItems(
  invoice: NormalizedInvoice,
  preferenceLines?: LinePreferentialOrigin[]
): NormalizedAggregationItem[] {
  const preferenceMap = buildPreferenceMap(invoice, preferenceLines);
  const items = invoice.items ?? [];

  return items.map((item, index) => {
    const extended = item as ApiInvoiceItem & {
      position_number?: number;
      net_weight?: number | string | null;
    };
    const position_number =
      typeof extended.position_number === "number" && extended.position_number > 0
        ? extended.position_number
        : index + 1;

    return {
      position_number,
      description: item.description?.trim() ?? "",
      quantity: parseNumeric(item.quantity),
      line_total: parseNumeric(item.line_total),
      hs_code: resolveHsCode(item) ?? "",
      country_of_origin: normalizeCountryCode(item.country_of_origin),
      net_weight: extended.net_weight != null ? parseNumeric(extended.net_weight) : null,
      preferential_origin: preferenceMap.get(position_number) ?? "NOT_DECLARED",
    };
  });
}

/** Filter to billable goods lines with valid HS codes — excludes transport/service, packaging, and metadata rows. */
export function filterGoodsLines(items: NormalizedAggregationItem[]): NormalizedAggregationItem[] {
  return items.filter(
    (item) =>
      !isNonGoodsLine(item.description) &&
      !isInvoiceMetadataLine(item.description) &&
      item.hs_code.length > 0
  );
}

function aggregateByHsOriginPreferential(
  goods: NormalizedAggregationItem[]
): Map<string, HsAggregationRow> {
  const groups = new Map<string, HsAggregationRow>();

  for (const item of goods) {
    const key = buildAggregationKey(item);
    const existing = groups.get(key);
    const origin = item.country_of_origin;

    if (!existing) {
      groups.set(key, {
        hs_code: item.hs_code,
        country_of_origin: origin,
        preferential_origin: item.preferential_origin,
        total_quantity: item.quantity,
        total_value: item.line_total,
        total_net_weight: item.net_weight,
        item_count: 1,
        countries_of_origin: origin ? [origin] : [],
        source_positions: [item.position_number],
      });
      continue;
    }

    existing.total_quantity += item.quantity;
    existing.total_value += item.line_total;
    existing.item_count += 1;
    existing.source_positions.push(item.position_number);
    if (origin && !existing.countries_of_origin.includes(origin)) {
      existing.countries_of_origin.push(origin);
    }
    if (item.net_weight != null) {
      existing.total_net_weight = (existing.total_net_weight ?? 0) + item.net_weight;
    }
  }

  for (const row of groups.values()) {
    row.total_quantity = roundValue(row.total_quantity);
    row.total_value = roundValue(row.total_value);
    if (row.total_net_weight != null && row.total_net_weight <= 0) {
      row.total_net_weight = null;
    } else if (row.total_net_weight != null) {
      row.total_net_weight = roundWeight(row.total_net_weight);
    }
    row.countries_of_origin = [...new Set(row.countries_of_origin.filter(Boolean))].sort();
    row.country_of_origin = row.countries_of_origin.join(", ");
    row.source_positions.sort((a, b) => a - b);
  }

  return groups;
}

function aggregatePreferenceBucket(
  goods: NormalizedAggregationItem[],
  status: PreferentialOriginStatus
): PreferenceAggregationRow[] {
  const filtered = goods.filter((item) => item.preferential_origin === status);
  const groups = new Map<string, PreferenceAggregationRow>();

  for (const item of filtered) {
    const existing = groups.get(item.hs_code);
    if (!existing) {
      groups.set(item.hs_code, {
        hs_code: item.hs_code,
        total_value: item.line_total,
        total_net_weight: item.net_weight,
        total_quantity: item.quantity,
        source_positions: [item.position_number],
      });
      continue;
    }

    existing.total_value += item.line_total;
    existing.total_quantity += item.quantity;
    existing.source_positions.push(item.position_number);
    if (item.net_weight != null) {
      existing.total_net_weight = (existing.total_net_weight ?? 0) + item.net_weight;
    }
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      total_value: roundValue(row.total_value),
      total_quantity: roundValue(row.total_quantity),
      total_net_weight:
        row.total_net_weight != null ? roundWeight(row.total_net_weight) : null,
      source_positions: row.source_positions.sort((a, b) => a - b),
    }))
    .sort((a, b) => a.hs_code.localeCompare(b.hs_code));
}

function aggregateNonPreferentialExportBucket(
  goods: NormalizedAggregationItem[],
  shipmentNetWeight: number | null
): PreferenceAggregationRow | null {
  if (goods.length === 0) return null;

  let totalQuantity = 0;
  let totalValue = 0;
  let totalNetWeight: number | null = null;
  const sourcePositions: number[] = [];

  for (const item of goods) {
    totalQuantity += item.quantity;
    totalValue += item.line_total;
    sourcePositions.push(item.position_number);
    if (item.net_weight != null) {
      totalNetWeight = (totalNetWeight ?? 0) + item.net_weight;
    }
  }

  if (totalNetWeight == null && shipmentNetWeight != null) {
    totalNetWeight = shipmentNetWeight;
  }

  return {
    hs_code: NON_PREFERENTIAL_EXPORT_HS_CODE,
    display_label: NON_PREFERENTIAL_EXPORT_LABEL,
    total_value: roundValue(totalValue),
    total_quantity: roundValue(totalQuantity),
    total_net_weight: totalNetWeight != null ? roundWeight(totalNetWeight) : null,
    source_positions: sourcePositions.sort((a, b) => a - b),
  };
}

function hasLineLevelNetWeights(goods: NormalizedAggregationItem[]): boolean {
  return goods.some((item) => item.net_weight != null);
}

function distributeWeightByValue<T extends { total_value: number; total_net_weight: number | null }>(
  rows: T[],
  totalWeight: number
): void {
  if (rows.length === 0) return;

  if (rows.length === 1) {
    rows[0].total_net_weight = roundWeight(totalWeight);
    return;
  }

  const totalValue = rows.reduce((sum, row) => sum + row.total_value, 0);
  if (totalValue <= 0) return;

  let allocated = 0;
  for (let index = 0; index < rows.length; index++) {
    if (index === rows.length - 1) {
      rows[index].total_net_weight = roundWeight(totalWeight - allocated);
      continue;
    }
    const share = roundWeight(totalWeight * (rows[index].total_value / totalValue));
    rows[index].total_net_weight = share;
    allocated += share;
  }
}

function markWeightAllocationUnavailable(rows: PreferenceAggregationRow[]): void {
  for (const row of rows) {
    row.total_net_weight = null;
    row.weight_allocation_unavailable = true;
  }
}

function applyShipmentNetWeightAllocation(
  goods: NormalizedAggregationItem[],
  hsRows: HsAggregationRow[],
  preferentialSummary: PreferenceAggregationRow[],
  nonPreferentialSummary: PreferenceAggregationRow[],
  unknownPreferenceSummary: PreferenceAggregationRow[],
  shipmentNetWeight: number | null
): void {
  if (shipmentNetWeight == null || goods.length === 0 || hasLineLevelNetWeights(goods)) {
    return;
  }

  const yesCount = goods.filter((item) => item.preferential_origin === "YES").length;
  const noCount = goods.filter((item) => item.preferential_origin === "NO").length;
  const allPreferential = yesCount === goods.length;
  const allNonPreferential = noCount === goods.length;
  const mixedPreferentialNonPreferential = yesCount > 0 && noCount > 0;

  if (allPreferential) {
    distributeWeightByValue(preferentialSummary, shipmentNetWeight);
    const goodsValue = goods.reduce((sum, item) => sum + item.line_total, 0);
    for (const row of hsRows) {
      row.total_net_weight = roundWeight(
        shipmentNetWeight * (row.total_value / goodsValue)
      );
    }
    return;
  }

  if (allNonPreferential) {
    distributeWeightByValue(nonPreferentialSummary, shipmentNetWeight);
    const goodsValue = goods.reduce((sum, item) => sum + item.line_total, 0);
    for (const row of hsRows) {
      row.total_net_weight = roundWeight(
        shipmentNetWeight * (row.total_value / goodsValue)
      );
    }
    return;
  }

  if (mixedPreferentialNonPreferential) {
    markWeightAllocationUnavailable(preferentialSummary);
    markWeightAllocationUnavailable(nonPreferentialSummary);
    markWeightAllocationUnavailable(unknownPreferenceSummary);
  }
}

function buildMrnSummary(
  goods: NormalizedAggregationItem[],
  hsRows: HsAggregationRow[],
  grossWeight: number | null,
  netWeight: number | null,
  excludedServiceLines: number,
  parsedGoodsLineCount: number,
  canonicalInvoiceTotal: number | null
): MrnSummary {
  const origins = new Set<string>();
  let totalNet: number | null = null;

  for (const item of goods) {
    if (item.country_of_origin) origins.add(item.country_of_origin);
    if (item.net_weight != null) {
      totalNet = (totalNet ?? 0) + item.net_weight;
    }
  }

  if (totalNet == null && netWeight != null) {
    totalNet = netWeight;
  }

  const goodsValue = roundValue(goods.reduce((sum, item) => sum + item.line_total, 0));
  const totalValue =
    canonicalInvoiceTotal != null && canonicalInvoiceTotal > 0
      ? roundMoney(canonicalInvoiceTotal)
      : goodsValue;

  return {
    total_goods_lines: parsedGoodsLineCount > 0 ? parsedGoodsLineCount : goods.length,
    unique_hs_codes: hsRows.length,
    total_invoice_value: totalValue,
    total_net_weight: totalNet != null ? roundWeight(totalNet) : null,
    total_gross_weight: grossWeight != null ? roundWeight(grossWeight) : null,
    countries_of_origin: [...origins].sort(),
    excluded_service_lines: excludedServiceLines,
  };
}

export interface RunHsAggregationOptions {
  preferenceLines?: LinePreferentialOrigin[];
  grossWeight?: number | null;
  /** Canonical invoice total — overrides sum of mis-parsed line totals. */
  invoiceTotalValue?: number | null;
  /** Preferential origin context for origin country display when COO is absent. */
  originCountriesContext?: OriginCountriesPreferentialContext;
}

/**
 * Enterprise HS Aggregation Engine — deterministic tariff totals with preferential split.
 * Every aggregated total traces to source invoice positions via source_positions.
 */
export function runHsAggregationEngine(
  invoice: NormalizedInvoice,
  options: RunHsAggregationOptions = {}
): HsAggregationResult {
  const allItems = normalizeAggregationItems(invoice, options.preferenceLines);
  const excludedServiceLines = allItems.filter((item) =>
    isNonGoodsLine(item.description)
  ).length;
  const goods = filterGoodsLines(allItems);
  const parsedGoodsLineCount = allItems.filter(
    (item) => !isNonGoodsLine(item.description)
  ).length;
  const hsMap = aggregateByHsOriginPreferential(goods);
  let hs_aggregation = [...hsMap.values()].sort((a, b) => a.hs_code.localeCompare(b.hs_code));
  hs_aggregation = rebuildHsAggregationOrigins(hs_aggregation, goods);

  const grossWeight =
    options.grossWeight ?? invoice.shipment_summary?.gross_weight_total ?? null;
  const netWeight =
    invoice.shipment_summary?.net_weight_total ?? null;

  const allNotDeclared =
    goods.length > 0 && goods.every((item) => item.preferential_origin === "NOT_DECLARED");

  let preferential_summary = aggregatePreferenceBucket(goods, "YES");
  let non_preferential_summary = aggregatePreferenceBucket(goods, "NO");
  let unknown_preference_summary = [
    ...aggregatePreferenceBucket(goods, "UNKNOWN"),
    ...(allNotDeclared ? [] : aggregatePreferenceBucket(goods, "NOT_DECLARED")),
  ].sort((a, b) => a.hs_code.localeCompare(b.hs_code));

  const non_preferential_export_summary = allNotDeclared
    ? aggregateNonPreferentialExportBucket(goods, netWeight)
    : null;

  if (allNotDeclared && non_preferential_export_summary) {
    non_preferential_summary = [non_preferential_export_summary];
  }

  applyShipmentNetWeightAllocation(
    goods,
    hs_aggregation,
    preferential_summary,
    non_preferential_summary,
    unknown_preference_summary,
    netWeight
  );

  const origin_countries_detected = options.originCountriesContext
    ? resolveOriginCountriesDetectedText(invoice.items, options.originCountriesContext)
    : formatOriginCountriesDetected(invoice.items);

  return {
    hs_aggregation,
    preferential_summary,
    non_preferential_summary,
    unknown_preference_summary,
    non_preferential_export_summary,
    origin_countries_detected,
    mrn_summary: buildMrnSummary(
      goods,
      hs_aggregation,
      grossWeight,
      netWeight,
      excludedServiceLines,
      parsedGoodsLineCount,
      options.invoiceTotalValue ?? null
    ),
  };
}
