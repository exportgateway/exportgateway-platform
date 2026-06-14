/**
 * Forensic regression — invoice INV/220726
 * Run: npm run test:inv-220726
 */
import { readFileSync } from "fs";
import { join } from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import {
  evaluateInvoiceDateReadiness,
  INVOICE_DATE_IN_FUTURE,
  parseInvoiceDate,
  startOfUtcDay,
} from "../src/lib/export-auditor/invoice-date-readiness";
import { resolveDestinationCountry } from "../src/lib/export-auditor/destination-country";
import { resolveIso2CountryCode } from "../src/lib/export-auditor/country-resolution";
import {
  runHsAggregationEngine,
  isServiceOrTransportLine,
  LINE_TYPE_SERVICE,
  resolveInvoiceLineType,
} from "../src/lib/export-auditor/hs-aggregation-engine";
import {
  collectInvalidHsCodeIssues,
  collectUnknownHsCodeIssues,
} from "../src/lib/export-auditor/hs-classification-workflow";
import {
  EU_DESTINATION,
  INVALID_HS_FORMAT,
  resolveIssueCode,
  UNKNOWN_HS_CODE,
} from "../src/lib/export-auditor/issue-readiness";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const FIXTURE_DIR = join(process.cwd(), "golden-invoices", "inv-220726");
const SOURCE = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "invoice-source.json"), "utf8")
) as NormalizedInvoice;
const EXPECTED = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "expected-results.json"), "utf8")
) as { expected: { hsCodes: string[] } };

const REFERENCE = startOfUtcDay(new Date("2026-06-14T12:00:00.000Z"));

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 75, status: "WARNING", warnings: [], errors: [] },
    preference_origin: { destination_outside_eu: true },
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

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

console.log("INV/220726 — forensic regression\n");

console.log("A) Destination country — Customer Kosovo, not Shipping SI");
const destFixed = resolveDestinationCountry({ ...SOURCE }).country_code;
assert(destFixed === "XK", `destination country_code=XK (got ${destFixed})`);

const enriched = enrichInvoiceDocument(SOURCE, SOURCE.ocr_text ?? null);
assert(enriched.country_code === "XK", `enriched destination=XK (got ${enriched.country_code})`);
assert(enriched.country_code !== "SI", "shipping address did not override consignee");

console.log("\nB) China → CN (not CH)");
assert(resolveIso2CountryCode("China") === "CN", "China → CN");
assert(resolveIso2CountryCode("CH") === "CH", "CH → Switzerland");
assert(resolveIso2CountryCode("Switzerland") === "CH", "Switzerland → CH");

const agg = runHsAggregationEngine(enriched);
const goodsOrigins = agg.mrn_summary.countries_of_origin;
assert(goodsOrigins.includes("CN"), `HS aggregation COO includes CN (got ${goodsOrigins.join(",")})`);
assert(!goodsOrigins.includes("CH"), "HS aggregation COO does not include CH for China");

console.log("\nC) Service / freight line excluded");
assert(isServiceOrTransportLine("International Freight"), "freight line detected as service");
assert(isServiceOrTransportLine("Mainfreight: Freight"), "Mainfreight line detected as service");
assert(
  resolveInvoiceLineType("Mainfreight: Freight") === LINE_TYPE_SERVICE,
  "LINE_TYPE=SERVICE for Mainfreight"
);
assert(agg.mrn_summary.excluded_service_lines >= 1, "excluded_service_lines >= 1");
assert(
  agg.mrn_summary.total_goods_lines === 7,
  `total_goods_lines=7 (got ${agg.mrn_summary.total_goods_lines})`
);
assert(
  agg.hs_aggregation.every((row) => row.hs_code !== "0" && row.hs_code !== "00000000"),
  "service placeholder HS not in aggregation"
);

console.log("\nD) Customs readiness — CUSTOMS_REVIEW not BLOCKED");
const report = mapAuditReportToExportReport(enriched, minimalAudit(), "INV_220726.pdf");
const readiness = evaluateCustomsReadiness(report, enriched);
assert(readiness.status === "CUSTOMS_REVIEW", `customsReadiness=CUSTOMS_REVIEW (got ${readiness.status})`);
assert(readiness.status !== "CUSTOMS_BLOCKED", "not CUSTOMS_BLOCKED for missing incoterms/weight alone");
assert(
  !report.issues.some((i) => i.field === EU_DESTINATION),
  "no EU_DESTINATION warning for Kosovo"
);

console.log("\nE) Invoice date 01/20/2026 — US format, not future");
const parsed = parseInvoiceDate("01/20/2026");
assert(parsed != null, "01/20/2026 parses");
assert(parsed!.getUTCMonth() === 0 && parsed!.getUTCDate() === 20, "01/20/2026 = 20 Jan 2026");
const dateIssues = evaluateInvoiceDateReadiness(
  { ...enriched, invoice_date: "01/20/2026" },
  REFERENCE
);
assert(
  !dateIssues.some((i) => i.code === INVOICE_DATE_IN_FUTURE),
  "01/20/2026 does not trigger INVOICE_DATE_IN_FUTURE"
);

console.log("\nF) HS codes detected");
const detectedHs = [...(report.hsCodesDetected ?? [])].sort();
const expectedHs = [...EXPECTED.expected.hsCodes].sort();
assert(detectedHs.length === 7, `HS codes detected = 7 (got ${detectedHs.length})`);
assert(
  detectedHs.join(",") === expectedHs.join(","),
  `detected HS match expected (got ${detectedHs.join(",")})`
);

console.log("\nG) No false HS issues on service line");
assert(
  collectInvalidHsCodeIssues(enriched).length === 0,
  "collectInvalidHsCodeIssues empty"
);
assert(
  collectUnknownHsCodeIssues(enriched).length === 0,
  "collectUnknownHsCodeIssues empty"
);
assert(
  !report.issues.some((issue) => resolveIssueCode(issue) === INVALID_HS_FORMAT),
  "no INVALID_HS_FORMAT in report"
);
assert(
  !report.issues.some((issue) => resolveIssueCode(issue) === UNKNOWN_HS_CODE),
  "no UNKNOWN_HS_CODE in report"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
