import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { getMistralOcrCostPerPageUsd } from "@/lib/api-config";
import { normalizeHsToken } from "@/lib/export-auditor/hs-code-normalize";
import { extractGenericHsCodes } from "@/lib/export-auditor/hs-code-extraction-engine";
import { TOTAL_MISMATCH } from "@/lib/export-auditor/invoice-total-consistency-validator";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import type { OcrObservability, OcrRecoveryApplied } from "@/lib/export-auditor/types";
import { isValidConsigneeText } from "@/lib/export-auditor/english-invoice-field-extractor";
import { parseQuantity } from "@/lib/export-auditor/parse-quantity";

export const MISTRAL_OCR_PROVIDER = "Mistral";
export const DEFAULT_MISTRAL_OCR_COST_PER_PAGE_USD = 0.002;

/** Line-level weights — COO is informational; missing COO must not dominate score. */
const LINE_QUALITY_WEIGHTS = {
  lines: 0.35,
  hs: 0.15,
  coo: 0.05,
  totals: 0.2,
  quantity: 0.15,
  unitPrice: 0.1,
} as const;

/** Header-level customs foundation fields. */
const HEADER_FIELD_WEIGHT = 100 / 6;

export interface ItemExtractionMetrics {
  itemsExtracted: number;
  itemsWithLine: number;
  itemsWithHsCode: number;
  itemsWithCountryOfOrigin: number;
  itemsWithLineTotal: number;
  itemsWithQuantity: number;
  itemsWithUnitPrice: number;
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

function hasQuantity(item: ApiInvoiceItem): boolean {
  return parseQuantity(item.quantity) > 0;
}

function hasUnitPrice(item: ApiInvoiceItem): boolean {
  const value = item.unit_price;
  if (value == null) return false;
  if (typeof value === "number") return !Number.isNaN(value) && value > 0;
  return value.trim() !== "" && parseFloat(value.replace(",", ".")) > 0;
}

function coverageRatio(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, count / total);
}

export function computeHeaderExtractionScore(invoice: NormalizedInvoice): number {
  let score = 0;
  if (invoice.invoice_number?.trim()) score += HEADER_FIELD_WEIGHT;
  if (invoice.exporter?.trim()) score += HEADER_FIELD_WEIGHT;
  if (isValidConsigneeText(invoice.consignee)) score += HEADER_FIELD_WEIGHT;
  if (resolveInvoiceValue(invoice) > 0) score += HEADER_FIELD_WEIGHT;
  if (invoice.country?.trim() || invoice.country_code?.trim()) score += HEADER_FIELD_WEIGHT;
  const shipment = invoice.shipment_summary;
  if (
    shipment?.gross_weight_total != null ||
    shipment?.net_weight_total != null ||
    shipment?.package_count != null
  ) {
    score += HEADER_FIELD_WEIGHT;
  }
  return Math.round(score);
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
  let itemsWithQuantity = 0;
  let itemsWithUnitPrice = 0;

  for (const item of list) {
    if (hasLineDescription(item)) itemsWithLine += 1;
    if (hasHsCode(item)) itemsWithHsCode += 1;
    if (hasCountryOfOrigin(item)) itemsWithCountryOfOrigin += 1;
    if (hasLineTotal(item)) itemsWithLineTotal += 1;
    if (hasQuantity(item)) itemsWithQuantity += 1;
    if (hasUnitPrice(item)) itemsWithUnitPrice += 1;
  }

  return {
    itemsExtracted: list.length,
    itemsWithLine,
    itemsWithHsCode,
    itemsWithCountryOfOrigin,
    itemsWithLineTotal,
    itemsWithQuantity,
    itemsWithUnitPrice,
  };
}

/** Line coverage score when goods rows exist. */
export function computeLineExtractionScore(metrics: ItemExtractionMetrics): number {
  const total = metrics.itemsExtracted;
  if (total <= 0) return 0;

  const lineRate = coverageRatio(metrics.itemsWithLine, total);
  const hsRate = coverageRatio(metrics.itemsWithHsCode, total);
  const cooRate = coverageRatio(metrics.itemsWithCountryOfOrigin, total);
  const totalsRate = coverageRatio(metrics.itemsWithLineTotal, total);
  const quantityRate = coverageRatio(metrics.itemsWithQuantity, total);
  const unitPriceRate = coverageRatio(metrics.itemsWithUnitPrice, total);

  const weighted =
    lineRate * LINE_QUALITY_WEIGHTS.lines +
    hsRate * LINE_QUALITY_WEIGHTS.hs +
    cooRate * LINE_QUALITY_WEIGHTS.coo +
    totalsRate * LINE_QUALITY_WEIGHTS.totals +
    quantityRate * LINE_QUALITY_WEIGHTS.quantity +
    unitPriceRate * LINE_QUALITY_WEIGHTS.unitPrice;

  return Math.round(weighted * 100);
}

/** @deprecated Use computeDataExtractionCompleteness — retained for direct line-only callers. */
export function computeOcrQualityScore(metrics: ItemExtractionMetrics): number {
  return computeLineExtractionScore(metrics);
}

/**
 * Data extraction completeness — header foundation (60%) + line coverage (40%).
 * Invoices with major customs fields present stay above 80% even when COO is sparse.
 */
export function computeDataExtractionCompleteness(
  invoice: NormalizedInvoice,
  metrics: ItemExtractionMetrics
): number {
  const headerScore = computeHeaderExtractionScore(invoice);
  const lineScore = computeLineExtractionScore(metrics);

  let score =
    metrics.itemsExtracted === 0
      ? headerScore
      : Math.round(headerScore * 0.6 + lineScore * 0.4);

  const valueMissing = resolveInvoiceValue(invoice) <= 0;
  const consigneeInvalid = !isValidConsigneeText(invoice.consignee);
  const noLineItems = metrics.itemsExtracted === 0;

  if (valueMissing || consigneeInvalid || noLineItems) {
    score = Math.min(score, 70);
  }

  const corpus = invoice.ocr_text?.trim() ?? "";
  const corpusHs = corpus ? extractGenericHsCodes(corpus).length : 0;
  if (metrics.itemsExtracted > 0 && metrics.itemsWithHsCode === 0 && corpusHs > 0) {
    score = Math.min(score, 65);
  }

  if (invoice.document_flags?.[TOTAL_MISMATCH]) {
    score = Math.min(score, 60);
  }

  return score;
}

export function computeEstimatedOcrCost(
  pageCount: number,
  costPerPage?: number
): number {
  const rate = costPerPage ?? getMistralOcrCostPerPageUsd();
  const pages = Math.max(0, pageCount);
  return Number((pages * rate).toFixed(6));
}

export function buildOcrRecoveryObservability(
  invoice: NormalizedInvoice
): { recoveryApplied: OcrRecoveryApplied; recoveryConfidence: number } {
  const recoveries = invoice.parser_recovery_provenance ?? [];
  const recoveryApplied: OcrRecoveryApplied = {
    consigneeRecovery:
      recoveries.some(
        (entry) =>
          entry.field === "consignee" || entry.recovery_source === "OCR_CONSIGNEE_RECOVERY"
      ) || false,
    totalRecovery:
      recoveries.some(
        (entry) =>
          entry.field === "invoice_value" || entry.recovery_source === "OCR_TOTAL_RECOVERY"
      ) || false,
    lineRecovery:
      recoveries.some(
        (entry) =>
          entry.field === "line_items" || entry.recovery_source === "TABLE_RECONSTRUCTION"
      ) ||
      invoice.document_flags?.line_items_recovered === true ||
      false,
  };

  const anyRecovery =
    recoveryApplied.consigneeRecovery ||
    recoveryApplied.totalRecovery ||
    recoveryApplied.lineRecovery;

  if (!anyRecovery) {
    return { recoveryApplied, recoveryConfidence: 100 };
  }

  const successes = [
    recoveryApplied.consigneeRecovery && isValidConsigneeText(invoice.consignee),
    recoveryApplied.totalRecovery && resolveInvoiceValue(invoice) > 0,
    recoveryApplied.lineRecovery && (invoice.items?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const attempted = [
    recoveryApplied.consigneeRecovery,
    recoveryApplied.totalRecovery,
    recoveryApplied.lineRecovery,
  ].filter(Boolean).length;

  const recoveryConfidence =
    attempted > 0 ? Math.round((successes / attempted) * 100) : 100;

  return { recoveryApplied, recoveryConfidence };
}

export function buildOcrObservability(
  invoice: NormalizedInvoice,
  pageCount: number,
  costPerPage?: number
): OcrObservability {
  const metrics = countItemMetrics(invoice.items);
  const normalizedPageCount = pageCount > 0 ? pageCount : 1;
  const ocrTextLength = invoice.ocr_text?.length ?? 0;
  const completenessScore = computeDataExtractionCompleteness(invoice, metrics);
  const { recoveryApplied, recoveryConfidence } = buildOcrRecoveryObservability(invoice);

  return {
    ocrProvider: MISTRAL_OCR_PROVIDER,
    pageCount: normalizedPageCount,
    ocrTextLength,
    extractionSource: inferExtractionSource(invoice),
    itemsExtracted: metrics.itemsExtracted,
    itemsWithHsCode: metrics.itemsWithHsCode,
    itemsWithCountryOfOrigin: metrics.itemsWithCountryOfOrigin,
    itemsWithLineTotal: metrics.itemsWithLineTotal,
    ocrQualityScore: completenessScore,
    dataExtractionCompleteness: completenessScore,
    recoveryApplied,
    recoveryConfidence,
    estimatedOcrCostUsd: computeEstimatedOcrCost(normalizedPageCount, costPerPage),
    costPerPageUsd: costPerPage ?? getMistralOcrCostPerPageUsd(),
    shipmentFieldsDetected: invoice.ocr_metadata?.shipment_fields_detected,
    shipmentFieldsMissing: invoice.ocr_metadata?.shipment_fields_missing,
  };
}
