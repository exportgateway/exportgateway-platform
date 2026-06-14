/**
 * Line value recovery — sequential apparel row alignment and missing-line synthesis.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractStyleCodeFromItem } from "@/lib/export-auditor/commercial-line-deduplication";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";
import { normalizeAndValidateHsToken } from "@/lib/export-auditor/hs-code-normalize";

const HS_LABEL_IN_BLOCK = /\bHS\s*Code\s*[-–]\s*([\d][\d.\s]{5,16}\d)\b/i;
const ORIGIN_DASH_BLOCK = /\bOrigin\s*[-–]\s*([A-Za-z]+(?:[ \t]+[A-Za-z]+)*)/i;

const STYLE_CODE = /\b([12][A-Z]{2}[A-Z0-9]{8,})\b/i;

/** Mamiye / apparel qty-first row: qty, style, net amount, description…, unit price */
const APPAREL_STYLE_ROW =
  /^\s*(\d{1,5})\s+([12][A-Z]{2}[A-Z0-9]{8,})\s+([\d.,\s]+)/i;

export interface ParsedApparelStyleRow {
  quantity: number;
  styleCode: string;
  lineTotal: number;
  unitPrice: number | null;
  rawLine: string;
}

function parsePositive(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;
  const parsed = parseLocaleNumber(String(raw).trim());
  return parsed != null && parsed > 0 ? parsed : 0;
}

/** Parse all qty-first apparel style rows from OCR corpus in document order. */
export function parseApparelStyleRows(corpus: string): ParsedApparelStyleRow[] {
  const rows: ParsedApparelStyleRow[] = [];

  for (const rawLine of corpus.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(?:Style|Style\s+Description|Total|Subtotal|Payment|Due)\b/i.test(trimmed)) continue;

    const match = trimmed.match(APPAREL_STYLE_ROW);
    if (!match) continue;

    const quantity = parsePositive(match[1]);
    const styleCode = match[2].toUpperCase();
    const lineTotal = parsePositive(match[3]);
    if (quantity <= 0 || lineTotal <= 0) continue;

    const afterStyle = trimmed.slice(trimmed.indexOf(match[2]) + match[2].length);
    const trailingAmounts = [...afterStyle.matchAll(/([\d.,]+)/g)]
      .map((m) => parsePositive(m[1]))
      .filter((n) => n > 0);
    const unitPrice =
      trailingAmounts.length >= 2
        ? trailingAmounts[trailingAmounts.length - 1]
        : lineTotal / quantity;

    rows.push({
      quantity,
      styleCode,
      lineTotal,
      unitPrice: unitPrice > 0 ? unitPrice : null,
      rawLine: trimmed,
    });
  }

  return rows;
}

export function extractBlockFieldsForStyle(corpus: string, styleCode: string): {
  hs_code?: string;
  country_of_origin?: string;
} {
  return extractBlockFields(corpus, styleCode);
}

function extractBlockFields(corpus: string, styleCode: string): {
  hs_code?: string;
  country_of_origin?: string;
} {
  const lines = corpus.split(/\r?\n/);
  const upper = styleCode.toUpperCase();
  const hitIndex = lines.findIndex((line) => line.toUpperCase().includes(upper));
  if (hitIndex < 0) return {};

  const block = lines.slice(hitIndex, hitIndex + 6).join("\n");
  const hsMatch = block.match(HS_LABEL_IN_BLOCK);
  const hs = hsMatch ? normalizeAndValidateHsToken(hsMatch[1]).normalized : null;
  const originMatch = block.match(ORIGIN_DASH_BLOCK);
  const origin = originMatch?.[1]?.trim() ?? null;

  return {
    ...(hs ? { hs_code: hs } : {}),
    ...(origin ? { country_of_origin: origin } : {}),
  };
}

function buildItemFromRow(
  row: ParsedApparelStyleRow,
  position: number,
  corpus: string
): ApiInvoiceItem {
  const blockFields = extractBlockFields(corpus, row.styleCode);
  return {
    item_code: row.styleCode,
    description: row.rawLine,
    quantity: row.quantity,
    line_total: row.lineTotal,
    unit_price: row.unitPrice,
    position_number: position,
    ...blockFields,
  };
}

function applyRowToItem(item: ApiInvoiceItem, row: ParsedApparelStyleRow): ApiInvoiceItem {
  return {
    ...item,
    item_code: item.item_code?.trim() || row.styleCode,
    quantity: row.quantity,
    line_total: row.lineTotal,
    unit_price: row.unitPrice ?? item.unit_price,
  };
}

/**
 * Align line qty/value from parsed apparel rows by style code (not sequential index).
 * Output order follows PDF document order — prevents position value shifting.
 */
export function recoverLineValuesFromCorpus(invoice: NormalizedInvoice): NormalizedInvoice {
  const corpus = buildInvoiceTextCorpus(invoice);
  if (!corpus.trim()) return invoice;

  const pdfCorpus =
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text.trim()
      : "";
  const parsedRows = parseApparelStyleRows(pdfCorpus || corpus);
  if (parsedRows.length === 0) return invoice;

  const ocrItems = invoice.items ?? [];
  const ocrByStyle = new Map<string, ApiInvoiceItem>();
  for (const item of ocrItems) {
    const style = extractStyleCodeFromItem(item);
    if (style && !ocrByStyle.has(style)) {
      ocrByStyle.set(style, item);
    }
  }

  let items: ApiInvoiceItem[] = parsedRows.map((row, index) => {
    const position = index + 1;
    const ocrMatch = ocrByStyle.get(row.styleCode);
    const blockFields = extractBlockFields(pdfCorpus || corpus, row.styleCode);
    const unitPrice =
      row.unitPrice ?? (row.quantity > 0 ? row.lineTotal / row.quantity : null);

    return {
      ...(ocrMatch ?? {}),
      item_code: row.styleCode,
      description: ocrMatch?.description?.trim() || row.rawLine,
      quantity: row.quantity,
      line_total: row.lineTotal,
      unit_price: unitPrice,
      position_number: position,
      hs_code: ocrMatch?.hs_code ?? blockFields.hs_code,
      country_of_origin: ocrMatch?.country_of_origin ?? blockFields.country_of_origin,
    };
  });

  let enriched: NormalizedInvoice = { ...invoice, items };
  enriched = appendProvenance(enriched, {
    field: "line_items",
    value: `apparel_style_alignment:${parsedRows.length}_pdf_rows`,
    source: "line_value_recovery_engine",
  });
  return enriched;
}
