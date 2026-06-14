/**
 * Real-PDF forensic regression — DEXXON 261000177 + MAMIYE 6124746 (MAXX GROUP.pdf).
 * Run: npm run test:real-pdf-forensic-regression
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { extractHsCodes } from "../src/lib/export-auditor/invoice-fields";
import {
  HS_EXTRACTION_FAILURE,
  EXTRACTION_LINE_COUNT_MISMATCH,
  resolveIssueCode,
} from "../src/lib/export-auditor/issue-readiness";
import { validateGoldenInvoiceQuality } from "../src/lib/export-auditor/golden-validation-engine";
import { EXPLICIT_NON_PREFERENTIAL_DECLARATION } from "../src/lib/export-auditor/preferential-origin-exception-engine";
import { parseApparelStyleRows } from "../src/lib/export-auditor/line-value-recovery-engine";
import { resolveInvoiceValue, sumLineTotals } from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF_DIR =
  process.env.MIXED_EU_PDF_DIR ??
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES";

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function parsePositive(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;
  const parsed = parseLocaleNumber(String(raw).trim());
  return parsed != null && parsed > 0 ? parsed : 0;
}

async function fetchOcr(pdfPath: string): Promise<NormalizedInvoice> {
  const buf = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), path.basename(pdfPath));
  const res = await fetch(`${BASE}/export-auditor/ocr`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR ${res.status}: ${await res.text()}`);
  return (await res.json()) as NormalizedInvoice;
}

function baseAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: { destination_outside_eu: true },
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

async function runPipeline(pdfFile: string, fileName: string) {
  const pdfPath = path.join(PDF_DIR, pdfFile);
  const pdfText = await extractPdfText(fs.readFileSync(pdfPath));
  const raw = await fetchOcr(pdfPath);
  const enriched = enrichInvoiceDocument(raw, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), fileName);
  return { enriched, report, pdfText };
}

async function main() {
  console.log("REAL PDF FORENSIC REGRESSION\n");

  const dexxonPdf =
    fs.existsSync(path.join(PDF_DIR, "Invoice 261000177.pdf"))
      ? "Invoice 261000177.pdf"
      : fs.readdirSync(PDF_DIR).find((f) => /261000177/i.test(f)) ?? "Invoice 261000177.pdf";

  const dexxonPath = path.join(PDF_DIR, dexxonPdf);
  if (fs.existsSync(dexxonPath)) {
    console.log("DEXXON_261000177");
    const dexxon = await runPipeline(dexxonPdf, "261000177.pdf");
    const dexxonItems = dexxon.enriched.items ?? [];
    const dexxonHs = extractHsCodes(dexxon.enriched);

    assert(dexxonItems.length === 10, `10 positions (got ${dexxonItems.length})`);
    assert(
      dexxonItems.filter((i) => i.hs_code?.trim()).length === 10,
      "10 line HS"
    );
    assert(
      dexxonItems.filter((i) => i.country_of_origin?.trim()).length === 10,
      "10 line COO"
    );
    assert(dexxonHs.includes("85235110"), "HS 85235110 detected");
    assert(
      dexxonItems.every((i) => /CN/i.test(i.country_of_origin ?? "")),
      "all COO CN"
    );
    assert(
      !dexxon.report.issues.some((i) => resolveIssueCode(i) === HS_EXTRACTION_FAILURE),
      "no HS_EXTRACTION_FAILURE"
    );
    assert(validateGoldenInvoiceQuality(dexxon.report, dexxon.enriched).passed, "GOLDEN_PASS quality gate");
  } else {
    console.log(`DEXXON_261000177 — skipped (PDF not found at ${dexxonPath})`);
  }

  console.log("\nMAMIYE_6124746 (MAXX GROUP.pdf)");
  const mamiyePdfText = await extractPdfText(fs.readFileSync(path.join(PDF_DIR, "MAXX GROUP.pdf")));
  const pdfRowCount = parseApparelStyleRows(mamiyePdfText).length;
  const mamiye = await runPipeline("MAXX GROUP.pdf", "6124746.pdf");
  const items = mamiye.enriched.items ?? [];
  const hsDetected = extractHsCodes(mamiye.enriched);
  const prefs = mamiye.report.preferenceOrigin.lineItems;
  const grand = resolveInvoiceValue(mamiye.enriched);
  const lineSum = sumLineTotals(items) ?? 0;

  assert(items.length === pdfRowCount, `${pdfRowCount} PDF positions (got ${items.length})`);
  assert(
    items.every((i) => parsePositive(i.quantity) > 0),
    `all qty > 0 (zero: ${items.filter((i) => parsePositive(i.quantity) <= 0).map((i) => i.position_number).join(",")})`
  );
  assert(
    items.every((i) => parsePositive(i.line_total) > 0),
    `all values > 0 (zero: ${items.filter((i) => parsePositive(i.line_total) <= 0).map((i) => i.position_number).join(",")})`
  );
  assert(Math.abs(grand - lineSum) / grand <= 0.01, `line sum matches total (${lineSum.toFixed(2)} vs ${grand.toFixed(2)})`);
  assert(
    !mamiye.report.issues.some((i) => resolveIssueCode(i) === EXTRACTION_LINE_COUNT_MISMATCH),
    "no EXTRACTION_LINE_COUNT_MISMATCH"
  );

  const excluded = items.find((i) => i.description?.includes("2AA089S26JER002"));
  if (excluded) {
    const pref = prefs.find((p) => p.position_number === excluded.position_number);
    assert(pref?.preferential_origin === "NO", "2AA089S26JER002 = NO preferential");
    assert(
      pref?.preference_reason.includes(EXPLICIT_NON_PREFERENTIAL_DECLARATION) ?? false,
      "exclusion reason present"
    );
  }

  const agg610 = mamiye.report.hsAggregationReport.hsAggregation.filter((r) => r.hsCode === "61099090");
  if (agg610.length > 0) {
    assert(
      agg610.every((row) => row.countryOfOrigin.length > 0 || row.countriesOfOrigin.length > 0),
      `61099090 rows have origin (count=${agg610.length})`
    );
  }

  const cooSet = new Set(
    items.map((i) => i.country_of_origin?.trim().toUpperCase()).filter(Boolean)
  );
  assert(cooSet.size >= 2, `mixed COO preserved (got ${[...cooSet].join(",")})`);

  const golden = validateGoldenInvoiceQuality(mamiye.report, mamiye.enriched);
  assert(golden.passed, `GOLDEN_PASS (${golden.failures.map((f) => f.message).join("; ") || "ok"})`);

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
