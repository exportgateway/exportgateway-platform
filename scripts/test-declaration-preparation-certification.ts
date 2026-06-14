/**
 * Declaration preparation certification — MAXX GROUP 6124746 real PDF.
 * Run: npm run test:declaration-preparation-certification
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  assertDeclarationValueFormatting,
  validateDeclarationExportCertification,
} from "../src/lib/export-auditor/declaration-preparation-certification-engine";
import {
  extractPrimaryStyleCode,
} from "../src/lib/export-auditor/preferential-origin-exception-engine";
import { buildAggregationKey } from "../src/lib/export-auditor/hs-aggregation-engine";
import {
  buildMrnExportDataset,
  generateMrnCsv,
  MRN_EXPORT_COLUMNS,
} from "../src/lib/export-auditor/mrn-export";
import { formatDeclarationNumericValue } from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF = path.join(
  process.env.MIXED_EU_PDF_DIR ??
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES",
  "MAXX GROUP.pdf"
);

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

const TARGET_HS = "61099090";
const NON_PREF_STYLE = "2AA089S26JER002";

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

async function main() {
  console.log("Declaration preparation certification — MAXX GROUP 6124746\n");

  if (!fs.existsSync(PDF)) {
    console.error(`PDF not found: ${PDF}`);
    process.exit(1);
  }

  assert(assertDeclarationValueFormatting(), "locale value formatting samples");

  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const raw = await fetchOcr(PDF);
  const enriched = enrichInvoiceDocument(
    { ...raw, ocr_metadata: { ...raw.ocr_metadata, extracted_pdf_text: pdfText } },
    pdfText
  );
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");
  const prefs = report.preferenceOrigin.lineItems;
  const items = enriched.items ?? [];

  console.log("\nNon-preferential exception (exact style only)");
  const pos1 = prefs.find((p) => p.position_number === 1);
  const pos2 = prefs.find((p) => p.position_number === 2);
  const pos6 = prefs.find((p) => p.position_number === 6);
  assert(pos1?.preferential_origin === "YES", "position 1 preferential YES");
  assert(pos2?.preferential_origin === "YES", "position 2 preferential YES");
  assert(pos6?.preferential_origin === "NO", "position 6 preferential NO");

  const pos6Item = items.find((_, i) => (items[i]?.position_number ?? i + 1) === 6);
  if (pos6Item) {
    assert(
      extractPrimaryStyleCode(pos6Item) === NON_PREF_STYLE,
      `position 6 style ${NON_PREF_STYLE}`
    );
  }

  console.log("\nAggregation HS + preferential (COO merged)");
  assert(
    buildAggregationKey({ hs_code: TARGET_HS, preferential_origin: "YES" }) === `${TARGET_HS}|YES`,
    "aggregation key is HS|PREFERENTIAL"
  );

  const agg610 = report.hsAggregationReport.hsAggregation.filter((row) => row.hsCode === TARGET_HS);
  const yes610 = agg610.filter((row) => row.preferentialOrigin === "YES");
  const no610 = agg610.filter((row) => row.preferentialOrigin === "NO");
  assert(yes610.length >= 1, "61099090 YES aggregated row");
  assert(no610.length >= 1, "61099090 NO separate row");
  assert(
    !yes610.some((row) => no610.some((other) =>
      row.sourcePositions.some((pos) => other.sourcePositions.includes(pos))
    )),
    "61099090 YES/NO rows do not share positions"
  );

  const noRow = no610.find((row) => row.sourcePositions.includes(6));
  assert(noRow != null, "position 6 in NO bucket only");
  if (noRow) {
    assert(
      noRow.sourcePositions.length === 1 && noRow.sourcePositions[0] === 6,
      "position 6 isolated in NO bucket"
    );
    assert(noRow.countriesOfOrigin.includes("PT"), "NO bucket includes PT");
  }

  const yesRow = yes610.find((row) => row.countriesOfOrigin.includes("PT"));
  if (yesRow) {
    assert(!yesRow.sourcePositions.includes(6), "YES bucket excludes position 6");
  }

  console.log("\nExport structure");
  const dataset = buildMrnExportDataset(report);
  assert(dataset != null, "export dataset built");
  assert(MRN_EXPORT_COLUMNS.length === 10, "ten export columns");
  assert(MRN_EXPORT_COLUMNS.includes("Unit Of Measure"), "UOM column");
  assert(MRN_EXPORT_COLUMNS.includes("Net Weight (KG)"), "net weight column");

  if (dataset) {
    for (const row of dataset.rows) {
      assert(!/\bEUR\b|€/.test(row.valueFormatted), `value numeric only (${row.hsCode})`);
      assert(Boolean(row.currency), `currency populated (${row.hsCode})`);
      assert(Boolean(row.unitOfMeasure), `UOM populated (${row.hsCode})`);
    }
    assert(formatDeclarationNumericValue(620.8) === "620,80", "620,80 format");
    assert(formatDeclarationNumericValue(1171.2) === "1.171,20", "1.171,20 format");
    assert(formatDeclarationNumericValue(13872.8) === "13.872,80", "13.872,80 format");
  }

  const csv = generateMrnCsv(report);
  assert(csv.includes(MRN_EXPORT_COLUMNS.join(";")), "CSV header matches spec");

  console.log("\nCertification gate");
  const cert = validateDeclarationExportCertification(report, enriched);
  assert(cert.passed, `declaration export certification (${cert.failures.length} failures)`);
  if (!cert.passed) {
    for (const failure of cert.failures.slice(0, 5)) {
      console.log(`    - ${failure.message}`);
    }
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
