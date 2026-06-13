/**
 * Origin Countries UX — declared EU vs explicit COO vs NOT PROVIDED.
 * Run: npx tsx scripts/test-origin-countries-ux.ts
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  ORIGIN_COUNTRIES_NOT_PROVIDED,
  ORIGIN_EU_DECLARED,
  formatOriginCountriesList,
  resolveOriginCountriesDisplay,
  buildOriginCountriesContext,
} from "../src/lib/export-auditor/origin-countries-summary";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import type { PreferenceOriginAnalysis } from "../src/lib/export-auditor/types";

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
    readiness: { score: 85, status: "WARNING", warnings: [], errors: [] },
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

const declaredContext: PreferenceOriginAnalysis = {
  destinationOutsideEu: true,
  preferenceScheme: "PEM",
  schemeLabel: "PEM",
  applicableProofDocuments: [],
  preferenceWorkflowActive: true,
  preferentialOriginStatus: "CONFIRMED",
  invoiceDeclarationSufficient: true,
  evidenceStatus: "DECLARED",
  eur1Recommended: false,
  originDeclarationFound: true,
  authorisedExporterDetected: true,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  rexRegistrationNumber: null,
  authorisedExporterNumber: "FR006130/0032",
  status: "Confirmed",
  recommendation: "Declared.",
  requiredDocuments: [],
  lineItems: [
    {
      position_number: 1,
      country_of_origin: "",
      preferential_origin: "YES",
      preference_reason: "Declared",
      preference_source: "invoice_declaration",
    },
  ],
  declarationsDetected: [],
  preferentialOriginSummary: "Preferential.",
  mixedOrigin: false,
  mixedOriginTotals: null,
  preferentialAllocation: null,
};

console.log("Case A: Origin Declaration YES, COO missing → EU (Declared)");
const noCooInvoice: NormalizedInvoice = {
  invoice_number: "DECL-1",
  currency: "EUR",
  total_value: "1000",
  country_code: "RS",
  items: [
    {
      position_number: 1,
      description: "Widget",
      quantity: 1,
      line_total: "1000",
      hs_code: "84713000",
    },
  ],
  origin_declaration_text:
    "The exporter declares that these products are of EU preferential origin.",
  authorised_exporter_number: "FR006130/0032",
};
const caseAContext = buildOriginCountriesContext(declaredContext);
const caseADisplay = resolveOriginCountriesDisplay(noCooInvoice.items, caseAContext);
assert(caseADisplay[0] === ORIGIN_EU_DECLARED, `resolveOriginCountriesDisplay → ${ORIGIN_EU_DECLARED}`);

const caseAReport = mapAuditReportToExportReport(
  noCooInvoice,
  buildAudit({
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: true,
      authorised_exporter_found: true,
      eur1_recommended: false,
    },
  }),
  "decl.pdf"
);
assert(
  formatOriginCountriesList(caseAReport.invoiceSummary.countriesOfOrigin) === ORIGIN_EU_DECLARED,
  "invoice summary shows EU (Declared)"
);
assert(
  formatOriginCountriesList(caseAReport.hsAggregationReport.mrnSummary.countriesOfOrigin) ===
    ORIGIN_EU_DECLARED,
  "MRN summary shows EU (Declared)"
);

console.log("\nCase B: COO=SI → SI");
const siInvoice: NormalizedInvoice = {
  ...noCooInvoice,
  invoice_number: "SI-1",
  items: [
    {
      position_number: 1,
      description: "Widget",
      quantity: 1,
      line_total: "1000",
      hs_code: "84713000",
      country_of_origin: "SI",
    },
  ],
};
const caseBDisplay = resolveOriginCountriesDisplay(siInvoice.items, caseAContext);
assert(caseBDisplay[0] === "SI", "explicit COO SI wins over declared EU");

const caseBReport = mapAuditReportToExportReport(
  siInvoice,
  buildAudit({
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: true,
      authorised_exporter_found: true,
      eur1_recommended: false,
    },
  }),
  "si.pdf"
);
assert(
  formatOriginCountriesList(caseBReport.invoiceSummary.countriesOfOrigin) === "SI",
  "invoice summary shows SI"
);

console.log("\nCase C: COO missing, Origin Declaration NO → NOT PROVIDED");
const noDeclContext = buildOriginCountriesContext({
  ...declaredContext,
  originDeclarationFound: false,
  preferentialOriginStatus: "NOT_DECLARED",
  lineItems: [
    {
      position_number: 1,
      country_of_origin: "",
      preferential_origin: "NOT_DECLARED",
      preference_reason: "",
      preference_source: "none",
    },
  ],
});
const caseCDisplay = resolveOriginCountriesDisplay(noCooInvoice.items, noDeclContext);
assert(caseCDisplay.length === 0, "no COO and no declaration → empty list");
assert(
  formatOriginCountriesList(caseCDisplay) === ORIGIN_COUNTRIES_NOT_PROVIDED,
  "formatOriginCountriesList → NOT PROVIDED"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
