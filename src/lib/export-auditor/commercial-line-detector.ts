/**
 * Detect commercial goods lines vs invoice metadata rows before HS classification.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { isServiceOrTransportLine } from "@/lib/export-auditor/service-line-detection";

export interface CommercialGoodsLine {
  positionNumber: number;
  description: string;
  item: ApiInvoiceItem;
}

/** Invoice metadata / spec rows — not billable commercial goods. */
const METADATA_LINE_PATTERNS: RegExp[] = [
  /\b(?:chassis|šasij|sasij|vin|serial\s+no|serijska)\b/i,
  /\b(?:engine\s+power|motor(?:na)?\s+moč|moč\s+motorja|kw|kilowatt)\b/i,
  /\b(?:cubic\s+capacity|working\s+volume|prostornin|cm3|ccm|cm³)\b/i,
  /\b(?:vat|ddv|davek|tax\s+id|eori|iban|swift|payment|plačil|plačilo)\b/i,
  /\b(?:invoice\s+no|račun\s*št|datum|date|incoterms|total|skupaj|znesek)\b/i,
  /\b(?:terms\s+and\s+conditions|legal|warranty|garancij)\b/i,
  /^\s*\d{17}\s*$/i,
  /^\s*[A-HJ-NPR-Z0-9]{17}\s*$/i,
];

const COMPLETE_VEHICLE_PATTERNS: RegExp[] = [
  /\bvehicle\b/i,
  /\btruck\b/i,
  /\blorry\b/i,
  /\bautomobile\b/i,
  /\biveco\b/i,
  /\bmercedes\b/i,
  /\b\d+\s*actros\b/i,
  /\bdaf\b/i,
  /\bscania\b/i,
  /\bvolvo\s+truck\b/i,
  /\beurocargo\b/i,
  /\btovorno\s+vozilo\b/i,
  /\bkompletn/i,
  /\bmotor\s+vehicle\b/i,
  /\blkw\b/i,
];

const VEHICLE_PART_KEYWORDS =
  /\b(?:part|spare\s+part|component|replacement|accessory|rezervni\s+del|komponent)\b/i;

export function isInvoiceMetadataLine(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return true;
  if (text.length < 4) return true;
  return METADATA_LINE_PATTERNS.some((re) => re.test(text));
}

export function isCompleteVehicleDescription(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return false;
  if (VEHICLE_PART_KEYWORDS.test(text)) return false;
  return COMPLETE_VEHICLE_PATTERNS.some((re) => re.test(text));
}

export function isExplicitVehiclePartDescription(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return false;
  return VEHICLE_PART_KEYWORDS.test(text);
}

function resolveItemPosition(item: ApiInvoiceItem, index: number): number {
  const extended = item as ApiInvoiceItem & { position_number?: number | null };
  return typeof extended.position_number === "number" && extended.position_number > 0
    ? extended.position_number
    : index + 1;
}

/** Commercial billable goods lines — excludes service, metadata, and empty rows. */
export function detectCommercialGoodsLines(invoice: NormalizedInvoice): CommercialGoodsLine[] {
  const items = invoice.items ?? [];
  const lines: CommercialGoodsLine[] = [];

  for (const [index, item] of items.entries()) {
    const description = item.description?.trim() ?? "";
    if (isServiceOrTransportLine(description)) continue;
    if (isInvoiceMetadataLine(description)) continue;
    lines.push({
      positionNumber: resolveItemPosition(item, index),
      description,
      item,
    });
  }

  return lines;
}

export function countCommercialGoodsLines(invoice: NormalizedInvoice): number {
  return detectCommercialGoodsLines(invoice).length;
}

/** Single commercial goods line describing a complete vehicle (not parts). */
export function isSingleLineVehicleInvoice(invoice: NormalizedInvoice): boolean {
  const goods = detectCommercialGoodsLines(invoice);
  if (goods.length !== 1) return false;
  return isCompleteVehicleDescription(goods[0].description);
}

/** OCR corpus stripped of metadata blocks that pollute HS regex extraction. */
export function buildCommercialHsCorpus(invoice: NormalizedInvoice, corpus: string): string {
  const goods = detectCommercialGoodsLines(invoice);
  if (goods.length === 0) return corpus;

  const HS_OR_COO_LINE =
    /\b(?:Commodity\s*code|Commoditycode|HS\s*Code|Customs\s+Tariff|Nomenclature|Tariff|COO|Origin\s*[-–]|Made\s+in|Origin\s+Of\s+Goods|Origin\s+Country)\b/i;

  const filtered = corpus
    .split(/\r?\n/)
    .filter((row) => {
      const trimmed = row.trim();
      if (!trimmed) return false;
      if (HS_OR_COO_LINE.test(trimmed)) return true;
      if (/^\s*\d{1,3}\s+(?=[A-Za-z])/.test(trimmed)) return true;
      if (goods.some((line) => trimmed.includes(line.description.slice(0, 40)))) return true;
      if (/\b(?:pos|position|art|item|line)\b/i.test(trimmed) && goods.length === 1) return true;
      if (METADATA_LINE_PATTERNS.some((re) => re.test(trimmed))) return false;
      return goods.length === 1;
    })
    .join("\n");

  return filtered.trim() || corpus;
}
