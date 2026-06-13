/**
 * Regression — invoice I26.0515 (Serbia destination, no COO, EU_DESTINATION false positive)
 * Run: npm run test:i26-0515
 */
import { resolveDestinationWithDiagnostics } from "../src/lib/export-auditor/destination-country";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { EU_DESTINATION } from "../src/lib/export-auditor/issue-readiness";
import { ORIGIN_COUNTRIES_NOT_PROVIDED } from "../src/lib/export-auditor/origin-countries-summary";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const I26_OCR: NormalizedInvoice = {
  invoice_number: "I26.0515",
  invoice_date: "2026-01-15",
  exporter: "gomLINE d.o.o., Cesta v Gorice 42, 1000 Ljubljana, Slovenija",
  consignee: "GOMLINE 81 d.o.o.\nJEGRIČKA 9\n21000 NOVI SAD\nSERBIA",
  country: "Slovenia",
  country_code: "SI",
  incoterms: "DAP NOVI SAD",
  currency: "EUR",
  total_value: "4771.55",
  items: [
    {
      description: "Goods line 1",
      hs_code: "38121000",
      quantity: "1",
      unit_price: "4771.55",
      line_total: "4771.55",
      country_of_origin: "",
    },
  ],
};

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: {
      score: 55,
      status: "WARNING",
      warnings: [
        "Destination is within the EU customs territory.",
        "No country of origin detected",
      ],
      errors: [],
    },
    preference_origin: {
      destination_outside_eu: false,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: true,
      required_documents: ["EUR.1"],
    },
    issues: [
      {
        severity: "warning",
        message: "Destination is within the EU customs territory.",
        field: "EU_DESTINATION",
      },
    ],
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

console.log("I26.0515 — destination + origin countries regression\n");

const { invoice: resolved, diagnostics } = resolveDestinationWithDiagnostics(I26_OCR);

console.log("Destination diagnostics:", JSON.stringify(diagnostics, null, 2));

assert(resolved.country_code === "RS", "destinationCountryCode = RS");
assert(diagnostics.destinationCountryCode === "RS", "diagnostics.destinationCountryCode = RS");
assert(diagnostics.isEuDestination === false, "isEuDestination = false");
assert(
  diagnostics.destinationCountrySource === "consignee_country_name" ||
    diagnostics.destinationCountrySource === "consignee_postal_city",
  "destination resolved from consignee"
);
assert(diagnostics.exporterCountry.code === "SI", "exporterCountry = SI (diagnostic only)");

const report = mapAuditReportToExportReport(resolved, minimalAudit(), "I26.0515.pdf");

assert(
  report.invoiceSummary.destinationCountry.includes("Serbia"),
  "UI destination shows Serbia"
);
assert(report.preferenceOrigin.destinationOutsideEu === true, "destinationOutsideEu = true");
assert(
  !report.issues.some((issue) => issue.field === EU_DESTINATION),
  "EU_DESTINATION warning filtered"
);
assert(
  !report.issues.some((issue) =>
    /within the EU customs territory/i.test(issue.message)
  ),
  "no EU customs territory warning in issues"
);

const originDisplay =
  report.invoiceSummary.countriesOfOrigin.length > 0
    ? report.invoiceSummary.countriesOfOrigin.join(", ")
    : ORIGIN_COUNTRIES_NOT_PROVIDED;
assert(originDisplay === ORIGIN_COUNTRIES_NOT_PROVIDED, "Origin Countries = NOT PROVIDED");

const hsRow = report.hsAggregationReport.hsAggregation[0];
if (hsRow) {
  assert(
    hsRow.countriesOfOrigin.length === 0,
    "HS aggregation has no origin countries"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
