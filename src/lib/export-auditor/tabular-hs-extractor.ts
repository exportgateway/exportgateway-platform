import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { normalizeHsToken } from "@/lib/export-auditor/invoice-fields";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";

/** Item table row: position HS unit qty unit_price line_total — e.g. `1 731210810080 M 1225 1.17 1433.30`. */
const TABULAR_HS_ROW = /^\s*(\d{1,3})\s+(\d{8,12})\s+[A-Za-z]\s+/gm;

/** Extract unique HS/TARIC codes from tabular line-item rows in OCR text. */
export function extractTabularHsCodes(corpus: string): string[] {
  const codes = new Set<string>();
  TABULAR_HS_ROW.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TABULAR_HS_ROW.exec(corpus)) !== null) {
    const code = normalizeHsToken(match[2]);
    if (code) codes.add(code);
  }
  return [...codes].sort();
}

/** Map line position numbers to HS codes from tabular OCR rows. */
export function extractTabularHsByPosition(corpus: string): Map<number, string> {
  const map = new Map<number, string>();
  TABULAR_HS_ROW.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TABULAR_HS_ROW.exec(corpus)) !== null) {
    const position = parseInt(match[1], 10);
    const code = normalizeHsToken(match[2]);
    if (Number.isFinite(position) && code) {
      map.set(position, code);
    }
  }
  return map;
}

/** Backfill missing line-item hs_code from tabular OCR rows. */
export function enrichItemHsCodesFromOcr(invoice: NormalizedInvoice): NormalizedInvoice {
  const items = invoice.items;
  if (!items?.length) return invoice;

  const corpus = invoice.ocr_text?.trim();
  if (!corpus) return invoice;

  const positionMap = extractTabularHsByPosition(corpus);
  if (positionMap.size === 0) return invoice;

  const uniqueCodes = [...new Set(positionMap.values())];
  const singleFallback = uniqueCodes.length === 1 ? uniqueCodes[0] : null;

  let changed = false;
  const backfilledHs: string[] = [];
  const enrichedItems: ApiInvoiceItem[] = items.map((item, index) => {
    if (item.hs_code?.trim()) return item;
    const position =
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1;
    const hs = positionMap.get(position) ?? singleFallback;
    if (!hs) return item;
    changed = true;
    backfilledHs.push(hs);
    return { ...item, hs_code: hs };
  });

  if (!changed) return invoice;
  let enriched: NormalizedInvoice = { ...invoice, items: enrichedItems };
  for (const hs of backfilledHs) {
    enriched = appendProvenance(enriched, {
      field: "hs_code",
      value: hs,
      source: "ocr_fallback",
    });
  }
  return enriched;
}
