/**
 * Position traceability audit — Source PDF → OCR → Extracted → Final report chain.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractStyleCodeFromItem } from "@/lib/export-auditor/commercial-line-deduplication";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import { normalizeCountryOfOrigin } from "@/lib/export-auditor/country-of-origin-extraction-engine";
import {
  buildSourceCommercialLines,
  type SourceCommercialLine,
} from "@/lib/export-auditor/position-reconciliation-engine";
import { extractBlockFieldsForStyle } from "@/lib/export-auditor/line-value-recovery-engine";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";

export interface PositionTraceRow {
  style_code: string;
  quantity: number;
  line_total: number;
  unit_price: number;
  hs_code: string;
  country_of_origin: string;
}

export interface PositionTraceabilityRecord {
  position: number;
  sourcePdf: PositionTraceRow | null;
  ocrRow: PositionTraceRow | null;
  extractedRow: PositionTraceRow | null;
  finalRow: PositionTraceRow;
  qtyExact: boolean;
  valueExact: boolean;
  hsExact: boolean;
  cooExact: boolean;
  reconciled: boolean;
}

export interface PositionTraceabilityAudit {
  records: PositionTraceabilityRecord[];
  passed: boolean;
}

function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  return parseLocaleNumber(String(raw).trim()) ?? 0;
}

function toTraceRow(item: ApiInvoiceItem | null | undefined): PositionTraceRow | null {
  if (!item) return null;
  const qty = parseNum(item.quantity);
  const lineTotal = parseNum(item.line_total);
  return {
    style_code: extractStyleCodeFromItem(item),
    quantity: qty,
    line_total: lineTotal,
    unit_price: parseNum(item.unit_price) || (qty > 0 ? lineTotal / qty : 0),
    hs_code: (item.hs_code ?? "").trim(),
    country_of_origin: (item.country_of_origin ?? "").trim(),
  };
}

function sourceToTraceRow(source: SourceCommercialLine): PositionTraceRow {
  return {
    style_code: source.styleCode,
    quantity: source.quantity,
    line_total: source.lineTotal,
    unit_price: source.unitPrice,
    hs_code: "",
    country_of_origin: "",
  };
}

function exactNum(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

function exactMoney(a: number, b: number): boolean {
  return a.toFixed(2) === b.toFixed(2);
}

function resolveOcrItems(_invoice: NormalizedInvoice): ApiInvoiceItem[] {
  return [];
}

function matchItemByStyle(
  items: ApiInvoiceItem[],
  style: string,
  position: number
): ApiInvoiceItem | undefined {
  if (!style) return items[position - 1];
  const byIndex = items[position - 1];
  if (byIndex && extractStyleCodeFromItem(byIndex) === style) return byIndex;
  return items.find((item) => extractStyleCodeFromItem(item) === style) ?? items[position - 1];
}

function cooMatches(a: string, b: string): boolean {
  const left = normalizeCountryOfOrigin(a);
  const right = normalizeCountryOfOrigin(b);
  if (left && right) return left === right;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Build full PDF → OCR → extracted → final trace for every position. */
export function buildPositionTraceabilityAudit(
  invoice: NormalizedInvoice,
  options?: {
    ocrItems?: ApiInvoiceItem[];
    preRecoveryItems?: ApiInvoiceItem[];
  }
): PositionTraceabilityAudit {
  const sourceLines = buildSourceCommercialLines(invoice);
  const finalItems = invoice.items ?? [];
  const ocrItems = options?.ocrItems ?? resolveOcrItems(invoice);
  const extractedItems = options?.preRecoveryItems ?? finalItems;

  const pdfCorpus =
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text.trim()
      : "";

  const ocrByStyle = new Map<string, ApiInvoiceItem>();
  for (const item of ocrItems) {
    const style = extractStyleCodeFromItem(item);
    if (style && !ocrByStyle.has(style)) ocrByStyle.set(style, item);
  }

  const records: PositionTraceabilityRecord[] = [];
  const lineCount = Math.max(sourceLines.length, finalItems.length);

  for (let index = 0; index < lineCount; index += 1) {
    const position = index + 1;
    const source = sourceLines[index] ?? null;
    const style = source?.styleCode ?? extractStyleCodeFromItem(finalItems[index] ?? {});
    const finalItem = matchItemByStyle(finalItems, style, position);
    const extractedItem = matchItemByStyle(extractedItems, style, position);
    const pdfBlock = style && pdfCorpus ? extractBlockFieldsForStyle(pdfCorpus, style) : {};

    let sourcePdf = source ? sourceToTraceRow(source) : null;
    if (sourcePdf && pdfBlock.hs_code) sourcePdf = { ...sourcePdf, hs_code: pdfBlock.hs_code };
    if (sourcePdf && pdfBlock.country_of_origin) {
      sourcePdf = { ...sourcePdf, country_of_origin: pdfBlock.country_of_origin };
    }

    const ocrRow = toTraceRow(style ? ocrByStyle.get(style) : undefined);
    const extractedRow = toTraceRow(extractedItem);
    const finalRow =
      toTraceRow(finalItem) ??
      ({
        style_code: "",
        quantity: 0,
        line_total: 0,
        unit_price: 0,
        hs_code: "",
        country_of_origin: "",
      } satisfies PositionTraceRow);

    const qtyExact = sourcePdf ? exactNum(sourcePdf.quantity, finalRow.quantity) : true;
    const valueExact = sourcePdf ? exactMoney(sourcePdf.line_total, finalRow.line_total) : true;
    const hsExact =
      sourcePdf?.hs_code && finalRow.hs_code
        ? normalizeHsToken(sourcePdf.hs_code) === normalizeHsToken(finalRow.hs_code)
        : !sourcePdf?.hs_code || !finalRow.hs_code;
    const cooExact =
      sourcePdf?.country_of_origin && finalRow.country_of_origin
        ? cooMatches(sourcePdf.country_of_origin, finalRow.country_of_origin)
        : !sourcePdf?.country_of_origin || !finalRow.country_of_origin;

    records.push({
      position,
      sourcePdf,
      ocrRow,
      extractedRow,
      finalRow,
      qtyExact,
      valueExact,
      hsExact,
      cooExact,
      reconciled: qtyExact && valueExact && hsExact && cooExact,
    });
  }

  return {
    records,
    passed: records.length > 0 && records.every((record) => record.reconciled),
  };
}

export function attachTraceabilityAuditToInvoice(
  invoice: NormalizedInvoice,
  audit: PositionTraceabilityAudit
): NormalizedInvoice {
  return {
    ...invoice,
    document_flags: {
      ...invoice.document_flags,
      position_traceability_passed: audit.passed,
      position_traceability_records: JSON.stringify(audit.records),
    },
  };
}
