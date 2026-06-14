/**
 * Forensic regression — DEXXON 261000177 + MAMIYE 6124746 (source layouts, not simplified fixtures).
 * Run: npm run test:dexxon-mamiye-forensic
 */

import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { extractHsCodes } from "../src/lib/export-auditor/invoice-fields";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import {
  HS_CODE_NOT_ON_INVOICE,
  HS_EXTRACTION_FAILURE,
  resolveIssueCode,
} from "../src/lib/export-auditor/issue-readiness";
import { DEXXON_261000177_SOURCE } from "./fixtures/forensic/dexxon-261000177-source";
import {
  MAMIYE_6124746_SOURCE,
  MAMIYE_EXPECTED_COO,
  MAMIYE_PREFERENTIAL_EXCEPTIONS,
} from "./fixtures/forensic/mamiye-6124746-source";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

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
    summary: "",
  };
}

function runPipeline(source: NormalizedInvoice, fileName: string) {
  const enriched = enrichInvoiceDocument(source);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), fileName);
  return { enriched, report };
}

console.log("DEXXON_261000177 — multiline Commodity code / COO blocks\n");
const dexxon = runPipeline(DEXXON_261000177_SOURCE, "261000177.pdf");
const dexxonHs = extractHsCodes(dexxon.enriched);
const dexxonLineHs = (dexxon.enriched.items ?? []).filter((i) => i.hs_code?.trim()).length;
const dexxonCoo = (dexxon.enriched.items ?? []).filter((i) => i.country_of_origin?.trim()).length;
const dexxonAgg = dexxon.report.hsAggregationReport.hsAggregation.length;

assert(dexxonHs.length > 0, `HS codes detected > 0 (got ${dexxonHs.length})`);
assert(dexxonHs.includes("85235110"), "85235110 detected");
assert(dexxonLineHs === 10, `10 line HS backfills (got ${dexxonLineHs})`);
assert(dexxonCoo === 10, `10 line COO backfills (got ${dexxonCoo})`);
assert(
  (dexxon.enriched.items ?? []).every((i) => i.country_of_origin?.toUpperCase() === "CN"),
  "all lines COO=CN"
);
assert(dexxonAgg >= 1, `HS aggregation populated (rows=${dexxonAgg})`);
assert(
  !dexxon.report.issues.some((i) => resolveIssueCode(i) === HS_CODE_NOT_ON_INVOICE),
  "no MANUAL_CLASSIFICATION (HS_CODE_NOT_ON_INVOICE)"
);
assert(
  !dexxon.report.issues.some((i) => resolveIssueCode(i) === HS_EXTRACTION_FAILURE),
  "no HS_EXTRACTION_FAILURE"
);
assert(
  evaluateCustomsReadiness(dexxon.report, dexxon.enriched).status !== "CUSTOMS_BLOCKED",
  "not CUSTOMS_BLOCKED"
);

console.log("\nMAMIYE_6124746 — mixed IT/TR/BG + preferential exceptions\n");
const mamiye = runPipeline(MAMIYE_6124746_SOURCE, "6124746.pdf");
const mamiyeHs = extractHsCodes(mamiye.enriched);
const mamiyeLineHs = (mamiye.enriched.items ?? []).filter((i) => i.hs_code?.trim()).length;
const mamiyeOrigins = new Set(
  (mamiye.enriched.items ?? [])
    .map((i) => i.country_of_origin?.trim().toUpperCase())
    .filter(Boolean)
);
const aggOriginsText = mamiye.report.hsAggregationReport.originCountriesDetected ?? "";
const linePrefs = mamiye.report.preferenceOrigin.lineItems;

assert(mamiyeLineHs === 6, `6 line HS extracted (got ${mamiyeLineHs})`);
assert(mamiyeHs.length >= 3, `HS count >= 3 (got ${mamiyeHs.length})`);
for (const code of MAMIYE_EXPECTED_COO) {
  assert(mamiyeOrigins.has(code), `line COO includes ${code} (got ${[...mamiyeOrigins].join(",")})`);
}
assert(mamiyeOrigins.size >= 3, "no COO collapse — 3+ distinct origins on lines");
for (const code of MAMIYE_EXPECTED_COO) {
  assert(
    aggOriginsText.includes(code),
    `aggregation origin includes ${code} (got ${aggOriginsText || "—"})`
  );
}

console.log("\nMAMIYE preferential audit table");
console.log("Line | HS | Source COO | Extracted COO | Preference");
const sourceCooByLine: Record<number, string> = {
  1: "IT",
  2: "TR",
  3: "BG",
  4: "IT",
  5: "TR",
  6: "BG",
};
for (const item of mamiye.enriched.items ?? []) {
  const pos = item.position_number ?? 0;
  const pref = linePrefs.find((l) => l.position_number === pos);
  const extracted = item.country_of_origin?.toUpperCase() ?? "—";
  const prefStatus = pref?.preferential_origin ?? "—";
  console.log(
    `${pos} | ${item.hs_code ?? "—"} | ${sourceCooByLine[pos] ?? "?"} | ${extracted} | ${prefStatus}`
  );
  assert(extracted === sourceCooByLine[pos], `line ${pos} COO=${sourceCooByLine[pos]} (got ${extracted})`);
  if (MAMIYE_PREFERENTIAL_EXCEPTIONS.includes(pos)) {
    assert(prefStatus === "NO", `line ${pos} excluded from preferential (got ${prefStatus})`);
  } else {
    assert(prefStatus === "YES", `line ${pos} preferential YES (got ${prefStatus})`);
  }
}

assert(
  !mamiye.report.issues.some((i) => resolveIssueCode(i) === HS_EXTRACTION_FAILURE),
  "no HS_EXTRACTION_FAILURE"
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
