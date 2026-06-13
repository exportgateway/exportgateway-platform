/**
 * Propagate preferential (*) line markers from PDF text onto OCR line items.
 * PDF product lines often use a leading asterisk; OCR JSON may omit it.
 */
import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";

const PDF_STAR_LINE = /^\*\s+/;
const PDF_STAR_ARTICLE = /^\*\s+(\d{6})\b/;
const PDF_PLAIN_LINE = /^(\d{1,3})\s+(\d{6})\b/;
/** UNIOR invoice table: Pos Code [*] Article — asterisk in article column marks preferential origin. */
const UNIOR_PRODUCT_LINE = /^(\d{1,3})\s+\d+\s+(\*\s+)?(\d{6})\b/;

export interface PdfLinePreferentialFlags {
  byPosition: Map<number, boolean>;
  starredArticles: Set<string>;
}

/** Parse PDF invoice table lines into preferential flags by 1-based position. */
export function parsePdfLinePreferentialFlags(pdfText: string): PdfLinePreferentialFlags {
  const byPosition = new Map<number, boolean>();
  const starredArticles = new Set<string>();
  let position = 0;

  for (const rawLine of pdfText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const uniorMatch = line.match(UNIOR_PRODUCT_LINE);
    if (uniorMatch) {
      const pos = parseInt(uniorMatch[1], 10);
      if (Number.isFinite(pos) && pos > 0) {
        const preferential = Boolean(uniorMatch[2]?.includes("*"));
        byPosition.set(pos, preferential);
        if (preferential && uniorMatch[3]) starredArticles.add(uniorMatch[3]);
      }
      continue;
    }

    const starMatch = line.match(PDF_STAR_ARTICLE) ?? (PDF_STAR_LINE.test(line) ? ["", ""] : null);
    if (starMatch) {
      position += 1;
      byPosition.set(position, true);
      if (starMatch[1]) starredArticles.add(starMatch[1]);
      continue;
    }

    const plainMatch = line.match(PDF_PLAIN_LINE);
    if (plainMatch && !line.startsWith("*")) {
      position += 1;
      byPosition.set(position, false);
    }
  }

  return { byPosition, starredArticles };
}

function descriptionHasAsterisk(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return false;
  return /^\*/.test(text) || /\*\s*$/.test(text) || /\(\*\)/.test(text);
}

function ensureLeadingAsterisk(description: string): string {
  const text = description.trim();
  if (/^\*/.test(text)) return text;
  return `* ${text}`;
}

function stripLeadingAsterisk(description: string): string {
  return description.replace(/^\*\s*/, "").trim();
}

/** Merge PDF (*) markers into invoice line descriptions when OCR omitted them. */
export function enrichPreferentialLineMarkersFromPdf(
  invoice: NormalizedInvoice,
  pdfText?: string | null
): NormalizedInvoice {
  const items = invoice.items;
  if (!items?.length || !pdfText?.trim()) {
    return invoice;
  }

  const { byPosition, starredArticles } = parsePdfLinePreferentialFlags(pdfText);
  if (byPosition.size === 0 && starredArticles.size === 0) {
    return invoice;
  }

  const enrichedItems: ApiInvoiceItem[] = items.map((item, index) => {
    const position = item.position_number ?? index + 1;
    const description = item.description ?? "";
    if (descriptionHasAsterisk(description)) {
      return item;
    }

    const articleMatch = description.match(/\b(\d{6})\b/);
    const article = articleMatch?.[1];
    const pdfPref = byPosition.get(position);
    const starredByArticle = article != null && starredArticles.has(article);

    if (pdfPref === true || starredByArticle) {
      return {
        ...item,
        description: ensureLeadingAsterisk(stripLeadingAsterisk(description)),
      };
    }

    if (pdfPref === false) {
      return {
        ...item,
        description: stripLeadingAsterisk(description),
      };
    }

    return item;
  });

  return { ...invoice, items: enrichedItems };
}
