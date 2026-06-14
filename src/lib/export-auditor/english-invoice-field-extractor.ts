/**
 * English invoice layout field recovery from OCR text when structured parser output is empty.
 * Supports Buyer / Recipient / Invoice # / Total invoice amount / Amount to be paid layouts.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";
import {
  recordParserRecovery,
  serializeRecoveryValue,
} from "@/lib/export-auditor/parser-recovery-provenance";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";
import {
  extractLabeledInvoiceTotal,
  isTruncatedThousandsFragment,
  LABELED_INVOICE_TOTAL_RES,
} from "@/lib/export-auditor/money-token-extract";
import { isParserVatRateAsTotal } from "@/lib/export-auditor/parser-invoice-total-guards";
import { isPreDiscountInvoiceAmount, extractVatInclusiveInvoiceTotal } from "@/lib/export-auditor/invoice-discount-context";
import {
  parseQuantity,
  QUANTITY_CAPTURE,
  QUANTITY_WITH_UNIT_RE,
  validateAndNormalizeLineItemQuantities,
  QUANTITY_PARSING_WARNING,
} from "@/lib/export-auditor/parse-quantity";

const INVOICE_NUMBER_RE =
  /\bInvoice\s*(?:Number|#|No\.?)\s*:?\s*([A-Z0-9][A-Z0-9./\-]+)/i;

const INVOICE_DATE_RE = /\bDate\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i;

export const TOTAL_AMOUNT_PATTERNS = LABELED_INVOICE_TOTAL_RES;

const LINE_TABLE_HEADER =
  /\bPos(?:ition)?\s+Description\b/i;

const LINE_ROW_RE = new RegExp(
  `^(\\d+)\\s+(.+?)\\s+(${QUANTITY_CAPTURE})\\s+([A-Za-z]{1,4})\\s+([\\d.,]+)(?:\\s+([\\d.,]+))?`
);

const LINE_ROW_WITH_BARCODE_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+(\\d{6,})\\s+(${QUANTITY_CAPTURE})\\s+(?:pcs|pc|st|[A-Za-z]{1,4})\\s+([\\d.,]+(?:\\s+[\\d.,]+)*)`,
  "i"
);

const LINE_ROW_SIMPLE_RE =
  /^(\d+)\s+(.+?)\s+([\d.,]+)\s*$/;

/** Reject payment QR footer text mistaken as consignee. */
export const REJECTED_CONSIGNEE_RE =
  /\b(?:qr\s*(?:for\s*)?payment|scan\s*qr|payment\s*qr|qr\s*code)\b/i;

function parseMoney(raw: string): number | null {
  const value = parseLocaleNumber(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isRejectedConsigneeText(text: string | null | undefined): boolean {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return true;
  return REJECTED_CONSIGNEE_RE.test(trimmed);
}

export function isValidConsigneeText(text: string | null | undefined): boolean {
  return Boolean(text?.trim()) && !isRejectedConsigneeText(text);
}

export type BlockExtractionMode = "address" | "standard";

/** Terminators for Recipient / Consignee / Buyer address blocks — dates must not break extraction. */
const ADDRESS_BLOCK_TERMINATOR_RE =
  /^(?:Invoice\s*(?:Number|#|No\.?)|Payment\s+Terms|Pos(?:ition)?\s|Description\b|Barcode\b|Total\s+w\/o|Subtotal|Grand\s+total|Total\s+invoice|Amount\s+to\s+be|Recipient|Buyer|Consignee|Shipper|Seller|Exporter|Scan\s+QR|QR\s+for|^VAT\s+\d+\s*%)/i;

const STANDARD_BLOCK_TERMINATOR_RE =
  /^(?:Invoice\s*(?:Number|#|No\.?)|Recipient|Buyer|Consignee|Shipper|Seller|Exporter|Pos(?:ition)?\s|Date:|Due date:|Payment|Contract:|Delivery|Scan\s+QR|QR)/i;

function isBlockTerminator(line: string, mode: BlockExtractionMode): boolean {
  return mode === "address"
    ? ADDRESS_BLOCK_TERMINATOR_RE.test(line)
    : STANDARD_BLOCK_TERMINATOR_RE.test(line);
}

export function extractBlockAfterLabel(
  corpus: string,
  labelRe: RegExp,
  maxLines = 6,
  mode: BlockExtractionMode = "standard"
): string[] {
  const match = corpus.match(labelRe);
  if (match?.index == null) return [];
  const remainder = corpus.slice(match.index + match[0].length);
  const lines: string[] = [];
  for (const raw of remainder.split(/\n/)) {
    const line = raw.trim();
    if (!line && lines.length > 0) break;
    if (lines.length > 0 && isBlockTerminator(line, mode)) {
      break;
    }
    if (line) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  return lines;
}

/** Trade / personal name from Buyer line that also contains a company suffix (d.o.o., GmbH, …). */
export function extractTradeNameFromBuyerLine(line: string): string | null {
  const trimmed = line.replace(/^["']|["']$/g, "").trim();
  if (!trimmed || isRejectedConsigneeText(trimmed)) return null;

  const quoted = trimmed.match(/["'""„"]([^"'""„"]+)["'""„"]/);
  if (quoted?.[1]) {
    const name = quoted[1].trim();
    if (name.length > 2 && !/d\.o\.o\./i.test(name) && !isRejectedConsigneeText(name)) {
      return name;
    }
  }

  if (/d\.o\.o\.|GmbH|Ltd\.|Inc\.|S\.A\.|s\.r\.o\./i.test(trimmed)) {
    const trade = trimmed
      .replace(/\s+(?:[A-Za-z0-9][A-Za-z0-9.\s&-]*(?:d\.o\.o\.|GmbH|Ltd\.|Inc\.|S\.A\.|s\.r\.o\.).*)$/i, "")
      .replace(/^Z\.T\.R\.\s*/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (
      trade.length > 2 &&
      !/^\d/.test(trade) &&
      !/d\.o\.o\./i.test(trade) &&
      !isRejectedConsigneeText(trade)
    ) {
      return trade;
    }
  }

  return null;
}

function isConsigneeAddressLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length <= 2) return false;
  if (/^\d/.test(trimmed)) return false;
  if (isRejectedConsigneeText(trimmed)) return false;
  if (/^(?:Date|Invoice\s+Date|Issue\s+Date|Due\s+date|Delivery\s+date|Contract|Payment\s+method)\s*:/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function extractEnglishInvoiceNumber(corpus: string): string | null {
  const match = corpus.match(INVOICE_NUMBER_RE);
  return match?.[1]?.trim() ?? null;
}

export function extractEnglishInvoiceDate(corpus: string): string | null {
  const match = corpus.match(INVOICE_DATE_RE);
  return match?.[1]?.trim() ?? null;
}

export function extractEnglishInvoiceTotal(corpus: string): number | null {
  return extractLabeledInvoiceTotal(corpus);
}

/** Labeled totals in strict recovery priority (Total invoice amount → Amount to be paid → Discounted amount). */
export function extractLabeledInvoiceTotalByPriority(corpus: string): number | null {
  return extractEnglishInvoiceTotal(corpus);
}

export function extractEnglishInvoiceCurrency(corpus: string): string | null {
  for (const re of TOTAL_AMOUNT_PATTERNS) {
    const match = corpus.match(re);
    if (match?.[0] && /\bEUR\b|€/.test(match[0])) return "EUR";
  }
  if (/\bEUR\b|€/.test(corpus)) return "EUR";
  return null;
}

/**
 * Consignee — prefer Recipient block; combine Buyer company name + Recipient address.
 * Rejects QR payment footer strings.
 */
export function extractEnglishConsignee(corpus: string): string | null {
  const parts: string[] = [];

  const buyerLines = extractBlockAfterLabel(corpus, /Buyer\s*:?\s*/i, 8, "address");
  for (const line of buyerLines) {
    const tradeName = extractTradeNameFromBuyerLine(line);
    if (tradeName && !parts.includes(tradeName)) {
      parts.push(tradeName);
      break;
    }
    const first = line.replace(/^["']|["']$/g, "").trim();
    if (
      first.length > 2 &&
      !/^\d/.test(first) &&
      !/d\.o\.o\./i.test(first) &&
      !isRejectedConsigneeText(first) &&
      !parts.includes(first)
    ) {
      parts.push(first);
      break;
    }
  }

  for (const label of [/Recipient\s*:?\s*/i, /Consignee\s*:?\s*/i, /Bill\s+To\s*:?\s*/i]) {
    const lines = extractBlockAfterLabel(corpus, label, 10, "address");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!isConsigneeAddressLine(trimmed) || parts.includes(trimmed)) continue;
      parts.push(trimmed);
    }
    if (parts.length > 0) break;
  }

  if (parts.length > 0) {
    return parts.join("\n");
  }

  return null;
}

/** Exporter — company with seller VAT (often SI/DE) or Shipper/Seller block. */
export function extractEnglishExporter(corpus: string): string | null {
  const shipperLines = extractBlockAfterLabel(corpus, /(?:Shipper|Seller|Exporter)\s*:?\s*/i);
  if (shipperLines[0]) return shipperLines[0].trim();

  const buyerBlock = extractBlockAfterLabel(corpus, /Buyer\s*:?\s*/i, 6);
  for (const line of buyerBlock) {
    const siCompany = line.match(/([A-Za-z0-9][A-Za-z0-9.\s&-]*d\.o\.o\.)/i);
    if (siCompany && /VAT number:\s*SI/i.test(corpus)) {
      return siCompany[1].trim();
    }
  }

  const vatSiMatch = corpus.match(
    /([A-Za-z0-9][^\n]{3,60}?d\.o\.o\.[^\n]*)\n[^\n]*VAT number:\s*SI/i
  );
  if (vatSiMatch?.[1]) return vatSiMatch[1].trim();

  return null;
}

const EUROPEAN_LINE_ROW_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+(${QUANTITY_CAPTURE})\\s+(?:pcs|pc|st|[A-Za-z]{1,4})\\s+([\\d.,]+)\\s+([\\d.,]+)`
);

function parseAmountsAfterQuantity(line: string): number[] {
  const qtyMatch = line.match(QUANTITY_WITH_UNIT_RE);
  if (!qtyMatch) return [];

  const afterQty = line.slice(qtyMatch.index! + qtyMatch[0].length).trim();
  const amounts: number[] = [];
  for (const token of afterQty.split(/\s+/)) {
    const value = parseMoney(token);
    if (value != null && value >= 0.01 && value !== 22 && value !== 9.5) {
      amounts.push(value);
    }
  }
  return amounts;
}

function parseBarcodeTableRow(line: string): ApiInvoiceItem | null {
  const match = line.match(LINE_ROW_WITH_BARCODE_RE);
  if (!match) return null;

  const position = parseInt(match[1], 10);
  const quantity = parseQuantity(match[4]);
  const amounts = parseAmountsAfterQuantity(line);
  if (amounts.length === 0) return null;

  const unitPrice = amounts[0];
  const lineTotal = amounts.length >= 2 ? amounts[1] : amounts[amounts.length - 1];

  return {
    position_number: position,
    description: match[2].trim(),
    quantity,
    unit_price: unitPrice ?? undefined,
    line_total: lineTotal,
  };
}

function applyQuantityNormalization(items: ApiInvoiceItem[]): {
  items: ApiInvoiceItem[];
  quantityWarning: boolean;
} {
  const { items: normalized, hasWarning } = validateAndNormalizeLineItemQuantities(items);
  return { items: normalized, quantityWarning: hasWarning };
}

function parsePartialLineRow(line: string): ApiInvoiceItem | null {
  const withBarcode = parseBarcodeTableRow(line);
  if (withBarcode) return withBarcode;

  const structured = parseLineRow(line);
  if (structured) return structured;

  const european = line.match(EUROPEAN_LINE_ROW_RE);
  if (european) {
    const position = parseInt(european[1], 10);
    const quantity = parseQuantity(european[3]);
    const unitPrice = parseMoney(european[4]);
    const lineTotal = parseMoney(european[5]);
    if (lineTotal == null) return null;
    return {
      position_number: position,
      description: european[2].trim(),
      quantity,
      unit_price: unitPrice ?? undefined,
      line_total: lineTotal,
    };
  }

  const minimal = line.match(new RegExp(`^(\\d{1,3})\\s+(.+?)\\s+(${QUANTITY_CAPTURE})`));
  if (!minimal) return null;

  const position = parseInt(minimal[1], 10);
  const quantity = parseQuantity(minimal[3]);
  const tail = line.slice(minimal[0].length);
  const amounts: number[] = [];
  for (const token of tail.split(/\s+/)) {
    const value = parseMoney(token);
    if (value != null && value >= 1 && value !== 22 && value !== 9.5) {
      amounts.push(value);
    }
  }
  if (amounts.length === 0) return null;

  const lineTotal = amounts.length >= 2 ? amounts[1] : amounts[amounts.length - 1];

  return {
    position_number: position,
    description: minimal[2].trim(),
    quantity,
    line_total: lineTotal,
  };
}

export interface LineItemExtractionResult {
  items: ApiInvoiceItem[];
  partialRecovery: boolean;
  quantityWarning?: boolean;
}

const TABLE_HEADER_FRAGMENT_RE =
  /^(?:Pos(?:ition)?|Description|Barcode|Quantity|MU|Price|Amount|w\/o|%|disc\.|Price|with|VAT)/i;

function findAllTableHeaderIndices(corpus: string): number[] {
  const indices: number[] = [];
  const re = new RegExp(LINE_TABLE_HEADER.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(corpus)) !== null) {
    indices.push(match.index);
  }
  return indices;
}

function isTableTotalTerminator(line: string, remainingLines: string[]): boolean {
  if (!/^(?:Total|Subtotal|VAT|Amount|Payment|Due|QR|Scan)/i.test(line)) return false;
  return !remainingLines.some((raw) => /^\d{1,3}\s+\S/.test(raw.trim()));
}

function extractItemsFromTableText(
  tableText: string
): { items: ApiInvoiceItem[]; partialRecovery: boolean } {
  const items: ApiInvoiceItem[] = [];
  const seenPositions = new Set<number>();
  let partialRecovery = false;
  const lines = tableText.split(/\n/).map((raw) => raw.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (LINE_TABLE_HEADER.test(line)) continue;
    if (TABLE_HEADER_FRAGMENT_RE.test(line)) continue;
    if (isTableTotalTerminator(line, lines.slice(index + 1))) continue;

    let item = parseLineRow(line);
    if (!item) {
      item = parsePartialLineRow(line);
      if (item) partialRecovery = true;
    }
    if (!item?.position_number || seenPositions.has(item.position_number)) continue;
    seenPositions.add(item.position_number);
    items.push(item);
  }

  return { items, partialRecovery };
}

function mergeLineItemsByPosition(...groups: ApiInvoiceItem[][]): ApiInvoiceItem[] {
  const byPosition = new Map<number, ApiInvoiceItem>();
  for (const group of groups) {
    for (const item of group) {
      const position = item.position_number;
      if (position == null || position <= 0) continue;
      const existing = byPosition.get(position);
      if (!existing || (item.line_total != null && existing.line_total == null)) {
        byPosition.set(position, item);
      }
    }
  }
  return [...byPosition.values()].sort((a, b) => (a.position_number ?? 0) - (b.position_number ?? 0));
}

function countTablePositionRows(corpus: string): number {
  const headerIndices = findAllTableHeaderIndices(corpus);
  if (headerIndices.length === 0) return 0;

  const seenPositions = new Set<number>();
  for (const startIndex of headerIndices) {
    const { items } = extractItemsFromTableText(corpus.slice(startIndex));
    for (const item of items) {
      if (item.position_number != null) seenPositions.add(item.position_number);
    }
  }
  return seenPositions.size;
}

function parserItemsAreStructured(invoice: NormalizedInvoice): boolean {
  const items = invoice.items ?? [];
  if (items.length < 2) return false;
  const withDescription = items.filter((item) => item.description?.trim()).length;
  const withHs = items.filter((item) => item.hs_code?.trim()).length;
  return withDescription >= items.length * 0.8 && withHs >= items.length * 0.5;
}

/** True when OCR table has more position rows than the parser returned. */
export function shouldRecoverLineItemsFromTable(
  invoice: NormalizedInvoice,
  corpus: string
): boolean {
  const currentCount = invoice.items?.length ?? 0;
  if (currentCount === 0) return true;

  const recovered = extractEnglishLineItemsWithDiagnostics(corpus).items;
  const structuredParser = parserItemsAreStructured(invoice);

  if (structuredParser && recovered.length <= currentCount) {
    return false;
  }

  const tableRows = countTablePositionRows(corpus);
  if (tableRows >= 2 && tableRows > currentCount) return true;

  if (recovered.length >= 2 && recovered.length > currentCount) return true;

  const parserPositions = new Set(
    (invoice.items ?? [])
      .map((item) => item.position_number)
      .filter((pos): pos is number => typeof pos === "number" && pos > 0)
  );

  if (parserPositions.size === 0 && structuredParser) {
    return false;
  }

  const recoveredPositions = recovered
    .map((item) => item.position_number)
    .filter((pos): pos is number => typeof pos === "number" && pos > 0);

  if (
    recoveredPositions.length >= 2 &&
    recoveredPositions.some((pos) => !parserPositions.has(pos))
  ) {
    return true;
  }

  return false;
}

function parseLineRow(line: string): ApiInvoiceItem | null {
  const withBarcode = parseBarcodeTableRow(line);
  if (withBarcode) return withBarcode;

  const structured = line.match(LINE_ROW_RE);
  if (structured) {
    const position = parseInt(structured[1], 10);
    const quantity = parseQuantity(structured[3]);
    const lineTotal = parseMoney(structured[6] ?? structured[5]);
    const unitPrice = parseMoney(structured[5]);
    return {
      position_number: position,
      description: structured[2].trim(),
      quantity,
      unit_price: unitPrice ?? undefined,
      line_total: lineTotal ?? structured[6] ?? structured[5],
    };
  }

  const simple = line.match(LINE_ROW_SIMPLE_RE);
  if (simple) {
    const position = parseInt(simple[1], 10);
    const lineTotal = parseMoney(simple[3]);
    if (lineTotal == null) return null;
    return {
      position_number: position,
      description: simple[2].trim(),
      quantity: 1,
      line_total: lineTotal,
    };
  }

  return null;
}

/** Fallback: numbered rows with quantity + amount columns without Pos header. */
export function reconstructLineItemsFromNumberedRows(corpus: string): ApiInvoiceItem[] {
  const items: ApiInvoiceItem[] = [];
  const seenPositions = new Set<number>();

  const rowPatterns = [
    new RegExp(
      `^(\\d{1,3})\\s+(.+?)\\s+(${QUANTITY_CAPTURE})\\s+(?:pcs|pc|st|kg|m|l|eur)?\\s*([\\d.,]+)\\s+([\\d.,]+)$`,
      "i"
    ),
    new RegExp(
      `^(\\d{1,3})\\s+(.+?)\\s+(${QUANTITY_CAPTURE})\\s+([A-Za-z]{1,4})\\s+([\\d.,]+)\\s+([\\d.,]+)$`
    ),
    new RegExp(`^(\\d{1,3})\\s+(.+?)\\s+([\\d.,]+)\\s*$`),
  ];

  for (const raw of corpus.split(/\n/)) {
    const line = raw.trim();
    if (!line || !/^\d{1,3}\s+/.test(line)) continue;
    if (/^(?:Total|Subtotal|VAT|Amount|Payment|Due|QR|Scan)/i.test(line)) continue;

    let item: ApiInvoiceItem | null = parseLineRow(line);

    if (!item) {
      item = parsePartialLineRow(line);
    }

    if (!item) {
      for (const re of rowPatterns) {
        const match = line.match(re);
        if (!match) continue;
        const position = parseInt(match[1], 10);
        const lineTotal = parseMoney(match[match.length - 1]);
        if (lineTotal == null) continue;
        item = {
          position_number: position,
          description: match[2].trim(),
          quantity: match[3] ? parseQuantity(match[3]) : 1,
          line_total: lineTotal,
        };
        break;
      }
    }

    if (!item?.position_number || seenPositions.has(item.position_number)) continue;
    seenPositions.add(item.position_number);
    items.push(item);
  }

  return items.sort((a, b) => (a.position_number ?? 0) - (b.position_number ?? 0));
}

export function extractEnglishLineItemsWithDiagnostics(corpus: string): LineItemExtractionResult {
  const headerIndices = findAllTableHeaderIndices(corpus);
  const tableGroups: ApiInvoiceItem[][] = [];
  let partialRecovery = false;

  for (const startIndex of headerIndices) {
    const section = extractItemsFromTableText(corpus.slice(startIndex));
    if (section.items.length > 0) {
      tableGroups.push(section.items);
      if (section.partialRecovery) partialRecovery = true;
    }
  }

  const tableItems = mergeLineItemsByPosition(...tableGroups);
  const numberedItems = reconstructLineItemsFromNumberedRows(corpus);
  const items = mergeLineItemsByPosition(tableItems, numberedItems);

  if (items.length > tableItems.length && tableItems.length > 0) {
    partialRecovery = true;
  } else if (items.length > 0 && tableItems.length === 0 && numberedItems.length > 0) {
    partialRecovery = true;
  }

  if (items.length > 0) {
    const { items: normalized, quantityWarning } = applyQuantityNormalization(items);
    return { items: normalized, partialRecovery, quantityWarning };
  }

  const { items: normalized, quantityWarning } = applyQuantityNormalization(numberedItems);
  return {
    items: normalized,
    partialRecovery: numberedItems.length > 0,
    quantityWarning,
  };
}

export function extractEnglishLineItems(corpus: string): ApiInvoiceItem[] {
  return extractEnglishLineItemsWithDiagnostics(corpus).items;
}

export function enrichEnglishInvoiceFieldsFromOcr(invoice: NormalizedInvoice): NormalizedInvoice {
  const corpus = invoice.ocr_text?.trim() ?? "";
  if (!corpus) return invoice;

  let enriched: NormalizedInvoice = { ...invoice };

  if (!enriched.invoice_number?.trim()) {
    const invoiceNumber = extractEnglishInvoiceNumber(corpus);
    if (invoiceNumber) {
      enriched = { ...enriched, invoice_number: invoiceNumber };
      enriched = appendProvenance(enriched, {
        field: "invoice_number",
        value: invoiceNumber,
        source: "ocr_fallback",
      });
    }
  }

  if (!enriched.invoice_date?.trim()) {
    const invoiceDate = extractEnglishInvoiceDate(corpus);
    if (invoiceDate) {
      enriched = { ...enriched, invoice_date: invoiceDate };
      enriched = appendProvenance(enriched, {
        field: "invoice_date",
        value: invoiceDate,
        source: "ocr_fallback",
      });
    }
  }

  if (!enriched.exporter?.trim()) {
    const exporter = extractEnglishExporter(corpus);
    if (exporter) {
      enriched = { ...enriched, exporter };
      enriched = appendProvenance(enriched, {
        field: "exporter",
        value: exporter.slice(0, 80),
        source: "ocr_fallback",
      });
    }
  }

  const consigneeInvalid = isRejectedConsigneeText(enriched.consignee);
  if (!enriched.consignee?.trim() || consigneeInvalid) {
    const consignee = extractEnglishConsignee(corpus);
    if (consignee && isValidConsigneeText(consignee)) {
      enriched = recordParserRecovery(enriched, {
        field: "consignee",
        original_value: serializeRecoveryValue(enriched.consignee),
        recovered_value: consignee.slice(0, 120),
        recovery_source: "OCR_CONSIGNEE_RECOVERY",
      });
      enriched = { ...enriched, consignee };
      enriched = appendProvenance(enriched, {
        field: "consignee",
        value: consignee.slice(0, 120),
        source: "ocr_fallback",
      });
    } else if (consigneeInvalid) {
      enriched = { ...enriched, consignee: null };
    }
  }

  if (shouldRecoverLineItemsFromTable(enriched, corpus)) {
    const { items, partialRecovery, quantityWarning } =
      extractEnglishLineItemsWithDiagnostics(corpus);
    if (items.length > 0) {
      const previousCount = enriched.items?.length ?? 0;
      enriched = recordParserRecovery(enriched, {
        field: "line_items",
        original_value: String(previousCount),
        recovered_value: String(items.length),
        recovery_source: "TABLE_RECONSTRUCTION",
      });
      enriched = {
        ...enriched,
        items,
        document_flags: {
          ...enriched.document_flags,
          line_items_recovered: true,
          ...(partialRecovery ? { line_items_partial_recovery: true } : {}),
          ...(quantityWarning ? { [QUANTITY_PARSING_WARNING]: true } : {}),
        },
      };
      enriched = appendProvenance(enriched, {
        field: "items",
        value: `${items.length} lines`,
        source: "ocr_fallback",
      });
    }
  }

  const currentTotal = parseLocaleNumber(
    enriched.total_value_numeric ?? enriched.total_value
  );
  const totalAbsent =
    enriched.total_value_numeric == null &&
    !String(enriched.total_value ?? "").trim() &&
    !enriched.amount_eur;
  const needsTotalRecovery =
    totalAbsent ||
    isParserVatRateAsTotal(currentTotal, corpus) ||
    isPreDiscountInvoiceAmount(currentTotal, corpus) ||
    (() => {
      const labeled = extractLabeledInvoiceTotal(corpus);
      return labeled != null && labeled > currentTotal * 1.5;
    })() ||
    (() => {
      const vatFinal = extractVatInclusiveInvoiceTotal(corpus);
      return (
        vatFinal != null &&
        Math.abs(currentTotal - vatFinal) / vatFinal > 0.005 &&
        currentTotal > vatFinal
      );
    })() ||
    isTruncatedThousandsFragment(
      currentTotal,
      extractLabeledInvoiceTotal(corpus) ?? 0
    ) ||
    (currentTotal < 100 && /\b(?:Pos|Description|Barcode|Quantity)\b/i.test(corpus));

  if (needsTotalRecovery) {
    const total = extractEnglishInvoiceTotal(corpus);
    if (total != null && total !== currentTotal) {
      const currency = extractEnglishInvoiceCurrency(corpus) ?? enriched.currency ?? "EUR";
      enriched = recordParserRecovery(enriched, {
        field: "invoice_value",
        original_value: serializeRecoveryValue(
          enriched.total_value_numeric ?? enriched.total_value ?? null
        ),
        recovered_value: String(total),
        recovery_source: "OCR_TOTAL_RECOVERY",
      });
      enriched = {
        ...enriched,
        total_value_numeric: total,
        total_value: total.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        amount_eur: total,
        currency,
      };
      enriched = appendProvenance(enriched, {
        field: "total_value",
        value: String(total),
        source: "ocr_fallback",
      });
    }
  }

  if (!enriched.country?.trim() && !enriched.country_code?.trim()) {
    const recipientBlock = extractBlockAfterLabel(corpus, /Recipient\s*:?\s*/i, 10, "address").join("\n");
    const countryCorpus = `${recipientBlock}\n${corpus}`;
    if (/\bSrbija\b|\bSerbia\b/i.test(countryCorpus)) {
      enriched = recordParserRecovery(enriched, {
        field: "destination_country",
        original_value: serializeRecoveryValue(enriched.country_code ?? enriched.country),
        recovered_value: "RS",
        recovery_source: "OCR_DESTINATION_RECOVERY",
      });
      enriched = { ...enriched, country: "Serbia", country_code: "RS" };
    } else if (/\bBosnia\b|\bHerzegovina\b/i.test(countryCorpus)) {
      enriched = recordParserRecovery(enriched, {
        field: "destination_country",
        original_value: serializeRecoveryValue(enriched.country_code ?? enriched.country),
        recovered_value: "BA",
        recovery_source: "OCR_DESTINATION_RECOVERY",
      });
      enriched = { ...enriched, country: "Bosnia and Herzegovina", country_code: "BA" };
    }
  }

  return enriched;
}

export function hasEnglishInvoiceRecoverySignals(invoice: NormalizedInvoice): boolean {
  return (invoice.extraction_provenance ?? []).some((entry) => entry.source === "ocr_fallback");
}
