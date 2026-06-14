/**
 * Golden dataset anomaly detection unit tests.
 * Run: npm run test:golden-dataset-anomalies
 */

import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { detectGoldenAnomalies } from "../src/lib/export-auditor/golden-dataset";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function baseAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 75, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

console.log("Golden anomaly detection");

console.log("\nPHYSICAL_WEIGHT_CONTRADICTION");
const weightInvoice: NormalizedInvoice = enrichInvoiceDocument(
  {
    invoice_number: "WT-ANOM",
    exporter: "X",
    consignee: "Y",
    country: "Serbia",
    country_code: "RS",
    incoterms: "DAP",
    total_value_numeric: 100,
    items: [{ hs_code: "84818073", line_total: 100, country_of_origin: "DE" }],
    shipment_summary: {
      package_count: 1,
      gross_weight_total: 100,
      gross_weight_unit: "kg",
      gross_weight_source: "DOCUMENT",
      net_weight_total: 150,
      net_weight_unit: "kg",
      net_weight_source: "DOCUMENT",
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  null
);
const weightReport = mapAuditReportToExportReport(weightInvoice, baseAudit(), "wt.pdf");
const weightAnomalies = detectGoldenAnomalies(weightReport, weightInvoice);
assert(
  weightAnomalies.some((a) => a.code === "PHYSICAL_WEIGHT_CONTRADICTION"),
  "net > gross detected"
);

console.log("\nHS_CLASSIFICATION_DISCREPANCY");
const hsInvoice: NormalizedInvoice = enrichInvoiceDocument(
  {
    invoice_number: "HS-ANOM",
    exporter: "X",
    consignee: "Y",
    country: "Serbia",
    country_code: "RS",
    incoterms: "DAP",
    total_value_numeric: 2500,
    items: [
      {
        hs_code: "39269097",
        wizard_hs_code: "84818081",
        wizard_confidence: 94,
        line_total: 2500,
        country_of_origin: "DE",
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
const hsReport = mapAuditReportToExportReport(hsInvoice, baseAudit(), "hs.pdf");
assert(
  detectGoldenAnomalies(hsReport, hsInvoice).some((a) => a.code === "HS_CLASSIFICATION_DISCREPANCY"),
  "high-confidence HS discrepancy detected"
);

console.log("\nORIGIN_DECLARATION_CONTRADICTION");
const hafeleInvoice: NormalizedInvoice = enrichInvoiceDocument(
  {
    invoice_number: "HF-001",
    exporter: "Häfele",
    consignee: "Buyer BA",
    country: "Bosnia and Herzegovina",
    country_code: "BA",
    currency: "EUR",
    total_value_numeric: 5000,
    incoterms: "DAP",
    vat_article: "Positions 5, 6, 8, 11, 12 and 16 are of preferential origin.",
    items: Array.from({ length: 10 }, (_, i) => ({
      position_number: i + 1,
      description: `Item ${i + 1}`,
      quantity: 1,
      line_total: 100,
      country_of_origin: i + 1 <= 5 ? "DE" : "CN",
      hs_code: "83024200",
    })),
    shipment_summary: {
      package_count: 2,
      gross_weight_total: 120,
      gross_weight_unit: "kg",
      net_weight_total: 100,
      net_weight_unit: "kg",
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  null
);
const hafeleReport = mapAuditReportToExportReport(hafeleInvoice, baseAudit(), "hf.pdf");
assert(
  detectGoldenAnomalies(hafeleReport, hafeleInvoice).some(
    (a) => a.code === "ORIGIN_DECLARATION_CONTRADICTION"
  ),
  "position-specific partial origin detected"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
