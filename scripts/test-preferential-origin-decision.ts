/**
 * Preferential Origin Decision Engine — global rule cases.
 * Run: npm run test:preferential-origin-decision
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import {
  CASE1_MESSAGE,
  CASE2_MESSAGE,
  CASE3_MESSAGE,
  CASE4_MESSAGE,
  evaluatePreferentialOriginDecision,
  HIGH_VALUE_NO_DECLARATION_MESSAGE,
} from "../src/lib/export-auditor/preferential-origin-decision-engine";
import { resolvePreferenceScheme } from "../src/lib/export-auditor/preference-scheme";
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

function pemScheme() {
  return resolvePreferenceScheme("RS", "Serbia");
}

function baseAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 85, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: true,
      required_documents: ["EUR.1"],
    },
    issues: [],
    recommended_actions: [
      "Verify preferential origin",
      "Invoice declaration sufficient",
      "Issue EUR.1 for remaining positions",
    ],
    summary: "Review required.",
  };
}

console.log("Decision engine unit cases (PEM scheme)");
const case1 = evaluatePreferentialOriginDecision({
  preferenceScheme: pemScheme(),
  originDeclarationDetected: true,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 3000,
});
assert(case1.evidenceStatus === "DECLARED", "CASE 1 evidence DECLARED");
assert(case1.invoiceDeclarationSufficient === true, "CASE 1 invoice_declaration_sufficient");
assert(case1.eur1Recommended === false, "CASE 1 eur1_recommended false");
assert(case1.recommendation === CASE1_MESSAGE, "CASE 1 message");

const case2 = evaluatePreferentialOriginDecision({
  preferenceScheme: pemScheme(),
  originDeclarationDetected: false,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 2500,
});
assert(case2.evidenceStatus === "NOT_DECLARED", "CASE 2 evidence NOT_DECLARED");
assert(case2.eur1Recommended === false, "CASE 2 eur1_recommended false");
assert(case2.recommendation === CASE2_MESSAGE, "CASE 2 message");

const case3 = evaluatePreferentialOriginDecision({
  preferenceScheme: pemScheme(),
  originDeclarationDetected: false,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 7500,
});
assert(case3.evidenceStatus === "NOT_DECLARED", "CASE 3 high value no declaration NOT_DECLARED");
assert(case3.eur1Recommended === false, "CASE 3 eur1_recommended false");
assert(case3.recommendation === HIGH_VALUE_NO_DECLARATION_MESSAGE, "CASE 3 no-declaration message");

const case3b = evaluatePreferentialOriginDecision({
  preferenceScheme: pemScheme(),
  originDeclarationDetected: true,
  authorisedExporterDetected: false,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 7500,
});
assert(case3b.evidenceStatus === "UNVERIFIED", "CASE 3b high value declaration UNVERIFIED");
assert(case3b.recommendation === CASE3_MESSAGE, "CASE 3b unverified message");

const case4 = evaluatePreferentialOriginDecision({
  preferenceScheme: pemScheme(),
  originDeclarationDetected: true,
  authorisedExporterDetected: true,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 7500,
});
assert(case4.evidenceStatus === "DECLARED", "CASE 4 evidence DECLARED");
assert(case4.recommendation === CASE4_MESSAGE, "CASE 4 message");

console.log("\nMapped report — CASE 2 low value (no COO inference)");
const lowValueInvoice: NormalizedInvoice = {
  invoice_number: "LOW-6000",
  exporter: "EU Maker",
  consignee: "Buyer RS",
  country: "Serbia",
  country_code: "RS",
  currency: "EUR",
  total_value: "2500.00",
  items: [
    {
      position_number: 1,
      description: "Part",
      quantity: 1,
      line_total: "2500.00",
      country_of_origin: "SI",
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
};
const lowReport = mapAuditReportToExportReport(lowValueInvoice, baseAudit(), "low.pdf");
assert(lowReport.preferenceOrigin.preferenceScheme === "PEM", "Serbia → PEM scheme");
assert(
  lowReport.preferenceOrigin.applicableProofDocuments.includes("Invoice Declaration"),
  "PEM applicable proofs include Invoice Declaration"
);
assert(
  lowReport.preferenceOrigin.preferentialOriginStatus === "NOT_DECLARED" ||
    lowReport.preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT",
  "low value not declared / non-preferential export"
);
assert(
  lowReport.preferenceOrigin.lineItems[0]?.preferential_origin === "NOT_DECLARED",
  "SI country_of_origin alone does not confirm line preference"
);
assert(!lowReport.preferenceOrigin.invoiceDeclarationSufficient, "no declaration sufficient panel data");
assert(
  !lowReport.recommendedActions.some((a) =>
    /verify preferential origin|invoice declaration sufficient|eur\.?\s*1/i.test(a.description)
  ),
  "CASE 2 filters spurious recommendations"
);

console.log("\nMapped report — CASE 3 high value");
const highValueInvoice: NormalizedInvoice = {
  ...lowValueInvoice,
  invoice_number: "HIGH-6000",
  total_value: "7500.00",
  items: [{ ...lowValueInvoice.items![0], line_total: "7500.00" }],
};
const highReport = mapAuditReportToExportReport(highValueInvoice, baseAudit(), "high.pdf");
assert(highReport.preferenceOrigin.eur1Recommended === false, "CASE 3 eur1 never recommended");
assert(
  highReport.preferenceOrigin.evidenceStatus === "NOT_DECLARED" ||
    highReport.preferenceOrigin.recommendation.includes("LTSD") ||
    highReport.preferenceOrigin.recommendation.includes("Origin evidence"),
  "CASE 3 evidence or recommendation references missing origin evidence"
);
assert(
  !highReport.recommendedActions.some((a) => /verify preferential origin/i.test(a.description)),
  "CASE 3 still filters verify preferential origin"
);

console.log("\nMapped report — CASE 4 authorised exporter + declaration (Iceland PEM)");
const declaredInvoice = enrichInvoiceDocument(
  {
    invoice_number: "2602002968",
    exporter: "UNIOR d.d.",
    consignee: "FAGKAUP EHF, Iceland",
    country: "Iceland",
    country_code: "IS",
    currency: "EUR",
    total_value: "1610.70",
    items: [
      {
        position_number: 1,
        description: "Tools",
        quantity: 1,
        line_total: "1610.70",
      },
    ],
    footer_text:
      "The exporter of the products covered by this document declares that these products are of EU preferential origin.\nCUSTOMS AUTHORIZATION NO. SI/105/00",
    shipment_summary: {
      package_count: 3,
      gross_weight_total: 78,
      gross_weight_unit: "kg",
      net_weight_total: 62,
      net_weight_unit: "kg",
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  null
);
const case4Report = mapAuditReportToExportReport(declaredInvoice, baseAudit(), "unior.pdf");
assert(case4Report.preferenceOrigin.preferenceScheme === "PEM", "Iceland → PEM scheme");
assert(case4Report.preferenceOrigin.preferentialOriginStatus === "CONFIRMED", "CASE 4 CONFIRMED");
assert(case4Report.preferenceOrigin.evidenceStatus === "DECLARED", "CASE 4 evidence DECLARED");
assert(case4Report.preferenceOrigin.invoiceDeclarationSufficient === true, "CASE 4 declaration sufficient");
assert(case4Report.preferenceOrigin.recommendation === CASE4_MESSAGE, "CASE 4 authorised exporter message");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
