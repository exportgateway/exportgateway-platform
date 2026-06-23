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

const INVOICE_NUMBER_REJECT_RE =
  /\b(?:customer\s+order|order\s+number|reference\s+number|shipment\s+number|sales\s+shipment|your\s+reference|customer\s+account|invoice\s+code|product\s+code|customer\s+code|item\s+code)\b/i;

const GENERIC_CODE_TOKEN_RE = /^(?:code|product|customer|item|invoice)$/i;

const DATE_TOKEN_RE = /(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/;
const INCOTERM_CODES = ["EXW", "FCA", "DAP", "DDP", "CPT", "CIP", "FOB", "CFR", "CIF", "DPU"] as const;
const CURRENCY_CODES = ["EUR", "USD", "GBP", "CHF", "RSD", "BAM"] as const;
type HeaderField = "invoice_number" | "invoice_date" | "exporter" | "consignee" | "incoterms" | "currency";

const METADATA_NOISE_RE =
  /\b(?:payment|iban|swift|bank|footer|page\s+\d+\s+of\s+\d+|shipment\s+summary|products\s+covered\s+by\s+this|declares\s+that|customs\s+authorization)\b/i;

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

export const TABLE_RECONSTRUCTION_REJECTED = "TABLE_RECONSTRUCTION_REJECTED";
const TABLE_RECONSTRUCTION_MIN_SCORE = 70;

const TABLE_RECONSTRUCTION_REJECT_ROW_RE =
  /\b(?:rue|avenue|street|road|bp|cedex|tel|fax|phone|iban|swift|head\s+quarter|declares\s+that|exporter\s+of\s+the\s+products|products\s+covered\s+by\s+this|customs\s+authorization)\b/i;

const PRODUCT_CODE_RE =
  /\b(?:SKU|ITEM|ART|REF|PN|P\/N|MODEL|CODE|PRODUCT)\b[\s:#-]*[A-Z0-9][A-Z0-9./_-]{2,}\b/i;

const SKU_LIKE_TOKEN_RE =
  /\b[A-Z0-9]+(?:[-_/][A-Z0-9]+){1,}\b/i;

/** Reject payment QR footer text mistaken as consignee. */
export const REJECTED_CONSIGNEE_RE =
  /\b(?:qr\s*(?:for\s*)?payment|scan\s*qr|payment\s*qr|qr\s*code)\b/i;

export interface TableReconstructionQualityDecision {
  accepted: boolean;
  score: number;
  acceptance_reason: string | null;
  rejection_reason: string | null;
  rejected_row_count: number;
  missing_evidence_count: number;
}

function parseMoney(raw: string): number | null {
  const value = parseLocaleNumber(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isRejectedConsigneeText(text: string | null | undefined): boolean {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return true;
  return REJECTED_CONSIGNEE_RE.test(trimmed) || METADATA_NOISE_RE.test(trimmed);
}

export function isValidConsigneeText(text: string | null | undefined): boolean {
  return Boolean(text?.trim()) && !isRejectedConsigneeText(text);
}

function plainOcrText(corpus: string): string {
  return corpus
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:tr|table|p|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function metadataLines(corpus: string): string[] {
  return plainOcrText(corpus).split(/\n/).map((line) => line.trim());
}

function nextNonemptyLine(lines: string[], index: number): string {
  for (const candidate of lines.slice(index + 1, index + 5)) {
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function isMetadataNoise(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return !text || METADATA_NOISE_RE.test(text);
}

function isValidHeaderValue(field: HeaderField, value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text || isMetadataNoise(text)) return false;
  if (field === "invoice_number" && INVOICE_NUMBER_REJECT_RE.test(text)) return false;
  if (field === "exporter") {
    if (/^\d{4,6}\b/.test(text)) return false;
    if (/^[A-Z]{1,6}\d{4,}[A-Z0-9./-]*$/i.test(text)) return false;
    if (/^(?:price|amount|quantity|description|reference|code|customs|hs|orig\.?|net\s+total|total)$/i.test(text)) return false;
    if (/\b(?:description|gross\s+unit|net\s+unit|customs\s+hs|delivered\s+quantity|ordered\s+qty|reference\s+number)\b/i.test(text)) {
      return false;
    }
    if (/\b(?:capital|head\s+quarter|rue|street|avenue|vat|tva|eori|r\s*\.?\s*c\s*\.?\s*s\.?|tax\s+id|iban|swift|bank)\b/i.test(text)) {
      return false;
    }
    if (/\b(?:direction|administration|commerciale?|services?\s+financiers?|office|department|division|cedex|t[ée]l\.?|fax|bp\s+\d+)\b/i.test(text)) {
      return false;
    }
  }
  if (field === "incoterms") return INCOTERM_CODES.includes(text.split(/\s+/)[0]?.toUpperCase() as typeof INCOTERM_CODES[number]);
  if (field === "currency") return CURRENCY_CODES.includes(text.toUpperCase() as typeof CURRENCY_CODES[number]);
  return true;
}

function cleanPartyLine(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s:-]+|[\s:-]+$/g, "");
}

function normalizeCompanyName(value: string): string {
  const cleaned = cleanPartyLine(value);
  return cleaned === cleaned.toLowerCase()
    ? cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
    : cleaned;
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

function extractMetadataBlockAfterLabel(lines: string[], labelRe: RegExp, maxLines = 5): string {
  const terminator =
    /^(?:invoice|invoice\s+date|date|incoterms?|delivery\s+terms|terms\s+of\s+delivery|customer|reference|order|payment|bank|iban|swift|total|currency|table|page)\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = line.match(labelRe);
    if (!match) continue;

    const remainder = line.slice(match[0].length).replace(/^[\s:-]+/, "");
    const candidates = remainder ? [remainder] : [];
    for (const following of lines.slice(index + 1, index + 1 + maxLines)) {
      const value = following.trim();
      if (!value) {
        if (candidates.length > 0) break;
        continue;
      }
      if (terminator.test(value)) break;
      candidates.push(value);
    }

    return candidates
      .map(cleanPartyLine)
      .filter((candidate) => candidate && !isMetadataNoise(candidate))
      .join("\n")
      .trim();
  }

  return "";
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

export function extractEnglishInvoiceNumber(corpus: string): string | null {
  const lines = metadataLines(corpus);
  const tokenRe = /^[A-Z0-9][A-Z0-9./-]{2,}$/i;
  const cleanCandidate = (raw: string | null | undefined): string | null => {
    const candidates = (raw ?? "")
      .split(/\s+/)
      .map((token) => token.replace(/^[\s:#-]+|[\s:#-]+$/g, ""))
      .filter((candidate) => {
        if (!tokenRe.test(candidate)) return false;
        if (!/\d/.test(candidate)) return false;
        if (GENERIC_CODE_TOKEN_RE.test(candidate)) return false;
        if (DATE_TOKEN_RE.test(candidate)) return false;
        if (INVOICE_NUMBER_REJECT_RE.test(candidate)) return false;
        return true;
      })
      .map((candidate) => {
        let score = 0;
        if (/[A-Z]/i.test(candidate) && /\d/.test(candidate)) score += 20;
        if (/^[A-Z]/i.test(candidate)) score += 10;
        if (/^\d+$/.test(candidate)) score -= 10;
        score += Math.min(candidate.length, 12);
        return { candidate, score };
      })
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.candidate ?? null;
  };

  const explicitIdentifierRe =
    /\binvoice\s*(?:number|no\.?|#|id|nr\.?)\s*:?\s*([A-Z0-9][A-Z0-9./-]{2,})\b/i;
  for (const line of lines) {
    if (INVOICE_NUMBER_REJECT_RE.test(line) || /\binvoice\s+date\b/i.test(line)) continue;
    const candidate = cleanCandidate(line.match(explicitIdentifierRe)?.[1]);
    if (candidate) return candidate;
  }

  const invoiceValueRe = /\binvoice\s*:\s*([A-Z0-9][A-Z0-9./-]{2,})\b/i;
  for (const line of lines) {
    if (INVOICE_NUMBER_REJECT_RE.test(line) || /\binvoice\s+date\b/i.test(line)) continue;
    const candidate = cleanCandidate(line.match(invoiceValueRe)?.[1]);
    if (candidate) return candidate;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!/^\s*invoice\s*$/i.test(line)) continue;
    const candidate = cleanCandidate(lines.slice(index + 1, index + 5).join(" "));
    if (candidate) return candidate;
  }

  const invoiceDirectValueRe = /^\s*invoice\s+([A-Z0-9][A-Z0-9./-]{1,})\s*$/i;
  for (const line of lines) {
    if (INVOICE_NUMBER_REJECT_RE.test(line) || /\binvoice\s+date\b/i.test(line)) continue;
    const candidate = cleanCandidate(line.match(invoiceDirectValueRe)?.[1]);
    if (candidate) return candidate;
  }
  return null;
}

export function extractEnglishInvoiceDate(corpus: string): string | null {
  const lines = metadataLines(corpus);
  const rejectRe = /\b(?:due|payment|delivery)\s+date\b/i;
  const labelRe = /^\s*(?:invoice\s+date|issue\s+date|date)\s*:?\s*(.*)$/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (rejectRe.test(line)) continue;
    const match = line.match(labelRe);
    if (!match) continue;
    const candidate = match[1]?.trim() || nextNonemptyLine(lines, index);
    const date = candidate.match(DATE_TOKEN_RE)?.[1];
    if (date) return date;
  }
  return null;
}

export function extractEnglishInvoiceTotal(corpus: string): number | null {
  return extractLabeledInvoiceTotal(corpus);
}

/** Labeled totals in strict recovery priority (Total invoice amount → Amount to be paid → Discounted amount). */
export function extractLabeledInvoiceTotalByPriority(corpus: string): number | null {
  return extractEnglishInvoiceTotal(corpus);
}

export function extractEnglishInvoiceCurrency(corpus: string): string | null {
  const plain = plainOcrText(corpus);
  for (const line of metadataLines(plain)) {
    const match = line.match(/^\s*currency\s*:?\s*([A-Z]{3})\b/i);
    const code = match?.[1]?.toUpperCase();
    if (code && CURRENCY_CODES.includes(code as typeof CURRENCY_CODES[number])) return code;
  }
  for (const code of CURRENCY_CODES) {
    if (new RegExp(`\\b${code}\\b`, "i").test(plain)) return code;
  }
  if (/€/.test(plain)) return "EUR";
  if (/£/.test(plain)) return "GBP";
  if (/\$/.test(plain)) return "USD";
  return null;
}

export function extractEnglishIncoterms(corpus: string): string | null {
  const lines = metadataLines(corpus);
  const labelRe = /^\s*(?:incoterms?|delivery\s+terms|terms\s+of\s+delivery|pariteta)\s*:?\s*(.*)$/i;
  const codeRe = /\b(EXW|FCA|DAP|DDP|CPT|CIP|FOB|CFR|CIF|DPU)\b(?:\s+([A-Za-z0-9 .,'/-]{1,60}))?/i;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]!.match(labelRe);
    if (!match) continue;
    const candidate = match[1]?.trim() || nextNonemptyLine(lines, index);
    const codeMatch = candidate.match(codeRe);
    if (!codeMatch?.[1]) continue;
    const term = codeMatch[1].toUpperCase();
    const location = codeMatch[2]?.replace(/^[\s:-]+|[\s:-]+$/g, "") ?? "";
    return `${term} ${location}`.trim();
  }
  return null;
}

/** Consignee — prefer explicit party labels, then delivery address. */
export function extractEnglishConsignee(corpus: string): string | null {
  const lines = metadataLines(corpus);
  const buyerTradeName = (() => {
    const buyerIndex = lines.findIndex((line) => /^\s*buyer\s*:?/i.test(line));
    if (buyerIndex < 0) return null;
    for (const line of lines.slice(buyerIndex + 1, buyerIndex + 5)) {
      const candidate = cleanPartyLine(line);
      if (!candidate || isRejectedConsigneeText(candidate)) continue;
      if (/vat\s+number|invoice\s+number|recipient|date\b/i.test(candidate)) break;
      if (/d\.o\.o\.|gmbh|ltd\.?|inc\.?|s\.a\.|s\.r\.o\./i.test(candidate)) continue;
      return candidate;
    }
    return null;
  })();
  const labels = [
    /^\s*consignee\s*:?/i,
    /^\s*recipient\s*:?/i,
    /^\s*buyer\s*:?/i,
    /^\s*bill\s+to\s*:?/i,
    /^\s*delivery\s+address\s*:?/i,
    /^\s*adressee\s*:?/i,
    /^\s*addressee\s*:?/i,
  ];
  for (const label of labels) {
    const block = extractMetadataBlockAfterLabel(lines, label, 8);
    if (block && isValidConsigneeText(block)) {
      if (label.source.includes("recipient") && buyerTradeName && !block.includes(buyerTradeName)) {
        return `${buyerTradeName}\n${block}`;
      }
      return block;
    }
  }

  return null;
}

/** Exporter — company with seller VAT (often SI/DE) or Shipper/Seller block. */
export function extractEnglishExporter(corpus: string): string | null {
  const lines = metadataLines(corpus);
  const explicit = extractMetadataBlockAfterLabel(
    lines,
    /^\s*(?:shipper|seller|exporter)\s*:/i,
    6
  );
  if (explicit && !isMetadataNoise(explicit)) return explicit;

  const companyIdentityLines: string[] = [];
  for (const line of lines.slice(0, 90)) {
    if (/^(?:invoice|invoice\s+date|customer|delivery\s+address|consignee|buyer|recipient|transport|incoterms?)\b/i.test(line)) {
      break;
    }
    if (line) companyIdentityLines.push(line);
  }

  const departmentOrOfficeRe =
    /\b(?:direction|administration|commerciale?|services?\s+financiers?|office|department|division|cedex|t[ée]l\.?|fax|bp\s+\d+)\b/i;
  const addressOrTaxLineRe =
    /\b(?:capital|head\s+quarter|rue|street|avenue|vat|tva|eori|r\s*\.?\s*c\s*\.?\s*s\.?|tax\s+id|iban|swift|bank)\b/i;
  let best: { name: string; score: number } | null = null;

  for (let index = 0; index < companyIdentityLines.length; index += 1) {
    const line = companyIdentityLines[index]!;
    const cleaned = cleanPartyLine(line);
    if (!cleaned || isMetadataNoise(cleaned)) continue;
    if (departmentOrOfficeRe.test(cleaned) || addressOrTaxLineRe.test(cleaned)) continue;
    if (/^\d{4,6}\b/.test(cleaned)) continue;
    if (/^[A-Z]{1,6}\d{4,}[A-Z0-9./-]*$/i.test(cleaned)) continue;
    if (/^(?:price|amount|quantity|description|reference|code|customs|hs|orig\.?|net\s+total|total)$/i.test(cleaned)) continue;
    if (/\b(?:description|gross\s+unit|net\s+unit|customs\s+hs|delivered\s+quantity|ordered\s+qty|reference\s+number)\b/i.test(cleaned)) continue;
    if (/^(?:invoice|customer|reference|payment|total|currency|code)\b/i.test(cleaned)) continue;
    if (cleaned.length < 3 || cleaned.length > 80) continue;

    const nearby = companyIdentityLines.slice(Math.max(0, index - 2), index + 8).join("\n");
    const hasTaxEvidence = /\b(?:VAT|TVA|EORI|R\.C\.S\.|tax\s+id)\b/i.test(nearby);
    const hasCompanySuffix = /\b(?:ltd|limited|gmbh|s\.?a\.?|s\.?n\.?c\.?|d\.o\.o\.|s\.r\.o\.)\b/i.test(cleaned);
    if (!hasTaxEvidence && !hasCompanySuffix) continue;

    let score = 0;
    if (hasTaxEvidence) score += 60;
    if (hasCompanySuffix) score += 20;
    if (index < 20) score += 10;
    if (cleaned === cleaned.toLowerCase()) score += 5;

    if (!best || score > best.score) {
      best = { name: normalizeCompanyName(cleaned), score };
    }
  }

  if (best) return best.name;

  const plain = plainOcrText(corpus);
  const supplierIdentityPatterns = [
    /(?:^|\n|\b)([A-Za-z][A-Za-z .&'-]{2,60}?)\s+S\.?\s*N\.?\s*C\.?\s+au\s+capital[\s\S]{0,260}\b(?:VAT|TVA|EORI|R\s*\.?\s*C\s*\.?\s*S\.?)\b/i,
    /(?:^|\n)([A-Za-z][A-Za-z .&'-]{2,60})\s*\n[\s\S]{0,220}\b(?:VAT|TVA|EORI|R\s*\.?\s*C\s*\.?\s*S\.?)\b/i,
  ];
  for (const pattern of supplierIdentityPatterns) {
    const candidate = cleanPartyLine(plain.match(pattern)?.[1] ?? "");
    if (!candidate) continue;
    if (departmentOrOfficeRe.test(candidate) || addressOrTaxLineRe.test(candidate)) continue;
    if (/^\d{4,6}\b/.test(candidate)) continue;
    if (/^[A-Z]{1,6}\d{4,}[A-Z0-9./-]*$/i.test(candidate)) continue;
    return normalizeCompanyName(candidate);
  }

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

function itemDescription(item: ApiInvoiceItem): string {
  return [item.item_code, item.description]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function isUnsafeTableReconstructionText(text: string | null | undefined): boolean {
  return TABLE_RECONSTRUCTION_REJECT_ROW_RE.test(text?.trim() ?? "");
}

function hasCommercialEvidence(item: ApiInvoiceItem): boolean {
  const description = itemDescription(item);
  const hasHs = Boolean(item.hs_code?.trim() || item.invoice_hs_code?.trim());
  const hasCode = Boolean(
    item.item_code?.trim() ||
      PRODUCT_CODE_RE.test(description) ||
      SKU_LIKE_TOKEN_RE.test(description)
  );
  const hasQuantity = parseQuantity(item.quantity) > 0;
  const hasUnitPrice = parseMoney(String(item.unit_price ?? "")) != null;
  const hasLineTotal = parseMoney(String(item.line_total ?? "")) != null;

  return hasHs || hasCode || hasQuantity || hasUnitPrice || hasLineTotal;
}

function positionSanityReasons(items: ApiInvoiceItem[]): string[] {
  const positions = items
    .map((item) => item.position_number)
    .filter((position): position is number => typeof position === "number" && position > 0)
    .sort((a, b) => a - b);
  if (positions.length === 0) return ["no valid position numbers"];

  const reasons: string[] = [];
  const first = positions[0]!;
  if (first > 10) {
    reasons.push(`first position ${first} is greater than 10`);
  }
  if (positions.some((position) => position > 250)) {
    reasons.push("position number is implausibly high");
  }
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1]!;
    const current = positions[index]!;
    const gap = current - previous;
    if (gap > 25) {
      reasons.push(`large position gap ${previous}-${current}`);
      break;
    }
  }

  return reasons;
}

export function evaluateTableReconstructionQuality(
  items: ApiInvoiceItem[]
): TableReconstructionQualityDecision {
  const reasons: string[] = [];
  let score = 100;

  if (items.length === 0) {
    return {
      accepted: false,
      score: 0,
      acceptance_reason: null,
      rejection_reason: "no reconstructed rows",
      rejected_row_count: 0,
      missing_evidence_count: 0,
    };
  }

  const rejectedRowCount = items.filter((item) =>
    isUnsafeTableReconstructionText(itemDescription(item))
  ).length;
  if (rejectedRowCount > 0) {
    score -= 45;
    reasons.push(`${rejectedRowCount} reconstructed rows contain address/footer/legal text`);
  }

  const missingEvidenceCount = items.filter((item) => !hasCommercialEvidence(item)).length;
  if (missingEvidenceCount > 0) {
    score -= 30;
    reasons.push(`${missingEvidenceCount} reconstructed rows lack commercial evidence`);
  }

  const positionReasons = positionSanityReasons(items);
  if (positionReasons.length > 0) {
    score -= Math.min(45, positionReasons.length * 20);
    reasons.push(...positionReasons);
  }

  score = Math.max(0, Math.min(100, score));
  const accepted = reasons.length === 0 && score >= TABLE_RECONSTRUCTION_MIN_SCORE;

  return {
    accepted,
    score,
    acceptance_reason: accepted
      ? `table reconstruction accepted with score ${score}`
      : null,
    rejection_reason: accepted ? null : reasons.join("; "),
    rejected_row_count: rejectedRowCount,
    missing_evidence_count: missingEvidenceCount,
  };
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

  if (recovered.length <= currentCount) {
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
  let enriched: NormalizedInvoice = { ...invoice };

  if (!corpus) {
    const deliveryCompany = enriched.delivery_address?.company?.trim() ?? "";
    if (!isValidHeaderValue("consignee", enriched.consignee) && deliveryCompany && !isMetadataNoise(deliveryCompany)) {
      return { ...enriched, consignee: deliveryCompany };
    }
    return enriched;
  }

  const recoveredInvoiceNumber = extractEnglishInvoiceNumber(corpus);
  const existingInvoiceNumber = enriched.invoice_number?.trim() ?? "";
  const shouldReplaceInvoiceNumber =
    !isValidHeaderValue("invoice_number", existingInvoiceNumber) ||
    (recoveredInvoiceNumber !== null &&
      recoveredInvoiceNumber !== existingInvoiceNumber &&
      /^\d+$/.test(existingInvoiceNumber) &&
      /[A-Z]/i.test(recoveredInvoiceNumber));
  if (shouldReplaceInvoiceNumber) {
    const invoiceNumber = recoveredInvoiceNumber;
    if (invoiceNumber) {
      enriched = { ...enriched, invoice_number: invoiceNumber };
      enriched = appendProvenance(enriched, {
        field: "invoice_number",
        value: invoiceNumber,
        source: "ocr_fallback",
      });
    }
  }

  if (!isValidHeaderValue("invoice_date", enriched.invoice_date)) {
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

  if (!isValidHeaderValue("exporter", enriched.exporter)) {
    const exporter = extractEnglishExporter(corpus);
    if (exporter) {
      enriched = { ...enriched, exporter };
      enriched = appendProvenance(enriched, {
        field: "exporter",
        value: exporter.slice(0, 80),
        source: "ocr_fallback",
      });
    } else if (enriched.exporter && isMetadataNoise(enriched.exporter)) {
      enriched = { ...enriched, exporter: null };
    }
  }

  const consigneeInvalid = !isValidHeaderValue("consignee", enriched.consignee);
  if (consigneeInvalid) {
    const deliveryCompany = enriched.delivery_address?.company?.trim() ?? "";
    const consignee = extractEnglishConsignee(corpus) ?? (deliveryCompany && !isMetadataNoise(deliveryCompany) ? deliveryCompany : null);
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

  if (!isValidHeaderValue("incoterms", enriched.incoterms)) {
    const incoterms = extractEnglishIncoterms(corpus);
    if (incoterms) {
      enriched = { ...enriched, incoterms };
      enriched = appendProvenance(enriched, {
        field: "incoterms",
        value: incoterms,
        source: "ocr_fallback",
      });
    }
  }

  if (!isValidHeaderValue("currency", enriched.currency)) {
    const currency = extractEnglishInvoiceCurrency(corpus);
    if (currency) {
      enriched = { ...enriched, currency };
      enriched = appendProvenance(enriched, {
        field: "currency",
        value: currency,
        source: "ocr_fallback",
      });
    }
  }

  if (shouldRecoverLineItemsFromTable(enriched, corpus)) {
    const { items, partialRecovery, quantityWarning } =
      extractEnglishLineItemsWithDiagnostics(corpus);
    if (items.length > 0) {
      const previousCount = enriched.items?.length ?? 0;
      const reconstructionQuality = evaluateTableReconstructionQuality(items);
      if (!reconstructionQuality.accepted) {
        enriched = {
          ...enriched,
          items: previousCount > 0 ? enriched.items : [],
          document_flags: {
            ...enriched.document_flags,
            [TABLE_RECONSTRUCTION_REJECTED]: true,
            table_reconstruction_status: TABLE_RECONSTRUCTION_REJECTED,
            table_reconstruction_score: reconstructionQuality.score,
            ...(reconstructionQuality.rejection_reason
              ? { table_reconstruction_rejection_reason: reconstructionQuality.rejection_reason }
              : {}),
          },
        };
        enriched = appendProvenance(enriched, {
          field: "items",
          value: `rejected:${items.length} lines:score=${reconstructionQuality.score}`,
          source: "ocr_fallback",
        });
      } else {
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
            table_reconstruction_score: reconstructionQuality.score,
            ...(reconstructionQuality.acceptance_reason
              ? { table_reconstruction_acceptance_reason: reconstructionQuality.acceptance_reason }
              : {}),
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
