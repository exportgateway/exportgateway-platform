/**
 * Golden customs workflow regression suite.
 * Run: npm run test:golden-customs-workflow
 *
 * Validates OCR metrics separation, weight hierarchy, preferential origin evidence,
 * customs readiness, declaration readiness, and HS export columns.
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import {
  evaluatePreferentialOriginDecision,
  HIGH_VALUE_NO_DECLARATION_MESSAGE,
} from "../src/lib/export-auditor/preferential-origin-decision-engine";
import { resolveWeightHierarchy } from "../src/lib/export-auditor/weight-extraction-hierarchy";
import {
  extractGrossWeight,
  extractLineItemNetWeightTotal,
  extractNetWeightFromDocument,
} from "../src/lib/export-auditor/shipment-summary-extractor";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import { evaluateDeclarationReadiness } from "../src/lib/export-auditor/declaration-readiness-check";
import { buildMrnExportDataset, MRN_EXPORT_COLUMNS } from "../src/lib/export-auditor/mrn-export";
import { resolvePreferenceScheme } from "../src/lib/export-auditor/preference-scheme";
import { resolveIssueSeverity } from "../src/lib/export-auditor/issue-readiness";
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
    readiness: { score: 85, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "Review required.",
  };
}

console.log("Preferential origin evidence status");
const pem = resolvePreferenceScheme("RS", "Serbia");
const lowDeclared = evaluatePreferentialOriginDecision({
  preferenceScheme: pem,
  originDeclarationDetected: true,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 3000,
});
assert(lowDeclared.evidenceStatus === "DECLARED", "low value + declaration → DECLARED");
assert(lowDeclared.eur1Recommended === false, "EUR.1 never auto-recommended");

const highUndeclared = evaluatePreferentialOriginDecision({
  preferenceScheme: pem,
  originDeclarationDetected: false,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 7500,
});
assert(highUndeclared.evidenceStatus === "NOT_DECLARED", "high value no declaration → NOT_DECLARED");
assert(
  highUndeclared.recommendation === HIGH_VALUE_NO_DECLARATION_MESSAGE,
  "high value no declaration message"
);

const highDeclaredNoAuth = evaluatePreferentialOriginDecision({
  preferenceScheme: pem,
  originDeclarationDetected: true,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 7500,
});
assert(highDeclaredNoAuth.evidenceStatus === "UNVERIFIED", "high value declaration without auth → UNVERIFIED");

console.log("\nWeight extraction hierarchy");
const hierarchy = resolveWeightHierarchy({
  existing: { net_weight_total: 100, net_weight_unit: "kg" } as NormalizedInvoice["shipment_summary"] & {},
  documentNet: { net_weight_total: 50, net_weight_unit: "kg" },
  documentGross: { gross_weight_total: 120, gross_weight_unit: "kg" },
  calculatedNet: { net_weight_total: 80, net_weight_unit: "kg" },
});
assert(hierarchy.netWeightTotal === 100, "document net never overwritten by calculated");
assert(hierarchy.netWeightSource === "DOCUMENT", "existing document net source DOCUMENT");

const fallbackHierarchy = resolveWeightHierarchy({
  documentNet: { net_weight_total: null, net_weight_unit: null },
  documentGross: { gross_weight_total: null, gross_weight_unit: null },
  calculatedNet: extractLineItemNetWeightTotal([
    { net_weight: 12.5 },
    { net_weight: 12.486 },
  ]),
});
assert(fallbackHierarchy.netWeightSource === "CALCULATED", "line sum fallback when no document weight");

console.log("\nMapped report — customs & declaration readiness");
const invoice: NormalizedInvoice = enrichInvoiceDocument(
  {
    invoice_number: "GW-001",
    exporter: "EU Maker d.o.o.",
    consignee: "Buyer RS",
    country: "Serbia",
    country_code: "RS",
    incoterms: "DAP",
    currency: "EUR",
    total_value: "2500.00",
    vat_article: "VAT exempt export under Article 146 Directive 2006/112/EC",
    items: [
      {
        position_number: 1,
        description: "Part",
        quantity: 1,
        line_total: "2500.00",
        hs_code: "84818073",
        country_of_origin: "DE",
        net_weight: 5,
      },
    ],
    shipment_summary: {
      package_count: 1,
      gross_weight_total: 10,
      gross_weight_unit: "kg",
      net_weight_total: 8,
      net_weight_unit: "kg",
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  null
);

const report = mapAuditReportToExportReport(invoice, baseAudit(), "gw-001.pdf");
assert(report.confidence.ocrQuality >= 0, "OCR confidence present");
assert(
  report.ocrObservability?.dataExtractionCompleteness != null,
  "data extraction completeness on observability"
);
assert(report.customsReadiness != null, "customs readiness attached");
assert(report.declarationReadiness != null, "declaration readiness attached");
assert(report.preferenceOrigin.evidenceStatus === "NOT_DECLARED", "mapped evidence status");
assert(report.preferenceOrigin.eur1Recommended === false, "mapped eur1 always false");

const customs = evaluateCustomsReadiness(report, invoice);
assert(
  customs.status === "CUSTOMS_READY" || customs.status === "CUSTOMS_REVIEW",
  "complete invoice not blocked"
);

const declaration = evaluateDeclarationReadiness(report, invoice);
assert(declaration.status === "READY FOR DECLARATION", "declaration readiness ready");

console.log("\nHS aggregation export columns");
const dataset = buildMrnExportDataset(report);
assert(dataset != null, "MRN dataset built");
if (dataset) {
  assert(MRN_EXPORT_COLUMNS.length === 6, "six HS export columns");
  assert(dataset.rows.every((row) => row.sourcePositions.length > 0), "source positions populated");
  assert(dataset.rows[0].hsCode.length > 0, "HS code column populated");
}

console.log("\nIssue severity classification");
const severities = report.issues.map((issue) => resolveIssueSeverity(issue));
assert(severities.every((s) => ["CRITICAL", "WARNING", "INFO"].includes(s)), "valid severities");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
