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
import {
  classifyLineHs,
  buildHsWorkflowSummary,
} from "../src/lib/export-auditor/hs-classification-workflow";
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
  assert(MRN_EXPORT_COLUMNS.length === 10, "ten declarant export columns");
  assert(dataset.rows.every((row) => row.sourcePositions.length > 0), "source positions populated");
  assert(dataset.rows[0].hsCode.length > 0, "HS code column populated");
  assert(
    ["YES", "NO", "UNKNOWN"].includes(dataset.rows[0].preferentialOrigin),
    "preferential origin column populated"
  );
}

console.log("\nHS workflow — invoice, wizard, user override, missing");
function hsScenarioInvoice(items: NormalizedInvoice["items"]): NormalizedInvoice {
  return enrichInvoiceDocument(
    {
      invoice_number: "HS-SCENARIO",
      exporter: "EU Maker d.o.o.",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value: "2500.00",
      vat_article: "VAT exempt export under Article 146 Directive 2006/112/EC",
      items,
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
}

const invoiceHsOnly = hsScenarioInvoice([
  {
    position_number: 1,
    description: "Part",
    quantity: 1,
    line_total: "2500.00",
    hs_code: "84818073",
    country_of_origin: "DE",
    net_weight: 5,
  },
]);
const invoiceHsSummary = buildHsWorkflowSummary(invoiceHsOnly);
assert(invoiceHsSummary.documentHsStatus === "VALID", "invoice HS → VALID");
const invoiceLine = classifyLineHs(invoiceHsOnly.items![0], 1);
assert(invoiceLine.hsSource === "INVOICE", "invoice HS source INVOICE");
const invoiceReport = mapAuditReportToExportReport(invoiceHsOnly, baseAudit(), "invoice-hs.pdf");
assert(
  evaluateCustomsReadiness(invoiceReport, invoiceHsOnly).status === "CUSTOMS_READY",
  "invoice HS → CUSTOMS_READY"
);

const wizardInvoice = hsScenarioInvoice([
  {
    position_number: 1,
    description: "Unclassified part",
    quantity: 1,
    line_total: "2500.00",
    country_of_origin: "DE",
    net_weight: 5,
    final_hs_code: "84818073",
    hs_source: "WIZARD",
  },
]);
const wizardSummary = buildHsWorkflowSummary(wizardInvoice);
assert(wizardSummary.documentHsStatus === "VALID", "wizard HS → VALID");
const wizardLine = classifyLineHs(wizardInvoice.items![0], 1);
assert(wizardLine.hsSource === "WIZARD", "wizard HS source WIZARD");
assert(wizardLine.invoiceHsCode == null, "wizard line has no invoice HS");
const wizardReport = mapAuditReportToExportReport(wizardInvoice, baseAudit(), "wizard-hs.pdf");
assert(
  evaluateCustomsReadiness(wizardReport, wizardInvoice).status === "CUSTOMS_READY",
  "wizard HS → CUSTOMS_READY"
);
const wizardDataset = buildMrnExportDataset(wizardReport);
assert(wizardDataset?.rows[0]?.hsStatus === "Valid", "wizard export HS status Valid");
assert(wizardDataset?.rows[0]?.hsSource === "Wizard", "wizard export HS source Wizard");

const userOverrideInvoice = hsScenarioInvoice([
  {
    position_number: 1,
    description: "Part",
    quantity: 1,
    line_total: "2500.00",
    invoice_hs_code: "84818073",
    final_hs_code: "84819000",
    hs_source: "USER",
    country_of_origin: "DE",
    net_weight: 5,
  },
]);
const userLine = classifyLineHs(userOverrideInvoice.items![0], 1);
assert(userLine.hsSource === "USER", "user override source USER");
assert(userLine.invoiceHsCode === "84818073", "user override preserves invoice HS");
assert(userLine.finalHsCode === "84819000", "user override final HS");
const userReport = mapAuditReportToExportReport(userOverrideInvoice, baseAudit(), "user-hs.pdf");
const userTrace = userReport.hsAggregationReport?.traceabilityLines[0];
assert(userTrace?.invoiceHsCode === "84818073", "traceability invoice HS");
assert(userTrace?.finalHsCode === "84819000", "traceability final HS");
assert(userTrace?.hsSource === "USER", "traceability HS source USER");

const missingInvoice = hsScenarioInvoice([
  {
    position_number: 1,
    description: "Unclassified part",
    quantity: 1,
    line_total: "2500.00",
    country_of_origin: "DE",
    net_weight: 5,
  },
]);
const missingSummary = buildHsWorkflowSummary(missingInvoice);
assert(missingSummary.documentHsStatus === "MISSING", "no HS → MISSING");
const missingReport = mapAuditReportToExportReport(missingInvoice, baseAudit(), "missing-hs.pdf");
assert(
  evaluateCustomsReadiness(missingReport, missingInvoice).status === "CUSTOMS_REVIEW",
  "missing HS → CUSTOMS_REVIEW"
);
assert(
  evaluateDeclarationReadiness(missingReport, missingInvoice).status !== "READY FOR DECLARATION",
  "missing HS blocks declaration readiness"
);

console.log("\nIssue severity classification");
const severities = report.issues.map((issue) => resolveIssueSeverity(issue));
assert(severities.every((s) => ["CRITICAL", "WARNING", "INFO"].includes(s)), "valid severities");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
