/**
 * Origin status, allocation, and unified readiness regression tests.
 * Run: npm run test:export-auditor-origin-readiness
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { getReadinessVerdict } from "../src/lib/export-auditor/readiness-score";
import { resolveUnifiedReadiness } from "../src/lib/export-auditor/unified-readiness";
import {
  deriveLineBasedPreferentialStatus,
  MIXED_ORIGIN_STATUS_LABEL,
} from "../src/lib/export-auditor/mixed-origin-status-engine";
import { computePreferentialAllocation } from "../src/lib/export-auditor/preferential-allocation-engine";
import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
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

function buildAudit(overrides: Partial<AuditReportResponse> = {}): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 67, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: false,
    },
    issues: [],
    recommended_actions: [],
    summary: "Review.",
    ...overrides,
  };
}

function mixedAsteriskInvoice(): NormalizedInvoice {
  return {
    invoice_number: "MIX-001",
    country_code: "IS",
    country: "Iceland",
    currency: "EUR",
    total_value: "500.00",
    footer_text:
      "The exporter declares preferential origin.\n(Articles, which are not marked with sign (*), are without preferential origin).\nCUSTOMS AUTHORIZATION NO. SI/105/00",
    shipment_summary: {
      package_count: 1,
      package_type: "COLLI",
      gross_weight_total: 10,
      gross_weight_unit: "kg",
      net_weight_total: 8,
      net_weight_unit: "kg",
      pallet_count: null,
    },
    items: [
      { position_number: 1, description: "Tool A *", quantity: 2, line_total: "200.00" },
      { position_number: 2, description: "Tool B *", quantity: 1, line_total: "150.00" },
      { position_number: 3, description: "Accessory C", quantity: 1, line_total: "150.00" },
    ],
  };
}

function allPreferentialInvoice(): NormalizedInvoice {
  return {
    invoice_number: "ALL-PREF",
    country_code: "IS",
    country: "Iceland",
    currency: "EUR",
    total_value: "300.00",
    footer_text:
      "The exporter declares that these products are of EU preferential origin.\nCUSTOMS AUTHORIZATION NO. SI/105/00",
    items: [
      { position_number: 1, description: "Item *", quantity: 1, line_total: "100.00" },
      { position_number: 2, description: "Item two *", quantity: 1, line_total: "200.00" },
    ],
  };
}

function allNonPreferentialInvoice(): NormalizedInvoice {
  return {
    invoice_number: "NO-PREF",
    country_code: "IS",
    country: "Iceland",
    currency: "EUR",
    total_value: "200.00",
    items: [
      { position_number: 1, description: "Plain item", quantity: 1, line_total: "100.00" },
      { position_number: 2, description: "Other item", quantity: 1, line_total: "100.00" },
    ],
  };
}

function undeclaredOriginInvoice(): NormalizedInvoice {
  return {
    invoice_number: "UNDECL-1",
    country_code: "RS",
    country: "Serbia",
    currency: "EUR",
    total_value: "500.00",
    items: [
      {
        position_number: 1,
        description: "EU part",
        quantity: 2,
        line_total: "200.00",
        hs_code: "84713000",
        country_of_origin: "DE",
      },
      {
        position_number: 2,
        description: "CN part",
        quantity: 1,
        line_total: "300.00",
        hs_code: "84713000",
        country_of_origin: "CN",
      },
    ],
  };
}

console.log("Line-based preferential status engine");
const mixedLines = runPreferentialOriginEngine(mixedAsteriskInvoice()).lines;
assert(deriveLineBasedPreferentialStatus(mixedLines) === "MIXED_ORIGIN", "YES+NO lines → MIXED_ORIGIN");

const allPrefLines = runPreferentialOriginEngine(allPreferentialInvoice()).lines;
assert(deriveLineBasedPreferentialStatus(allPrefLines) === "CONFIRMED", "all YES → CONFIRMED");

const allNoLines = runPreferentialOriginEngine({
  ...allNonPreferentialInvoice(),
  footer_text: "Articles which are not marked with sign (*) are without preferential origin.",
}).lines;
const allNoStatus = deriveLineBasedPreferentialStatus(allNoLines);
assert(allNoStatus === "NOT_DECLARED", "explicit NO lines (all without *) → NOT_DECLARED document status");
assert(allNoLines.every((line) => line.preferential_origin === "NO"), "all lines classified NO");

const undeclaredLines = runPreferentialOriginEngine(undeclaredOriginInvoice()).lines;
assert(
  deriveLineBasedPreferentialStatus(undeclaredLines) === "NON_PREFERENTIAL_EXPORT",
  "all NOT_DECLARED lines → NON_PREFERENTIAL_EXPORT"
);

console.log("\nPreferential allocation engine");
const mixedAllocation = computePreferentialAllocation(mixedAsteriskInvoice(), mixedLines);
assert(mixedAllocation?.isMixed === true, "mixed allocation flagged");
assert(mixedAllocation?.preferentialQuantity === 3, "preferential qty = 3");
assert(mixedAllocation?.nonPreferentialQuantity === 1, "non-preferential qty = 1");
assert(mixedAllocation?.preferentialValue === 350, "preferential value = 350");
assert(mixedAllocation?.nonPreferentialValue === 150, "non-preferential value = 150");

console.log("\nMixed-origin document status (partial preferential)");
const mixedInvoice = enrichInvoiceDocument(mixedAsteriskInvoice(), mixedAsteriskInvoice().footer_text ?? "");
const mixedReport = mapAuditReportToExportReport(mixedInvoice, buildAudit(), "mixed.pdf");
assert(
  mixedReport.preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN",
  "document status = MIXED_ORIGIN"
);
assert(
  mixedReport.preferenceOrigin.status === MIXED_ORIGIN_STATUS_LABEL,
  "display status = Mixed Origin Goods"
);
assert(
  mixedReport.preferenceOrigin.invoiceDeclarationSufficient === false,
  "invoice declaration not sufficient when mixed"
);
assert(mixedReport.preferenceOrigin.mixedOrigin === true, "mixedOrigin flag set");
assert(mixedReport.preferenceOrigin.mixedOriginTotals != null, "mixed origin totals present");
assert(
  mixedReport.preferenceOrigin.preferentialAllocation?.preferentialWeight != null,
  "preferential weight allocated"
);

console.log("\nAuthorised exporter — all preferential");
const allPref = enrichInvoiceDocument(allPreferentialInvoice(), allPreferentialInvoice().footer_text ?? "");
const allPrefReport = mapAuditReportToExportReport(allPref, buildAudit(), "all-pref.pdf");
assert(
  allPrefReport.preferenceOrigin.preferentialOriginStatus === "CONFIRMED",
  "all preferential → CONFIRMED"
);
assert(allPrefReport.preferenceOrigin.invoiceDeclarationSufficient === true, "declaration sufficient when all preferential");

console.log("\nUnified readiness — no contradictory labels");
const fixturePath = path.join(__dirname, "fixtures", "2602002968-ocr.json");
const pdfTextFixturePath = path.join(__dirname, "fixtures", "2602002968-pdf-text.txt");
const rawFixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as NormalizedInvoice;
const pdfTextForGolden = fs.existsSync(pdfTextFixturePath)
  ? fs.readFileSync(pdfTextFixturePath, "utf8")
  : rawFixture.footer_text ?? "";
const goldenInvoice = enrichInvoiceDocument(rawFixture, pdfTextForGolden);
const goldenReport = mapAuditReportToExportReport(
  goldenInvoice,
  buildAudit({
    readiness: { score: 67, status: "WARNING", warnings: ["No HS codes detected"], errors: [] },
    issues: [
      { severity: "INFO", code: "HS_CODE_NOT_ON_INVOICE", message: "No HS codes on invoice." },
    ],
    recommended_actions: ["Verify preferential origin", "Assign HS codes manually"],
  }),
  "2602002968.pdf"
);
const goldenVerdict = getReadinessVerdict(goldenReport);
const goldenUnified = resolveUnifiedReadiness(goldenReport);

assert(goldenVerdict.exportStatus === "Ready With Review", "2602002968 → Ready With Review");
assert(goldenReport.auditStatus === "WARNING", "2602002968 auditStatus WARNING (not READY)");
assert(
  goldenVerdict.exportStatus === goldenUnified.exportStatus,
  "verdict matches unified readiness exportStatus"
);
assert(
  goldenVerdict.auditStatus === goldenUnified.auditStatus,
  "verdict matches unified readiness auditStatus"
);
assert(
  goldenReport.preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN",
  "2602002968 document status MIXED_ORIGIN"
);
assert(goldenReport.preferenceOrigin.preferentialAllocation != null, "2602002968 allocation present");
assert(
  !goldenReport.exportSummary.toLowerCase().includes("upstream"),
  "export summary is not raw upstream placeholder"
);

console.log("\nHS pending caps READY status");
const hsPendingVerdict = getReadinessVerdict({
  ...goldenReport,
  readinessScore: 95,
  hsCodesDetected: [],
});
assert(hsPendingVerdict.exportStatus !== "Ready", "score 95 without HS is not Ready");
assert(hsPendingVerdict.exportStatus === "Ready With Review", "score 95 without HS → Ready With Review");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
