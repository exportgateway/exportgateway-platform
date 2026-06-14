/**
 * MAXX GROUP 6124746 — golden certification regression (real PDF).
 * Run: npm run test:maxx-group-real-pdf
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
  DUPLICATE_LINE_EXTRACTION,
  POSITION_QTY_MISMATCH,
  POSITION_UNIT_PRICE_MISMATCH,
  POSITION_VALUE_MISMATCH,
  POSITION_DATA_OVERWRITE_ATTEMPT,
  AGGREGATION_TRACEABILITY_FAILURE,
  resolveIssueCode,
} from "../src/lib/export-auditor/issue-readiness";
import { validateGoldenInvoiceQuality } from "../src/lib/export-auditor/golden-validation-engine";
import {
  areCommercialLinesDuplicate,
  sumExtractedUnits,
} from "../src/lib/export-auditor/commercial-line-deduplication";
import {
  parseApparelStyleRows,
} from "../src/lib/export-auditor/line-value-recovery-engine";
import { runPositionCertification } from "../src/lib/export-auditor/position-reconciliation-engine";
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

const EXPECTED_LINES = 23;
const EXPECTED_UNITS = 129;
const EXPECTED_TOTAL = 13872.8;
const EXPECTED_AUTH = "NL86525748B01";

const TARGET_ISSUES = [
  TOTAL_MISMATCH,
  EXTRACTION_LINE_COUNT_MISMATCH,
  DUPLICATE_LINE_EXTRACTION,
  MULTIPLE_HS_CANDIDATES_DETECTED,
  UNKNOWN_HS_CODE,
  POSITION_QTY_MISMATCH,
  POSITION_UNIT_PRICE_MISMATCH,
  POSITION_VALUE_MISMATCH,
  POSITION_DATA_OVERWRITE_ATTEMPT,
  AGGREGATION_TRACEABILITY_FAILURE,
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
  console.log("MAXX GROUP 6124746 — golden position certification regression\n");

  if (!fs.existsSync(PDF)) {
    console.error(`PDF not found: ${PDF}`);
    process.exit(1);
  }

  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const sourceRows = parseApparelStyleRows(pdfText);
  const raw = await fetchOcr(PDF);

  const serverInput: NormalizedInvoice = {
    ...raw,
    ocr_metadata: { ...raw.ocr_metadata, extracted_pdf_text: pdfText },
  };

  const enriched = enrichInvoiceDocument(serverInput, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");
  const positionCert = runPositionCertification(enriched, report);

  const grand = resolveInvoiceValue(enriched);
  const lineSum = sumLineTotals(enriched.items) ?? 0;
  const units = sumExtractedUnits(enriched.items);
  const items = enriched.items ?? [];
  const issueCodes = report.issues.map((i) => resolveIssueCode(i));

  console.log(`  PDF source rows: ${sourceRows.length}`);
  console.log(`  After enrichment: ${items.length} lines, ${units} units, sum=${lineSum.toFixed(2)}`);
  console.log(`  Position certification: ${positionCert.passed ? "PASS" : "FAIL"} (${positionCert.issues.length} issues)`);

  if (positionCert.issues.length > 0) {
    for (const issue of positionCert.issues.slice(0, 5)) {
      console.log(`    - ${issue.message}`);
    }
  }

  assert(sourceRows.length === EXPECTED_LINES, `${EXPECTED_LINES} source positions`);
  assert(items.length === EXPECTED_LINES, `${EXPECTED_LINES} extracted positions`);
  assert(units === EXPECTED_UNITS, `units=${EXPECTED_UNITS}`);
  assert(Math.abs(grand - EXPECTED_TOTAL) < 0.01, `invoice total=${EXPECTED_TOTAL.toFixed(2)}`);
  assert(Math.abs(lineSum - EXPECTED_TOTAL) < 0.01, `line sum=${EXPECTED_TOTAL.toFixed(2)}`);
  assert(
    report.preferenceOrigin.authorisedExporterDetected === true,
    "authorised exporter detected"
  );
  assert(
    report.preferenceOrigin.authorisedExporterNumber === EXPECTED_AUTH,
    `authorisation ${EXPECTED_AUTH}`
  );
  assert(positionCert.passed, "position-level reconciliation passed");

  for (const row of positionCert.rows) {
    assert(!row.qtyMismatch, `pos ${row.sourcePosition} qty matches source (${row.styleCode})`);
    assert(!row.unitPriceMismatch, `pos ${row.sourcePosition} unit price matches source`);
    assert(!row.valueMismatch, `pos ${row.sourcePosition} line total matches source`);
  }

  for (const code of TARGET_ISSUES) {
    const count = issueCodes.filter((c) => c === code).length;
    assert(count === 0, `${code} = 0 (got ${count})`);
  }

  const golden = validateGoldenInvoiceQuality(report, enriched);
  assert(golden.passed, `GOLDEN_PASS (${golden.failures.map((f) => f.message).join("; ") || "ok"})`);

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
