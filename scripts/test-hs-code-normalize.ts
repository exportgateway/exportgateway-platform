/**
 * HS validation golden tests — format, OCR repair, nomenclature, readiness, confidence.
 * Run: npm run test:hs-code-normalize
 */

import { validateHsCode, HS_STATUS_CONFIDENCE } from "../src/lib/export-auditor/hs-validation-engine";
import {
  classifyLineHs,
  collectInvalidHsCodeIssues,
  collectUnknownHsCodeIssues,
} from "../src/lib/export-auditor/hs-classification-workflow";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import {
  INVALID_HS_FORMAT,
  resolveIssueCode,
  resolveIssueSeverity,
  UNKNOWN_HS_CODE,
} from "../src/lib/export-auditor/issue-readiness";
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
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: { destination_outside_eu: true },
    issues: [],
    recommended_actions: [],
    summary: "Review required.",
  };
}

const baseInvoice: NormalizedInvoice = {
  invoice_number: "INV-HS-TEST",
  exporter: "Exporter GmbH",
  consignee: "Buyer DOO Beograd",
  country_code: "RS",
  country: "Serbia",
  total_value_numeric: 100,
  incoterms: "DAP",
  shipment_summary: {
    package_count: 1,
    package_type: "CARTON",
    gross_weight_total: 10,
    gross_weight_unit: "kg",
    net_weight_total: 9,
    net_weight_unit: "kg",
    pallet_dimensions: null,
    pallet_count: null,
  },
};

console.log("Golden HS status matrix");
const cases: Array<{ input: string; expectedStatus: string; expectedNormalized: string | null }> = [
  { input: "84381090", expectedStatus: "VALID", expectedNormalized: "84381090" },
  { input: "B4381090", expectedStatus: "REPAIRED", expectedNormalized: "84381090" },
  { input: "84381O90", expectedStatus: "REPAIRED", expectedNormalized: "84381090" },
  { input: "84A81090", expectedStatus: "INVALID_FORMAT", expectedNormalized: null },
  { input: "99999999", expectedStatus: "UNKNOWN_HS", expectedNormalized: "99999999" },
];

for (const testCase of cases) {
  const result = validateHsCode(testCase.input);
  assert(
    result.hsStatus === testCase.expectedStatus,
    `${testCase.input} → ${testCase.expectedStatus} (got ${result.hsStatus})`
  );
  assert(
    result.normalizedHs === testCase.expectedNormalized,
    `${testCase.input} normalized=${testCase.expectedNormalized} (got ${result.normalizedHs})`
  );
  assert(
    result.hsConfidence === HS_STATUS_CONFIDENCE[result.hsStatus],
    `${testCase.input} confidence ${HS_STATUS_CONFIDENCE[result.hsStatus]}%`
  );
}

console.log("\nLine classification + traceability fields");
const repairedLine = classifyLineHs(
  { position_number: 1, description: "Food machinery", hs_code: "B4381090", quantity: 1, line_total: 100 },
  1
);
assert(repairedLine.hsStatus === "REPAIRED", "line B4381090 → REPAIRED");
assert(repairedLine.normalizedHsCode === "84381090", "normalized HS on line");
assert(repairedLine.repairApplied === true, "repairApplied true");
assert(repairedLine.hsConfidence === 95, "REPAIRED confidence 95%");

const unknownLine = classifyLineHs(
  { position_number: 2, description: "Unknown goods", hs_code: "99999999", quantity: 1, line_total: 50 },
  2
);
assert(unknownLine.hsStatus === "UNKNOWN_HS", "99999999 → UNKNOWN_HS");
assert(unknownLine.hsConfidence === 60, "UNKNOWN_HS confidence 60%");

console.log("\nCustoms readiness by HS status");
const invalidFormatInvoice: NormalizedInvoice = {
  ...baseInvoice,
  items: [{ position_number: 1, description: "Bad HS", hs_code: "84A81090", quantity: 1, line_total: 100 }],
};
const invalidReport = mapAuditReportToExportReport(
  enrichInvoiceDocument(invalidFormatInvoice),
  baseAudit(),
  "invalid-format.pdf"
);
assert(
  evaluateCustomsReadiness(invalidReport, invalidFormatInvoice).status === "CUSTOMS_BLOCKED",
  "INVALID_FORMAT → CUSTOMS_BLOCKED"
);
assert(
  invalidReport.issues.some((issue) => resolveIssueCode(issue) === INVALID_HS_FORMAT),
  "INVALID_FORMAT issue emitted"
);
assert(
  resolveIssueSeverity(
    invalidReport.issues.find((issue) => resolveIssueCode(issue) === INVALID_HS_FORMAT)!
  ) === "CRITICAL",
  "INVALID_FORMAT severity CRITICAL"
);

const unknownInvoice: NormalizedInvoice = {
  ...baseInvoice,
  items: [{ position_number: 1, description: "Unknown HS", hs_code: "99999999", quantity: 1, line_total: 100 }],
};
const unknownReport = mapAuditReportToExportReport(
  enrichInvoiceDocument(unknownInvoice),
  baseAudit(),
  "unknown-hs.pdf"
);
assert(
  evaluateCustomsReadiness(unknownReport, unknownInvoice).status === "CUSTOMS_REVIEW",
  "UNKNOWN_HS → CUSTOMS_REVIEW"
);
assert(
  unknownReport.issues.some((issue) => resolveIssueCode(issue) === UNKNOWN_HS_CODE),
  "UNKNOWN_HS_CODE issue emitted"
);

const validInvoice: NormalizedInvoice = {
  ...baseInvoice,
  items: [{ position_number: 1, description: "Valid HS", hs_code: "84381090", quantity: 1, line_total: 100 }],
};
const validReport = mapAuditReportToExportReport(
  enrichInvoiceDocument(validInvoice),
  baseAudit(),
  "valid-hs.pdf"
);
assert(validReport.hsWorkflowSummary?.documentHsStatus === "VALID", "84381090 document VALID");
assert(
  collectInvalidHsCodeIssues(validInvoice).length === 0 &&
    collectUnknownHsCodeIssues(validInvoice).length === 0,
  "VALID invoice has no HS validation issues"
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
