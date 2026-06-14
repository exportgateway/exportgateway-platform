/**
 * Full localhost pipeline trace — calls live OCR API + mirrors runFullExportAuditAction.
 * Run: npx tsx scripts/trace-localhost-as2026-live.ts
 */

import fs from "fs";
import path from "path";
import { extractPdfText, extractPdfPageCount } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import { extractLabeledInvoiceTotal } from "../src/lib/export-auditor/money-token-extract";
import {
  extractInvoiceDiscountContext,
  isPreDiscountInvoiceAmount,
} from "../src/lib/export-auditor/invoice-discount-context";
import { attachRawOcrShipmentMetadata } from "../src/lib/export-auditor/shipment-extraction-diagnostics";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF = path.join(process.cwd(), "golden-invoices/as2026-1069/invoice.pdf");
const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

function audit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

function printTotals(label: string, invoice: NormalizedInvoice, corpus: string) {
  console.log(`\n--- ${label} ---`);
  console.log("  total_value_numeric:", invoice.total_value_numeric);
  console.log("  total_value:", invoice.total_value);
  console.log("  amount_eur:", (invoice as NormalizedInvoice & { amount_eur?: unknown }).amount_eur);
  console.log("  resolveInvoiceValue:", resolveInvoiceValue(invoice));
  console.log("  labeled total:", extractLabeledInvoiceTotal(corpus));
  console.log("  discount ctx:", extractInvoiceDiscountContext(corpus));
  console.log(
    "  isPreDiscount(parser total):",
    isPreDiscountInvoiceAmount(
      parseFloat(String(invoice.total_value_numeric ?? 0)),
      corpus
    )
  );
  console.log("  corpus len:", corpus.length);
  const totalsLines = corpus
    .split("\n")
    .filter((l) => /amount|discount|total|znesek|popust|skupaj/i.test(l))
    .slice(0, 20);
  console.log("  totals lines:", totalsLines.map((l) => l.trim()).join(" | "));
}

async function main() {
  console.log("=== Localhost live trace AS2026-1069 ===");
  console.log("OCR API:", BASE);
  console.log("PDF:", PDF);
  console.log("Fix present:", typeof isPreDiscountInvoiceAmount === "function");

  const buf = fs.readFileSync(PDF);
  const pdfText = await extractPdfText(buf);
  const pageCount = await extractPdfPageCount(buf, "AS2026-1069.pdf");

  console.log("\npdfText length:", pdfText.length);
  console.log("pdfText has Total invoice amount:", /Total invoice amount/i.test(pdfText));
  console.log("pdfText has Discount:", /\bDiscount\b/i.test(pdfText));
  console.log("pdfText has Amount:", /\bAmount\b/i.test(pdfText));

  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), "AS2026-1069.pdf");

  const res = await fetch(`${BASE}/export-auditor/ocr`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    console.error("OCR API failed:", res.status, await res.text());
    process.exit(1);
  }

  const rawInvoice = (await res.json()) as NormalizedInvoice;

  // Save capture for debugging
  const captureDir = path.join(process.cwd(), "scripts/fixtures/as2026-live-capture");
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(path.join(captureDir, "raw-ocr.json"), JSON.stringify(rawInvoice, null, 2));
  fs.writeFileSync(path.join(captureDir, "pdfText.txt"), pdfText);

  printTotals("RAW from OCR API", rawInvoice, rawInvoice.ocr_text ?? "");

  // Mirror postExportAuditorOcrAction
  const afterOcr = enrichInvoiceDocument(
    attachRawOcrShipmentMetadata(
      {
        ...rawInvoice,
        ocr_metadata: {
          ...rawInvoice.ocr_metadata,
          page_count: pageCount,
          extracted_pdf_text: pdfText || undefined,
        },
      },
      pdfText.length
    ),
    pdfText
  );

  const ocrCorpus = afterOcr.ocr_text ?? pdfText;
  printTotals("After enrichInvoiceDocument (OCR action)", afterOcr, ocrCorpus);

  // Mirror runExportAuditAnalysisAction re-enrich with client round-trip
  const onClient = JSON.parse(JSON.stringify(afterOcr)) as NormalizedInvoice;
  const cachedPdfText =
    typeof onClient.ocr_metadata?.extracted_pdf_text === "string"
      ? onClient.ocr_metadata.extracted_pdf_text
      : null;

  const afterAnalysis = enrichInvoiceDocument(onClient, cachedPdfText);
  const analysisCorpus = afterAnalysis.ocr_text ?? cachedPdfText ?? "";
  printTotals("After analysis re-enrich", afterAnalysis, analysisCorpus);

  const report = mapAuditReportToExportReport(
    afterAnalysis,
    audit(),
    "AS2026-1069.pdf",
    { disposition: { total_items: afterAnalysis.items?.length ?? 3 } }
  );

  console.log("\n--- MAPPED REPORT ---");
  console.log("  invoiceSummary.invoiceValue:", report.invoiceSummary.invoiceValue);
  console.log(
    "  PASS:",
    Math.abs(report.invoiceSummary.invoiceValue - 21790.3) < 0.01 ? "YES (21790.30)" : "NO"
  );

  process.exit(Math.abs(report.invoiceSummary.invoiceValue - 21790.3) < 0.01 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
