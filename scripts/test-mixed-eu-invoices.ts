/**
 * Golden regression suite — MIXED EU invoice layouts (DEXXON, MAMIYE, RCR, …).
 * Run: npm run test:mixed-eu-invoices
 *
 * Optional live PDFs: C:\CURSOR\export-auditor\test_invoice_v1\Invoice_pfd_report\MIXED_EU_INVOICES
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { extractHsCodes } from "../src/lib/export-auditor/invoice-fields";
import { extractGenericHsCodes } from "../src/lib/export-auditor/hs-code-extraction-engine";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import { TOTAL_MISMATCH } from "../src/lib/export-auditor/invoice-total-consistency-validator";
import { EXTRACTION_LINE_COUNT_MISMATCH } from "../src/lib/export-auditor/extraction-integrity-validator";
import { resolveIssueCode } from "../src/lib/export-auditor/issue-readiness";
import type {
  AuditReportResponse,
  DispositionResponse,
  NormalizedInvoice,
} from "../src/lib/export-auditor/api-types";

const FIXTURE_DIR = path.join(__dirname, "fixtures", "mixed-eu-invoices");
const EXTERNAL_PDF_DIR =
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function baseAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 75, status: "WARNING", warnings: [], errors: [] },
    preference_origin: { destination_outside_eu: true },
    issues: [],
    recommended_actions: [],
    summary: "Review required.",
  };
}

interface FixtureExpect {
  hsCodesMin?: number;
  hsOnLinesMin?: number;
  aggregationMin?: number;
  traceabilityMin?: number;
  originOnLinesMin?: number;
  totalMismatch?: boolean;
  customsBlocked?: boolean;
  preferentialOrigin?: boolean;
  shipmentFields?: {
    grossWeight?: boolean;
    netWeight?: boolean;
    packageCount?: boolean;
  };
  noLineCountMismatch?: boolean;
}

interface InvoiceFixture {
  id: string;
  invoice: NormalizedInvoice;
  disposition?: DispositionResponse;
  expect: FixtureExpect;
}

function runFixture(fixture: InvoiceFixture) {
  console.log(`\n${fixture.id}`);
  const enriched = enrichInvoiceDocument(fixture.invoice);
  const report = mapAuditReportToExportReport(
    enriched,
    baseAudit(),
    `${fixture.id}.pdf`,
    { disposition: fixture.disposition }
  );

  const hsCodes = extractHsCodes(enriched);
  const corpusHs = extractGenericHsCodes(enriched.ocr_text ?? "");
  const hsOnLines = (enriched.items ?? []).filter((item) => item.hs_code?.trim()).length;
  const cooOnLines = (enriched.items ?? []).filter((item) => item.country_of_origin?.trim()).length;
  const aggregationRows = report.hsAggregationReport.hsAggregation.length;
  const traceabilityRows = report.hsAggregationReport.traceabilityLines.length;
  const hasTotalMismatch = report.issues.some((issue) => resolveIssueCode(issue) === TOTAL_MISMATCH);
  const hasLineCountMismatch = report.issues.some(
    (issue) => resolveIssueCode(issue) === EXTRACTION_LINE_COUNT_MISMATCH
  );
  const readiness = evaluateCustomsReadiness(report, enriched);
  const expectNoLineCountMismatch = fixture.expect.noLineCountMismatch ?? true;

  if (fixture.expect.hsCodesMin != null) {
    assert(hsCodes.length >= fixture.expect.hsCodesMin, `HS codes detected >= ${fixture.expect.hsCodesMin} (got ${hsCodes.length}, corpus=${corpusHs.length})`);
  }
  if (fixture.expect.hsOnLinesMin != null) {
    assert(hsOnLines >= fixture.expect.hsOnLinesMin, `line HS backfill >= ${fixture.expect.hsOnLinesMin} (got ${hsOnLines})`);
  }
  if (fixture.expect.aggregationMin != null) {
    assert(aggregationRows >= fixture.expect.aggregationMin, `HS aggregation rows >= ${fixture.expect.aggregationMin} (got ${aggregationRows})`);
  }
  if (fixture.expect.traceabilityMin != null) {
    assert(traceabilityRows >= fixture.expect.traceabilityMin, `traceability rows >= ${fixture.expect.traceabilityMin} (got ${traceabilityRows})`);
  }
  if (fixture.expect.originOnLinesMin != null) {
    assert(cooOnLines >= fixture.expect.originOnLinesMin, `origin on lines >= ${fixture.expect.originOnLinesMin} (got ${cooOnLines})`);
  }
  if (fixture.expect.totalMismatch != null) {
    assert(hasTotalMismatch === fixture.expect.totalMismatch, `TOTAL_MISMATCH=${fixture.expect.totalMismatch} (got ${hasTotalMismatch})`);
  }
  if (fixture.expect.customsBlocked != null) {
    assert(
      (readiness.status === "CUSTOMS_BLOCKED") === fixture.expect.customsBlocked,
      `customsBlocked=${fixture.expect.customsBlocked} (status=${readiness.status})`
    );
  }
  if (expectNoLineCountMismatch) {
    assert(
      !hasLineCountMismatch,
      `EXTRACTION_LINE_COUNT_MISMATCH absent (got ${hasLineCountMismatch})`
    );
  }
  if (fixture.expect.preferentialOrigin != null) {
    const originDetected =
      Boolean(fixture.invoice.origin_declaration_text?.trim()) &&
      (report.preferenceOrigin?.originDeclarationFound === true ||
        Boolean(enriched.origin_declaration_text?.trim()));
    assert(
      originDetected === fixture.expect.preferentialOrigin,
      `preferentialOrigin=${fixture.expect.preferentialOrigin} (declarationFound=${report.preferenceOrigin?.originDeclarationFound})`
    );
  }
  if (fixture.expect.shipmentFields?.grossWeight) {
    assert(
      report.shipmentSummary.grossWeightTotal != null,
      `gross weight extracted (got ${report.shipmentSummary.grossWeightTotal})`
    );
  }
  if (fixture.expect.shipmentFields?.netWeight) {
    assert(
      report.shipmentSummary.netWeightTotal != null,
      `net weight extracted (got ${report.shipmentSummary.netWeightTotal})`
    );
  }
  if (fixture.expect.shipmentFields?.packageCount) {
    assert(
      report.shipmentSummary.packageCount != null,
      `package count extracted (got ${report.shipmentSummary.packageCount})`
    );
  }
}

console.log("Mixed EU invoice golden suite");

const fixtureFiles = fs.readdirSync(FIXTURE_DIR).filter((file) => file.endsWith(".json"));
for (const file of fixtureFiles) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8")) as InvoiceFixture;
  runFixture(fixture);
}

console.log("\nHS extraction engine — format coverage");
const formatCorpus = [
  "85235110",
  "8523.51.10",
  "8523 51 10",
  "HS Code 85235110",
  "Customs Tariff 85235110",
  "Commodity code 85235110",
  "Nomenclature 85235110",
  "Tariff 85235110",
].join("\n");
const formatCodes = extractGenericHsCodes(formatCorpus);
assert(formatCodes.includes("85235110"), "all HS label formats normalize to 85235110");

console.log("\nCOO extraction — labeled formats");
const cooEnriched = enrichInvoiceDocument({
  invoice_number: "COO-FMT",
  country_code: "RS",
  items: [
    { position_number: 1, description: "Goods", quantity: 1, line_total: 10 },
    { position_number: 2, description: "Other", quantity: 1, line_total: 20 },
  ],
  ocr_text: "1 Goods 85235110 Origin - China qty 1\n2 Other 94036090 Made in Italy qty 1",
} as NormalizedInvoice);
const cooLine1 = cooEnriched.items?.[0]?.country_of_origin?.toUpperCase();
const cooLine2 = cooEnriched.items?.[1]?.country_of_origin?.toUpperCase();
assert(cooLine1 === "CN", `Origin - China → CN (got ${cooLine1})`);
assert(cooLine2 === "IT", `Made in Italy → IT (got ${cooLine2})`);

if (fs.existsSync(EXTERNAL_PDF_DIR)) {
  const pdfs = fs.readdirSync(EXTERNAL_PDF_DIR).filter((file) => file.toLowerCase().endsWith(".pdf"));
  console.log(`\nExternal PDF directory found (${pdfs.length} files) — skipped live OCR (fixture-only mode)`);
} else {
  console.log("\nExternal PDF directory not found — using JSON fixtures only");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
