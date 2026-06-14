/**
 * Real-PDF regression — DEXXON 261000177 + MAMIYE 6124746.
 * Run: npx tsx scripts/test-dexxon-mamiye-real-pdf.ts
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
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF_DIR =
  process.env.MIXED_EU_PDF_DIR ??
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES";

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
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

async function runCase(options: {
  label: string;
  pdf: string;
  fileName: string;
  minLines: number;
  minHsDetected: number;
  minLineHs: number;
  expectedHs?: string;
  minDistinctCoo?: number;
}) {
  console.log(`\n${options.label} (real PDF)`);
  const pdfPath = path.join(PDF_DIR, options.pdf);
  const pdfText = await extractPdfText(fs.readFileSync(pdfPath));
  const raw = await fetchOcr(pdfPath);
  const enriched = enrichInvoiceDocument(raw, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), options.fileName);

  const hsDetected = extractHsCodes(enriched);
  const lineHs = (enriched.items ?? []).filter((i) => i.hs_code?.trim()).length;
  const lineCount = enriched.items?.length ?? 0;
  const cooSet = new Set(
    (enriched.items ?? [])
      .map((i) => i.country_of_origin?.trim().toUpperCase())
      .filter(Boolean)
  );

  assert(lineCount >= options.minLines, `line items >= ${options.minLines} (got ${lineCount})`);
  assert(lineHs >= options.minLineHs, `line HS >= ${options.minLineHs} (got ${lineHs})`);
  assert(
    hsDetected.length >= options.minHsDetected,
    `HS detected >= ${options.minHsDetected} (got ${hsDetected.length}: ${hsDetected.join(", ")})`
  );
  if (options.expectedHs) {
    assert(hsDetected.includes(options.expectedHs), `${options.expectedHs} in detected HS`);
    assert(
      (enriched.items ?? []).every((i) => i.hs_code?.trim() === options.expectedHs),
      `all lines HS=${options.expectedHs}`
    );
  }
  if (options.minDistinctCoo != null) {
    assert(cooSet.size >= options.minDistinctCoo, `distinct COO >= ${options.minDistinctCoo} (got ${[...cooSet].join(",")})`);
  }
  assert(
    !report.issues.some((i) => resolveIssueCode(i) === HS_EXTRACTION_FAILURE),
    "no HS_EXTRACTION_FAILURE"
  );
  assert(
    !report.issues.some((i) => resolveIssueCode(i) === EXTRACTION_LINE_COUNT_MISMATCH),
    "no EXTRACTION_LINE_COUNT_MISMATCH"
  );
  assert(report.hsAggregationReport.hsAggregation.length >= 1, "HS aggregation populated");
}

async function main() {
  const dexxonPath = path.join(PDF_DIR, "Invoice 261000177.pdf");
  if (fs.existsSync(dexxonPath)) {
    await runCase({
      label: "DEXXON_261000177",
      pdf: "Invoice 261000177.pdf",
      fileName: "261000177.pdf",
      minLines: 10,
      minHsDetected: 1,
      minLineHs: 10,
      expectedHs: "85235110",
    });
  } else {
    console.log(`DEXXON_261000177 — skipped (PDF not found at ${dexxonPath})`);
  }

  await runCase({
    label: "MAMIYE_6124746",
    pdf: "MAXX GROUP.pdf",
    fileName: "6124746.pdf",
    minLines: 20,
    minHsDetected: 5,
    minLineHs: 20,
    minDistinctCoo: 2,
  });

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
