import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { getMistralOcrCostPerPageUsd } from "@/lib/api-config";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import type { OcrObservability } from "@/lib/export-auditor/types";

export const MISTRAL_OCR_PROVIDER = "Mistral";
export const DEFAULT_MISTRAL_OCR_COST_PER_PAGE_USD = 0.002;

/** Weights for extraction-coverage OCR quality (lines 30%, HS 30%, COO 20%, totals 20%). */
const QUALITY_WEIGHTS = {
  lines: 0.3,
  hs: 0.3,
  coo: 0.2,
  totals: 0.2,
} as const;

export interface ItemExtractionMetrics {
  itemsExtracted: number;
  itemsWithLine: number;
  itemsWithHsCode: number;
  itemsWithCountryOfOrigin: number;
  itemsWithLineTotal: number;
}

function hasLineDescription(item: ApiInvoiceItem): boolean {
  return Boolean(item.description?.trim());
}

function hasHsCode(item: ApiInvoiceItem): boolean {
  const raw = item.hs_code?.trim();
  if (!raw) return false;
  return normalizeHsToken(raw) != null;
}

function hasCountryOfOrigin(item: ApiInvoiceItem): boolean {
  const raw = item.country_of_origin?.trim();
  if (raw) return true;
  const alt = (item as Record<string, unknown>).origin?.toString().trim();
  const coo = (item as Record<string, unknown>).coo?.toString().trim();
  return Boolean(alt || coo);
}

function hasLineTotal(item: ApiInvoiceItem): boolean {
  const value = item.line_total;
  if (value == null) return false;
  if (typeof value === "number") return !Number.isNaN(value);
  return value.trim() !== "";
}

export function inferExtractionSource(invoice: NormalizedInvoice): string {
  const provenance = invoice.extraction_provenance ?? [];
  const ocrEntry = provenance.find(
    (entry) => entry.source === "ocr_primary" || entry.source === "ocr_fallback"
  );
  if (ocrEntry) return ocrEntry.source;
  if (invoice.ocr_text?.trim()) return "mistral_ocr";
  return "mistral_ocr";
}

export function countItemMetrics(items: ApiInvoiceItem[] | undefined): ItemExtractionMetrics {
  const list = items ?? [];
  let itemsWithLine = 0;
  let itemsWithHsCode = 0;
  let itemsWithCountryOfOrigin = 0;
  let itemsWithLineTotal = 0;

  for (const item of list) {
    if (hasLineDescription(item)) itemsWithLine += 1;
    if (hasHsCode(item)) itemsWithHsCode += 1;
    if (hasCountryOfOrigin(item)) itemsWithCountryOfOrigin += 1;
    if (hasLineTotal(item)) itemsWithLineTotal += 1;
  }

  return {
    itemsExtracted: list.length,
    itemsWithLine,
    itemsWithHsCode,
    itemsWithCountryOfOrigin,
    itemsWithLineTotal,
  };
}

function coverageRatio(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, count / total);
}

export function computeOcrQualityScore(metrics: ItemExtractionMetrics): number {
  const total = metrics.itemsExtracted;
  if (total <= 0) return 0;

  const lineRate = coverageRatio(metrics.itemsWithLine, total);
  const hsRate = coverageRatio(metrics.itemsWithHsCode, total);
  const cooRate = coverageRatio(metrics.itemsWithCountryOfOrigin, total);
  const totalsRate = coverageRatio(metrics.itemsWithLineTotal, total);

  const weighted =
    lineRate * QUALITY_WEIGHTS.lines +
    hsRate * QUALITY_WEIGHTS.hs +
    cooRate * QUALITY_WEIGHTS.coo +
    totalsRate * QUALITY_WEIGHTS.totals;

  return Math.round(weighted * 100);
}

export function computeEstimatedOcrCost(
  pageCount: number,
  costPerPage?: number
): number {
  const rate = costPerPage ?? getMistralOcrCostPerPageUsd();
  const pages = Math.max(0, pageCount);
  return Number((pages * rate).toFixed(6));
}

export function buildOcrObservability(
  invoice: NormalizedInvoice,
  pageCount: number,
  costPerPage?: number
): OcrObservability {
  const metrics = countItemMetrics(invoice.items);
  const normalizedPageCount = pageCount > 0 ? pageCount : 1;
  const ocrTextLength = invoice.ocr_text?.length ?? 0;

  return {
    ocrProvider: MISTRAL_OCR_PROVIDER,
    pageCount: normalizedPageCount,
    ocrTextLength,
    extractionSource: inferExtractionSource(invoice),
    itemsExtracted: metrics.itemsExtracted,
    itemsWithHsCode: metrics.itemsWithHsCode,
    itemsWithCountryOfOrigin: metrics.itemsWithCountryOfOrigin,
    itemsWithLineTotal: metrics.itemsWithLineTotal,
    ocrQualityScore: computeOcrQualityScore(metrics),
    estimatedOcrCostUsd: computeEstimatedOcrCost(normalizedPageCount, costPerPage),
    costPerPageUsd: costPerPage ?? getMistralOcrCostPerPageUsd(),
    shipmentFieldsDetected: invoice.ocr_metadata?.shipment_fields_detected,
    shipmentFieldsMissing: invoice.ocr_metadata?.shipment_fields_missing,
  };
}
