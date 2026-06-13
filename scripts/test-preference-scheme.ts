/**
 * Preference scheme resolution by destination country.
 * Run: npm run test:preference-scheme
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  NO_PREFERENCE_MESSAGE,
  evaluatePreferentialOriginDecision,
} from "../src/lib/export-auditor/preferential-origin-decision-engine";
import {
  detectRexRegistration,
  detectStatementOnOrigin,
  resolvePreferenceScheme,
} from "../src/lib/export-auditor/preference-scheme";
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
    preference_origin: {
      destination_outside_eu: false,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: false,
    },
    issues: [],
    recommended_actions: ["Verify preferential origin", "Issue EUR.1"],
    summary: "Review.",
  };
}

console.log("Scheme resolution by destination");
const pem = resolvePreferenceScheme("IS", "Iceland");
assert(pem.scheme === "PEM", "Iceland → PEM");
assert(pem.applicableProofDocuments.includes("EUR.1"), "PEM includes EUR.1");
assert(pem.applicableProofDocuments.includes("Invoice Declaration"), "PEM includes Invoice Declaration");

const uk = resolvePreferenceScheme("GB", "United Kingdom");
assert(uk.scheme === "UK", "GB → UK");
assert(
  uk.applicableProofDocuments.join() === "Statement on Origin",
  "UK proof is Statement on Origin only"
);

const rex = resolvePreferenceScheme("CA", "Canada");
assert(rex.scheme === "REX", "Canada → REX");
assert(rex.applicableProofDocuments.includes("REX registration"), "REX includes REX registration");

const none = resolvePreferenceScheme("CN", "China");
assert(none.scheme === "NO_PREFERENCE", "China → NO_PREFERENCE");
assert(!none.workflowActive, "NO_PREFERENCE ignores workflow");

const intraEu = resolvePreferenceScheme("DE", "Germany");
assert(intraEu.scheme === "NO_PREFERENCE", "Intra-EU Germany → NO_PREFERENCE");

console.log("\nStatement on Origin detection");
assert(
  detectStatementOnOrigin("The exporter provides a Statement on Origin for these goods."),
  "detects Statement on Origin phrase"
);
assert(
  detectRexRegistration("REX No DE123456789012345") === "DE123456789012345",
  "detects REX registration number"
);

console.log("\nMapped reports by scheme");
const pemInvoice: NormalizedInvoice = {
  invoice_number: "PEM-1",
  exporter: "SI Exporter",
  consignee: "Buyer",
  country: "Serbia",
  country_code: "RS",
  currency: "EUR",
  total_value: "1000",
  items: [{ position_number: 1, description: "Goods", quantity: 1, line_total: "1000" }],
};
const pemReport = mapAuditReportToExportReport(pemInvoice, baseAudit(), "pem.pdf");
assert(pemReport.preferenceOrigin.preferenceScheme === "PEM", "mapped RS → PEM");
assert(pemReport.preferenceOrigin.preferenceWorkflowActive === true, "PEM workflow active");

const ukInvoice: NormalizedInvoice = {
  ...pemInvoice,
  country: "United Kingdom",
  country_code: "GB",
  footer_text: "Statement on Origin: goods originate in the European Union.",
};
const ukReport = mapAuditReportToExportReport(ukInvoice, baseAudit(), "uk.pdf");
assert(ukReport.preferenceOrigin.preferenceScheme === "UK", "mapped GB → UK");
assert(ukReport.preferenceOrigin.statementOnOriginDetected === true, "UK statement detected");
assert(ukReport.preferenceOrigin.eur1Recommended === false, "UK never recommends EUR.1");
assert(ukReport.preferenceOrigin.preferentialOriginStatus === "CONFIRMED", "UK statement → CONFIRMED");

const cnInvoice: NormalizedInvoice = {
  ...pemInvoice,
  country: "China",
  country_code: "CN",
};
const cnReport = mapAuditReportToExportReport(cnInvoice, baseAudit(), "cn.pdf");
assert(cnReport.preferenceOrigin.preferenceScheme === "NO_PREFERENCE", "mapped CN → NO_PREFERENCE");
assert(cnReport.preferenceOrigin.recommendation === NO_PREFERENCE_MESSAGE, "NO_PREFERENCE message");
assert(
  !cnReport.recommendedActions.some((a) => /eur\.?\s*1|verify preferential origin/i.test(a.description)),
  "NO_PREFERENCE filters preference recommendations"
);

const noPrefDecision = evaluatePreferentialOriginDecision({
  preferenceScheme: resolvePreferenceScheme("US"),
  originDeclarationDetected: false,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 9000,
});
assert(noPrefDecision.eur1Recommended === false, "NO_PREFERENCE never recommends EUR.1");
assert(noPrefDecision.caseId === 0, "NO_PREFERENCE case id 0");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
