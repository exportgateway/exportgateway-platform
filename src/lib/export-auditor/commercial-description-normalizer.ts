/**
 * Commercial description normalization — strip injected extraction artifacts.
 */

import type { ApiInvoiceItem } from "@/lib/export-auditor/api-types";
import { extractStyleCodeFromItem } from "@/lib/export-auditor/commercial-line-deduplication";

const STYLE_CODE_RE = /\b[12][A-Z]{2}[A-Z0-9]{8,}\b/gi;
const HS_LABEL_RE = /\bHS\s*Code\s*[-–]\s*[\d.\s]+/gi;
const ORIGIN_LABEL_RE = /\bOrigin\s*[-–]\s*[A-Za-z][A-Za-z\s]{0,24}/gi;
const HS_TOKEN_RE = /\b\d{8,10}\b/g;
const LEADING_QTY_RE = /^\s*\d{1,5}\s+/;
const TRAILING_AMOUNTS_RE = /(?:\s+[\d.,]+){1,3}\s*$/;

/** Remove style codes, HS, qty, and value artifacts — keep commercial text only. */
export function normalizeCommercialDescription(raw: string, item?: ApiInvoiceItem): string {
  let text = raw.trim();
  if (!text) return "";

  const style = item ? extractStyleCodeFromItem(item) : "";
  if (style) {
    text = text.replace(new RegExp(style, "gi"), " ");
  }

  text = text
    .replace(STYLE_CODE_RE, " ")
    .replace(HS_LABEL_RE, " ")
    .replace(ORIGIN_LABEL_RE, " ")
    .replace(HS_TOKEN_RE, " ")
    .replace(LEADING_QTY_RE, "")
    .replace(TRAILING_AMOUNTS_RE, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

/** Apply normalized commercial descriptions to all line items. */
export function normalizeInvoiceCommercialDescriptions(
  items: ApiInvoiceItem[]
): ApiInvoiceItem[] {
  return items.map((item) => {
    const description = item.description?.trim();
    if (!description) return item;

    const normalized = normalizeCommercialDescription(description, item);
    if (!normalized || normalized === description) return item;

    return {
      ...item,
      description: normalized,
    };
  });
}

/** True when description still contains extraction artifacts (style, HS, qty, value). */
export function descriptionHasArtifacts(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (STYLE_CODE_RE.test(text)) return true;
  if (HS_LABEL_RE.test(text)) return true;
  if (ORIGIN_LABEL_RE.test(text)) return true;
  if (LEADING_QTY_RE.test(text)) return true;
  if (TRAILING_AMOUNTS_RE.test(text)) return true;
  if (/\b\d{8,10}\b/.test(text)) return true;
  return false;
}
