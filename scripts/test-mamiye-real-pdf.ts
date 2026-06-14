/**
 * MAMIYE 6124746 real-PDF golden certification — MAXX GROUP.pdf only.
 * Run: npm run test:mamiye-real-pdf
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  TOTAL_MISMATCH,
  UNKNOWN_HS_CODE,
  MULTIPLE_HS_CANDIDATES_DETECTED,
  EXTRACTION_LINE_COUNT_MISMATCH,
  resolveIssueCode,
} from "../src/lib/export-auditor/issue-readiness";
import { validateGoldenInvoiceQuality } from "../src/lib/export-auditor/golden-validation-engine";
import { parseApparelStyleRows } from "../src/lib/export-auditor/line-value-recovery-engine";
import { parseLocaleNumber, resolveInvoiceValue, sumLineTotals } from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF = path.join(
  process.env.MIXED_EU_PDF_DIR ??
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES",
  "MAXX GROUP.pdf"
);

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

const TARGET_ISSUES = [
  TOTAL_MISMATCH,
  EXTRACTION_LINE_COUNT_MISMATCH,
  MULTIPLE_HS_CANDIDATES_DETECTED,
  UNKNOWN_HS_CODE,
] as const;

let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
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

function posVal(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return parseLocaleNumber(String(v)) ?? 0;
}

async function main() {
  console.log("MAMIYE 6124746 — real PDF golden certification\n");

  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const pdfRowCount = parseApparelStyleRows(pdfText).length;
  const raw = await fetchOcr(PDF);
  const enriched = enrichInvoiceDocument(raw, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");

  const grand = resolveInvoiceValue(enriched);
  const lineSum = sumLineTotals(enriched.items) ?? 0;
  const items = enriched.items ?? [];
  const issueCodes = report.issues.map((i) => resolveIssueCode(i));

  assert(items.length === pdfRowCount, `${pdfRowCount} PDF positions (got ${items.length})`);
  assert(items.every((i) => posVal(i.quantity) > 0), "all qty > 0");
  assert(items.every((i) => posVal(i.line_total) > 0), "all values > 0");
  assert(Math.abs(grand - lineSum) / grand <= 0.01, `line sum matches grand total (${lineSum.toFixed(2)} vs ${grand.toFixed(2)})`);

  for (const code of TARGET_ISSUES) {
    const count = issueCodes.filter((c) => c === code).length;
    assert(count === 0, `${code} = 0 (got ${count})`);
  }

  const golden = validateGoldenInvoiceQuality(report, enriched);
  assert(golden.passed, `GOLDEN_PASS (${golden.failures.map((f) => f.message).join("; ") || "ok"})`);

  console.log("\nCertification table:");
  for (const code of TARGET_ISSUES) {
    console.log(`  ${code}: ${issueCodes.filter((c) => c === code).length}`);
  }
  console.log(`  GOLDEN_PASS: ${golden.passed}`);

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
