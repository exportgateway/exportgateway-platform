/**
 * HS Verification Engine regression suite.
 * Run: npm run test:hs-verification
 */

import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  evaluateLineHsVerification,
  buildHsVerificationSummary,
  hasHighConfidenceHsDiscrepancy,
} from "../src/lib/export-auditor/hs-verification-engine";
import { buildMrnExportDataset, MRN_EXPORT_COLUMNS } from "../src/lib/export-auditor/mrn-export";
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

function scenarioInvoice(items: NormalizedInvoice["items"]): NormalizedInvoice {
  return enrichInvoiceDocument(
    {
      invoice_number: "HS-VERIFY",
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

console.log("HS Verification Engine");

console.log("\nScenario 1 — invoice HS matches wizard HS");
const scenario1Item = {
  position_number: 1,
  description: "Steel tube",
  quantity: 1,
  line_total: "2500.00",
  hs_code: "73072980",
  wizard_hs_code: "73072980",
  wizard_confidence: 92,
  country_of_origin: "DE",
  net_weight: 5,
};
const scenario1 = evaluateLineHsVerification(scenario1Item, 1);
assert(scenario1.verificationStatus === "VERIFIED", "same HS → VERIFIED");
assert(scenario1.invoiceHsCode === "73072980", "invoice HS preserved");
assert(scenario1.wizardHsCode === "73072980", "wizard HS recorded");

console.log("\nScenario 2 — invoice HS differs, high wizard confidence");
const scenario2Item = {
  position_number: 1,
  description: "Plastic part",
  quantity: 1,
  line_total: "2500.00",
  hs_code: "39269097",
  wizard_hs_code: "84818081",
  wizard_confidence: 94,
  country_of_origin: "DE",
  net_weight: 5,
};
const scenario2 = evaluateLineHsVerification(scenario2Item, 1);
assert(scenario2.verificationStatus === "REVIEW_REQUIRED", "different HS + 94% → REVIEW_REQUIRED");
const scenario2Report = mapAuditReportToExportReport(
  scenarioInvoice([scenario2Item]),
  baseAudit(),
  "scenario2.pdf"
);
assert(
  evaluateCustomsReadiness(scenario2Report, scenarioInvoice([scenario2Item])).status === "CUSTOMS_REVIEW",
  "high-confidence discrepancy → CUSTOMS_REVIEW"
);
assert(
  scenario2Report.customsReadiness?.reasons.includes("HS classification discrepancy detected") === true,
  "readiness reason mentions discrepancy"
);

console.log("\nScenario 3 — invoice HS missing, wizard HS available");
const scenario3Item = {
  position_number: 1,
  description: "Aluminium article",
  quantity: 1,
  line_total: "2500.00",
  wizard_hs_code: "76169990",
  wizard_confidence: 89,
  country_of_origin: "DE",
  net_weight: 5,
};
const scenario3 = evaluateLineHsVerification(scenario3Item, 1);
assert(scenario3.verificationStatus === "GENERATED", "no invoice HS + wizard → GENERATED");
const scenario3Report = mapAuditReportToExportReport(
  scenarioInvoice([scenario3Item]),
  baseAudit(),
  "scenario3.pdf"
);
assert(
  evaluateCustomsReadiness(scenario3Report, scenarioInvoice([scenario3Item])).status === "CUSTOMS_READY",
  "generated wizard HS → CUSTOMS_READY"
);
assert(
  scenario3Report.hsWorkflowSummary?.documentHsStatus === "VALID",
  "wizard-only HS → VALID document status"
);

console.log("\nScenario 4 — invoice HS missing, wizard not run");
const scenario4Item = {
  position_number: 1,
  description: "Unknown part",
  quantity: 1,
  line_total: "2500.00",
  country_of_origin: "DE",
  net_weight: 5,
};
const scenario4 = evaluateLineHsVerification(scenario4Item, 1);
assert(scenario4.verificationStatus === "MISSING", "no invoice HS + no wizard → MISSING");

console.log("\nScenario 5 — different HS, low wizard confidence");
const scenario5Item = {
  position_number: 1,
  description: "Mixed goods",
  quantity: 1,
  line_total: "2500.00",
  hs_code: "39269097",
  wizard_hs_code: "84818081",
  wizard_confidence: 62,
  country_of_origin: "DE",
  net_weight: 5,
};
const scenario5 = evaluateLineHsVerification(scenario5Item, 1);
assert(
  scenario5.verificationStatus === "REVIEW_REQUIRED_LOW_CONFIDENCE",
  "different HS + 62% → REVIEW_REQUIRED_LOW_CONFIDENCE"
);
const scenario5Invoice = scenarioInvoice([scenario5Item]);
const scenario5Report = mapAuditReportToExportReport(scenario5Invoice, baseAudit(), "scenario5.pdf");
assert(
  !hasHighConfidenceHsDiscrepancy(scenario5Report.hsVerificationSummary),
  "low confidence does not flag high-confidence discrepancy"
);
assert(
  evaluateCustomsReadiness(scenario5Report, scenario5Invoice).status === "CUSTOMS_READY",
  "low-confidence mismatch does not downgrade customs readiness"
);

console.log("\nEnterprise export verification columns");
const exportInvoice = scenarioInvoice([
  {
    position_number: 1,
    description: "Part",
    quantity: 1,
    line_total: "2500.00",
    hs_code: "73072980",
    wizard_hs_code: "73072980",
    wizard_confidence: 95,
    country_of_origin: "DE",
    net_weight: 5,
  },
]);
const exportReport = mapAuditReportToExportReport(exportInvoice, baseAudit(), "export.pdf");
const dataset = buildMrnExportDataset(exportReport);
assert(dataset != null, "export dataset built");
if (dataset) {
  assert(MRN_EXPORT_COLUMNS.length === 10, "ten declarant export columns");
  assert(dataset.rows[0].verificationStatus === "Verified", "export verification status label");
  assert(dataset.rows[0].wizardHsCode === "73072980", "export wizard HS column");
}

console.log("\nDocument summary counts");
const summary = buildHsVerificationSummary(exportInvoice);
assert(summary.linesVerified >= 1, "summary counts verified lines");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
