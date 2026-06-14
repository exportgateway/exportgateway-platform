/**
 * Declaration preparation export — customs declarant regression.
 * Run: npm run test:declaration-preparation
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  buildAggregationKey,
  runHsAggregationEngine,
} from "../src/lib/export-auditor/hs-aggregation-engine";
import {
  buildMrnExportDataset,
  generateMrnCsv,
  MRN_EXPORT_COLUMNS,
} from "../src/lib/export-auditor/mrn-export";
import { formatDeclarationNumericValue } from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import type { HsAggregationRow } from "../src/lib/export-auditor/types";

const PDF = path.join(
  process.env.MIXED_EU_PDF_DIR ??
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES",
  "MAXX GROUP.pdf"
);

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

const TARGET_HS = "61099090";

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

function findAggRow(
  rows: HsAggregationRow[],
  hs: string,
  pref: "YES" | "NO" | "UNKNOWN" | "NOT_DECLARED"
): HsAggregationRow | undefined {
  return rows.find((row) => row.hsCode === hs && row.preferentialOrigin === pref);
}

async function main() {
  console.log("Declaration preparation export — MAXX GROUP 6124746\n");

  if (!fs.existsSync(PDF)) {
    console.error(`PDF not found: ${PDF}`);
    process.exit(1);
  }

  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const raw = await fetchOcr(PDF);
  const enriched = enrichInvoiceDocument(
    { ...raw, ocr_metadata: { ...raw.ocr_metadata, extracted_pdf_text: pdfText } },
    pdfText
  );
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");
  const engine = runHsAggregationEngine(enriched);
  const aggRows = report.hsAggregationReport.hsAggregation;

  console.log("Aggregation key");
  assert(
    buildAggregationKey({ hs_code: TARGET_HS, preferential_origin: "YES" }) === `${TARGET_HS}|YES`,
    "aggregation key is HS|PREFERENTIAL"
  );

  const yes610 = findAggRow(aggRows, TARGET_HS, "YES");
  const no610 = findAggRow(aggRows, TARGET_HS, "NO");
  assert(yes610 != null, "61099090 YES row exists");
  assert(no610 != null, "61099090 NO separate row");

  if (yes610 && no610) {
    assert(
      !yes610.sourcePositions.some((pos) => no610.sourcePositions.includes(pos)),
      "61099090 YES/NO rows do not share source positions"
    );
  }

  const pos6Line = report.hsAggregationReport.traceabilityLines.find(
    (line) => line.positionNumber === 6
  );
  if (pos6Line) {
    assert(pos6Line.hsCode === TARGET_HS || pos6Line.finalHsCode === TARGET_HS, "position 6 HS 61099090");
    const pos6Bucket = aggRows.find((row) => row.sourcePositions.includes(6));
    assert(pos6Bucket != null, "position 6 mapped to aggregation row");
    if (pos6Bucket) {
      assert(pos6Bucket.preferentialOrigin === "NO", "position 6 preferential NO");
      assert(
        pos6Bucket.sourcePositions.length === 1 && pos6Bucket.sourcePositions[0] === 6,
        "position 6 isolated in NO bucket"
      );
    }
  }

  console.log("\nEngine buckets");
  const engine610 = engine.hs_aggregation.filter((row) => row.hs_code === TARGET_HS);
  assert(engine610.length >= 2, "engine emits separate 61099090 YES/NO buckets");

  console.log("\nExport columns and formatting");
  const dataset = buildMrnExportDataset(report);
  assert(dataset != null, "declaration export dataset built");
  assert(MRN_EXPORT_COLUMNS.includes("Unit Of Measure"), "Unit Of Measure column");
  assert(MRN_EXPORT_COLUMNS.includes("Net Weight (KG)"), "Net Weight column");

  if (dataset) {
    const exportYes = dataset.rows.find(
      (row) => row.hsCode === TARGET_HS && row.preferentialOrigin === "YES"
    );
    const exportNo = dataset.rows.find(
      (row) => row.hsCode === TARGET_HS && row.preferentialOrigin === "NO"
    );
    assert(exportYes != null && exportNo != null, "export rows split 61099090 YES/NO");
    assert(formatDeclarationNumericValue(620.8) === "620,80", "locale value 620,80");
    assert(formatDeclarationNumericValue(1171.2) === "1.171,20", "locale value 1.171,20");
    assert(formatDeclarationNumericValue(13872.8) === "13.872,80", "locale value 13.872,80");
    if (exportYes) {
      assert(!exportYes.valueFormatted.includes("EUR"), "value column has no currency text");
      assert(exportYes.currency === "EUR", "currency column EUR");
      assert(exportYes.unitOfMeasure === "PCS", "default UOM PCS");
    }
  }

  const csv = generateMrnCsv(report);
  assert(csv.includes(MRN_EXPORT_COLUMNS.join(";")), "CSV header matches declarant columns");
  assert(csv.includes("61099090"), "CSV contains 61099090");

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
