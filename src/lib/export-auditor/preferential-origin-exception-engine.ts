/**
 * Preferential origin exception engine — article/style codes explicitly listed as
 * non-preferential on the invoice override blanket preferential declarations.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import type {
  LinePreferentialOrigin,
  PreferenceSource,
} from "@/lib/export-auditor/preferential-origin-engine";

export const EXPLICIT_NON_PREFERENTIAL_DECLARATION =
  "EXPLICIT_NON_PREFERENTIAL_DECLARATION";

const SECTION_HEADERS =
  /(?:ITEMS\s+OF\s+NON\s+PREFERENTIAL\s+ORIGIN|NON\s+PREFERENTIAL\s+ITEMS|EXCLUDED\s+FROM\s+PREFERENTIAL\s+ORIGIN)\s*[:\-]?\s*/gi;

/** Apparel / supplier style codes (e.g. 2AA089S26JER002). */
const STYLE_CODE = /\b([12][A-Z]{2}[A-Z0-9]{8,})\b/i;

export interface NonPreferentialExclusion {
  styleCode: string;
  sectionText: string;
}

export interface PreferentialExceptionResult {
  exclusions: NonPreferentialExclusion[];
  exclusionCodes: Set<string>;
}

function collectCorpus(invoice: NormalizedInvoice): string {
  const parts: string[] = [buildInvoiceTextCorpus(invoice)];
  if (invoice.vat_article?.trim()) parts.push(invoice.vat_article.trim());
  if (invoice.origin_declaration_text?.trim()) parts.push(invoice.origin_declaration_text.trim());
  return parts.filter(Boolean).join("\n");
}

function extractStyleFromListLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const wholeLine = trimmed.match(/^([12][A-Z]{2}[A-Z0-9]{8,})\s*[.,;:]?\s*$/i);
  if (wholeLine?.[1]) return wholeLine[1].toUpperCase();

  const listItem = trimmed.match(/^(?:[-•*\d.)]+\s*)?([12][A-Z]{2}[A-Z0-9]{8,})\b/i);
  return listItem?.[1]?.toUpperCase() ?? null;
}

/** Parse non-preferential item sections — exact list-line style codes only. */
export function extractNonPreferentialExclusions(corpus: string): PreferentialExceptionResult {
  const exclusions: NonPreferentialExclusion[] = [];
  const exclusionCodes = new Set<string>();

  SECTION_HEADERS.lastIndex = 0;
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = SECTION_HEADERS.exec(corpus)) !== null) {
    const start = headerMatch.index + headerMatch[0].length;
    const tail = corpus.slice(start, start + 1200);
    const sectionEnd = tail.search(
      /\n\s*(?:ITEMS|NON PREFERENTIAL|EXCLUDED|PREFERENTIAL|HS\s+Code|Style\s+Description|Total\b)/i
    );
    const sectionBody = sectionEnd >= 0 ? tail.slice(0, sectionEnd) : tail.slice(0, 400);
    const sectionText = (headerMatch[0] + sectionBody).trim();

    for (const line of sectionBody.split(/\r?\n/)) {
      const styleCode = extractStyleFromListLine(line);
      if (!styleCode || exclusionCodes.has(styleCode)) continue;
      exclusionCodes.add(styleCode);
      exclusions.push({ styleCode, sectionText });
    }
  }

  return { exclusions, exclusionCodes };
}

/** Primary style code for a line — item_code first, then first description match. */
export function extractPrimaryStyleCode(item: ApiInvoiceItem): string {
  const fromCode = item.item_code?.trim();
  if (fromCode && STYLE_CODE.test(fromCode)) {
    return fromCode.toUpperCase();
  }
  const match = (item.description?.trim() ?? "").match(STYLE_CODE);
  return match?.[1]?.toUpperCase() ?? "";
}

export function extractStyleCodesFromLine(item: ApiInvoiceItem): string[] {
  const primary = extractPrimaryStyleCode(item);
  return primary ? [primary] : [];
}

/** Exact style match only — never propagate by HS, COO, description, or prefix. */
function lineMatchesExclusion(item: ApiInvoiceItem, exclusionCodes: Set<string>): string | null {
  const primary = extractPrimaryStyleCode(item);
  if (primary && exclusionCodes.has(primary)) return primary;
  return null;
}

/** Apply explicit non-preferential exclusions — highest priority over blanket declarations. */
export function applyPreferentialOriginExceptions(
  invoice: NormalizedInvoice,
  lines: LinePreferentialOrigin[]
): LinePreferentialOrigin[] {
  const corpus = collectCorpus(invoice);
  const { exclusions, exclusionCodes } = extractNonPreferentialExclusions(corpus);
  if (exclusionCodes.size === 0) return lines;

  const items = invoice.items ?? [];
  const source: PreferenceSource = "explicit_non_preferential_declaration";

  return lines.map((line, index) => {
    const item = items[index];
    if (!item) return line;

    const matched = lineMatchesExclusion(item, exclusionCodes);
    if (!matched) return line;

    const section = exclusions.find((e) => e.styleCode === matched)?.sectionText ?? "";
    return {
      ...line,
      preferential_origin: "NO",
      preference_reason: section
        ? `${EXPLICIT_NON_PREFERENTIAL_DECLARATION}: style ${matched} listed in invoice non-preferential section.`
        : `${EXPLICIT_NON_PREFERENTIAL_DECLARATION}: style ${matched} excluded from preferential origin.`,
      preference_source: source,
    };
  });
}
