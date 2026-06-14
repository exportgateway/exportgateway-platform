/**
 * Forensic regression — RN-46 PET PAN IVECO EUROCARGO single vehicle line.
 * Run: npm run test:rn-46-pet-pan
 */
import { readFileSync } from "fs";
import { join } from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import {
  countCommercialGoodsLines,
  detectCommercialGoodsLines,
  isSingleLineVehicleInvoice,
} from "../src/lib/export-auditor/commercial-line-detector";
import {
  applyHsClassificationSanity,
  isForbiddenVehiclePartHs,
  MULTIPLE_HS_CANDIDATES_DETECTED,
} from "../src/lib/export-auditor/hs-classification-sanity";
import { buildHsWorkflowSummary } from "../src/lib/export-auditor/hs-classification-workflow";
import { extractHsCodes } from "../src/lib/export-auditor/invoice-fields";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const FIXTURE_DIR = join(process.cwd(), "golden-invoices", "rn-46-pet-pan");
const SOURCE = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "invoice-source.json"), "utf8")
) as NormalizedInvoice;

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
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

console.log("RN-46 PET PAN IVECO — single goods line HS protection\n");

console.log("1) Commercial line detection");
assert(countCommercialGoodsLines(SOURCE) === 1, "commercial goods lines = 1");
assert(
  detectCommercialGoodsLines(SOURCE)[0]?.description.includes("EUROCARGO"),
  "commercial line is IVECO EUROCARGO"
);
assert(isSingleLineVehicleInvoice(SOURCE), "single-line vehicle invoice");

console.log("\n2) Vehicle part HS guard");
assert(
  isForbiddenVehiclePartHs("87089980", "TOVORNO VOZILO IVECO EUROCARGO 180E28"),
  "8708 forbidden for complete vehicle"
);
assert(
  isForbiddenVehiclePartHs("84099979", "TOVORNO VOZILO IVECO EUROCARGO 180E28"),
  "8409 forbidden for complete vehicle"
);
assert(
  !isForbiddenVehiclePartHs("87042290", "TOVORNO VOZILO IVECO EUROCARGO 180E28"),
  "8704 allowed for complete vehicle"
);

console.log("\n3) HS sanity — single final code");
const sanity = applyHsClassificationSanity(SOURCE);
assert(
  extractHsCodes(sanity.invoice).length === 1,
  `extractHsCodes count=1 (got ${extractHsCodes(sanity.invoice).join(",")})`
);
assert(
  extractHsCodes(sanity.invoice)[0] === "87042290",
  `HS code 87042290 (got ${extractHsCodes(sanity.invoice)[0]})`
);

const enriched = enrichInvoiceDocument(SOURCE, SOURCE.ocr_text ?? null);
const workflow = buildHsWorkflowSummary(enriched);
assert(workflow.finalHsCodes.length === 1, `finalHsCodes=1 (got ${workflow.finalHsCodes.length})`);
assert(workflow.totalGoodsLines === 1, `totalGoodsLines=1 (got ${workflow.totalGoodsLines})`);

console.log("\n4) Full report mapping");
const report = mapAuditReportToExportReport(enriched, minimalAudit(), "RN-46.pdf");
assert(report.hsCodesDetected.length === 1, `hsCodesDetected=1 (got ${report.hsCodesDetected.length})`);
assert(report.hsCodesDetected[0] === "87042290", "detected HS 87042290");

const originCodes = report.preferenceOrigin.lineItems
  .map((line) => line.country_of_origin)
  .filter((code) => code && code !== "—");
assert(
  originCodes.length === 0 || originCodes.every((code) => code === "UNKNOWN" || code === "—"),
  "origin not falsely populated on metadata lines"
);

const readiness = evaluateCustomsReadiness(report, enriched);
assert(readiness.status === "CUSTOMS_REVIEW", `customsReadiness=REVIEW (got ${readiness.status})`);
assert(readiness.status !== "CUSTOMS_BLOCKED", "not CUSTOMS_BLOCKED");

const multiWarning = report.issues.some((i) => i.field === MULTIPLE_HS_CANDIDATES_DETECTED);
if (sanity.warnings.length > 0) {
  assert(multiWarning, "MULTIPLE_HS_CANDIDATES_DETECTED warning when candidates collapsed");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
