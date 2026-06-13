/**
 * Forensic text encoding — A0054/2026
 * Run: npm run test:text-encoding-a0054-2026
 */
import fs from "fs";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  diagnosePdfTextRepair,
  diagnoseTextEncoding,
  repairPdfExtractedText,
} from "../src/lib/export-auditor/balkan-pdf-text-repair";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF = "C:\\CURSOR\\export-auditor\\test_invoice_v1\\A0054-2026(1).pdf";
const API = (
  process.env.EXPORT_AUDITOR_API_URL || "https://export-auditor.onrender.com"
).replace(/\/$/, "");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function printDiagnostic(d: ReturnType<typeof diagnoseTextEncoding>) {
  console.log(`\n[${d.label}] length=${d.length} controls=${d.controlCharCount}`);
  if (d.controlCodepoints.length) console.log("  control codepoints:", d.controlCodepoints.join(", "));
  console.log("  sample:", JSON.stringify(d.text.slice(0, 120)));
}

async function fetchOcr(): Promise<NormalizedInvoice> {
  const buf = fs.readFileSync(PDF);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), "A0054-2026(1).pdf");
  const res = await fetch(`${API}/export-auditor/ocr`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR ${res.status}`);
  return (await res.json()) as NormalizedInvoice;
}

async function main() {
  console.log("TEXT ENCODING FORENSIC — A0054/2026\n");

  const buf = fs.readFileSync(PDF);
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buf });
  const rawPdfText = ((await parser.getText()).text ?? "").trim();
  await parser.destroy();

  const repairDiag = diagnosePdfTextRepair(rawPdfText);
  printDiagnostic(repairDiag.raw);
  printDiagnostic(repairDiag.normalized);

  const addressLineRaw =
    rawPdfText.match(/[^\n]*put 26[^\n]*/i)?.[0] ?? "";
  const addressLineRepaired = repairPdfExtractedText(addressLineRaw);
  console.log("\nAddress line raw:       ", JSON.stringify(addressLineRaw));
  console.log("Address line repaired:  ", JSON.stringify(addressLineRepaired));

  const pdfText = await extractPdfText(buf);
  const rawOcr = await fetchOcr();

  printDiagnostic(diagnoseTextEncoding("2. OCR consignee (raw API)", rawOcr.consignee ?? ""));

  const enriched = enrichInvoiceDocument(rawOcr, pdfText);
  const report = mapAuditReportToExportReport(enriched, minimalAudit(), "A0054-2026(1).pdf");

  printDiagnostic(
    diagnoseTextEncoding("4. UI deliveryAddress.address", report.deliveryAddress.address ?? "")
  );
  console.log("\nUI deliveryAddress:", JSON.stringify(report.deliveryAddress, null, 2));
  console.log("UI consignee:", JSON.stringify(report.invoiceSummary.consignee));
  console.log("UI incoterms:", JSON.stringify(report.invoiceSummary.incoterms));

  console.log("\n=== Assertions ===");
  assert(/[\u0001-\u0003]/.test(rawPdfText), "raw PDF contains control chars (U+0001–U+0003)");
  assert(!/[\u0001-\u0003]/.test(rawOcr.consignee ?? ""), "OCR consignee has no control chars");
  assert(
    report.deliveryAddress.address?.includes("Krevački") ?? false,
    "UI address contains Krevački"
  );
  assert(
    (report.deliveryAddress.city ?? report.deliveryAddress.address ?? "").includes("Aranđelovac"),
    "UI address/city contains Aranđelovac"
  );
  assert(
    !/[\u0001-\u0003]/.test(report.deliveryAddress.address ?? ""),
    "UI address has no control chars after repair"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 55, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: true,
      required_documents: ["EUR.1"],
    },
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
