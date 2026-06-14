/**
 * Full OCR corpus for invoice total resolution — mirrors document-enrichment sources.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";

/** All text sources used to recover invoice totals (labels, VAT block, cached PDF text). */
export function buildInvoiceTextCorpus(invoice: NormalizedInvoice): string {
  const cachedPdfText =
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text
      : null;

  const parts: string[] = [];

  const ocrText = invoice.ocr_text?.trim() ?? "";
  if (ocrText) parts.push(ocrText);
  if (cachedPdfText?.trim()) {
    const pdfSnippet = cachedPdfText.trim().slice(0, Math.min(400, cachedPdfText.trim().length));
    if (!ocrText.includes(pdfSnippet)) {
      parts.push(cachedPdfText.trim());
    }
  }

  const keys = [
    "footer_text",
    "vat_article",
    "shipment_notes",
    "packing_info",
    "origin_declaration_text",
    "exporter",
    "consignee",
    "incoterms",
  ] as const;

  for (const key of keys) {
    const value = invoice[key];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }

  return parts.join("\n");
}
