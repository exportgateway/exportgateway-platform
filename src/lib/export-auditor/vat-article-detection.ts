import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";

const VAT_EXEMPTION_PATTERNS: RegExp[] = [
  /article\s*146\s*\(\s*1\s*\)\s*\(\s*a\s*\)/i,
  /article\s*146\s*(?:\(\s*1\s*\))?/i,
  /directive\s+2006\/112/i,
  /\bvat\s+exempt(?:ion)?\b/i,
  /exempt\s+from\s+vat/i,
  /supply\s+is\s+exempt\s+from\s+vat/i,
  /52\.?\s*člen\s+zddv/i,
  /52\.?\s*clen\s+zddv/i,
  /izvoz.*(?:osvoboj|brez\s+ddv)/i,
  /osvobojeno\s+(?:od\s+)?ddv/i,
  /brez\s+ddv/i,
  /export\s+exempt/i,
  /tax\s+exempt.*export/i,
  /export.*tax\s+exempt/i,
  /mehrwertsteuer.*befrei/i,
  /umsatzsteuer.*befrei/i,
  /tva.*exonér/i,
  /exonération.*tva/i,
  /iva.*esent/i,
  /esenzione.*iva/i,
];

function collectVatCorpus(invoice: NormalizedInvoice): string {
  const parts: string[] = [];
  if (invoice.vat_article?.trim()) parts.push(invoice.vat_article.trim());
  if (invoice.ocr_text?.trim()) parts.push(invoice.ocr_text.trim());
  if (invoice.footer_text?.trim()) parts.push(invoice.footer_text.trim());
  for (const value of Object.values(invoice.document_flags ?? {})) {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }
  return parts.join("\n");
}

/** True when invoice text contains recognised export VAT exemption wording. */
export function hasVatExemptionArticle(invoice: NormalizedInvoice): boolean {
  const corpus = collectVatCorpus(invoice);
  if (!corpus.trim()) return false;
  return VAT_EXEMPTION_PATTERNS.some((re) => re.test(corpus));
}
