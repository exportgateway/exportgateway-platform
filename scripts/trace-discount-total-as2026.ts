/**
 * Trace pre-discount Amount (22235) vs Total invoice amount (21790.30).
 * Run: npx tsx scripts/trace-discount-total-as2026.ts
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import { extractLabeledInvoiceTotal } from "../src/lib/export-auditor/money-token-extract";
import {
  extractInvoiceDiscountContext,
  isPreDiscountInvoiceAmount,
} from "../src/lib/export-auditor/invoice-discount-context";
import { extractEnglishInvoiceTotal } from "../src/lib/export-auditor/english-invoice-field-extractor";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/as2026-1069-ocr.json"), "utf8")
) as NormalizedInvoice;

const LIVE_PDF = fs
  .readFileSync(path.join(__dirname, "fixtures/as2026-live-pdfText.txt"), "utf8")
  .trim();

/** Production-like OCR with pre-discount Amount + Discount lines (user-reported layout). */
const DISCOUNT_OCR = [
  LIVE_PDF,
  "",
  "Amount: 22.235,00",
  "Discount: 444,70",
].join("\n");

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

function trace(label: string, corpus: string, raw: NormalizedInvoice) {
  console.log(`\n========== ${label} ==========`);
  console.log("labeled total:", extractLabeledInvoiceTotal(corpus));
  console.log("discount ctx:", extractInvoiceDiscountContext(corpus));
  console.log("isPreDiscount 22235:", isPreDiscountInvoiceAmount(22235, corpus));

  const enriched = enrichInvoiceDocument(raw, corpus);
  const report = mapAuditReportToExportReport(enriched, minimalAudit(), "AS2026-1069.pdf");

  console.log("RAW resolveInvoiceValue:", resolveInvoiceValue(raw));
  console.log("ENRICHED resolveInvoiceValue:", resolveInvoiceValue(enriched));
  console.log("ENRICHED total_value_numeric:", enriched.total_value_numeric);
  console.log("ENRICHED amount_eur:", enriched.amount_eur);
  console.log("REPORT invoiceValue:", report.invoiceSummary.invoiceValue);
  console.log(
    enriched.total_value_numeric === 21790.3 && report.invoiceSummary.invoiceValue === 21790.3
      ? "OK"
      : "FAIL"
  );
}

const parser22235 = {
  ...FIXTURE,
  ocr_text: DISCOUNT_OCR,
  total_value_numeric: 22235,
  total_value: "22.235,00",
  amount_eur: 22235,
  consignee: "QR for payment",
  items: [],
};

trace("Discount OCR + parser 22235", DISCOUNT_OCR, parser22235);

// Without Total invoice amount in corpus — only Amount/Discount/Amount to be paid
const noTotalLabel = [
  "Amount: 22.235,00",
  "Discount: 444,70",
  "Amount to be paid: 21.790,30 EUR",
].join("\n");

trace("No Total invoice amount label", noTotalLabel, {
  ...parser22235,
  ocr_text: noTotalLabel,
});

// Parser amount_eur only, minimal OCR
trace("Parser only — no discount lines in OCR", LIVE_PDF, parser22235);

console.log("\n========== FAILURE SCENARIOS ==========");

const totalAmountPreDiscount = "Amount: 22.235,00\nDiscount: 444,70\nTotal amount: 22.235,00 EUR";
console.log("Total amount (pre-discount) labeled:", extractLabeledInvoiceTotal(totalAmountPreDiscount));
console.log("Total amount resolve:", resolveInvoiceValue({ ...parser22235, ocr_text: totalAmountPreDiscount }));

const amountDiscountOnly = "Amount: 22.235,00\nDiscount: 444,70";
console.log("Amount+Discount only labeled:", extractLabeledInvoiceTotal(amountDiscountOnly));
console.log("Amount+Discount only resolve:", resolveInvoiceValue({ ...parser22235, ocr_text: amountDiscountOnly }));

const parserFieldsOnly = { ...parser22235, ocr_text: "", footer_text: "", vat_article: "", shipment_notes: "", packing_info: "" };
console.log("Empty corpus resolve:", resolveInvoiceValue(parserFieldsOnly));
