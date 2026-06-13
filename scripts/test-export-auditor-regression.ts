/**
 * Regression tests — mixed-origin, proforma, and undeclared preferential origin.
 * Run: npm run test:export-auditor-regression
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { NON_PREFERENTIAL_EXPORT_STATUS_LABEL } from "../src/lib/export-auditor/mixed-origin-status-engine";
import { enrichInvoiceShipmentData } from "../src/lib/export-auditor/shipment-summary-extractor";
import { getReadinessVerdict } from "../src/lib/export-auditor/readiness-score";
import { hasVatExemptionArticle } from "../src/lib/export-auditor/vat-article-detection";
import {
  MISSING_NET_WEIGHT,
  MISSING_NET_WEIGHT_MESSAGE,
} from "../src/lib/export-auditor/shipment-readiness";
import { MISSING_VAT_ARTICLE } from "../src/lib/export-auditor/issue-readiness";
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

function baseAudit(overrides: Partial<AuditReportResponse> = {}): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 82, status: "WARNING", warnings: [], errors: [] },
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
    summary: "Invoice requires review before export declaration.",
    ...overrides,
  };
}

console.log("Mixed-origin invoice (EU + CN) without preference declaration");
const mixedOriginInvoice: NormalizedInvoice = enrichInvoiceShipmentData({
  invoice_number: "MIX-001",
  exporter: "EU Supplier GmbH",
  consignee: "Importer d.o.o.",
  country: "Serbia",
  country_code: "RS",
  incoterms: "DAP",
  currency: "EUR",
  total_value: "2500.00",
  items: [
    {
      position_number: 1,
      description: "EU component",
      quantity: 10,
      line_total: "1500.00",
      hs_code: "84713000",
      country_of_origin: "DE",
    },
    {
      position_number: 2,
      description: "CN component",
      quantity: 5,
      line_total: "1000.00",
      hs_code: "84713000",
      country_of_origin: "CN",
    },
  ],
  shipment_summary: {
    package_count: 2,
    package_type: "COLLI",
    gross_weight_total: 120,
    gross_weight_unit: "kg",
    net_weight_total: null,
    net_weight_unit: null,
    pallet_dimensions: null,
  },
});

const mixedReport = mapAuditReportToExportReport(
  mixedOriginInvoice,
  baseAudit(),
  "mixed-origin.pdf"
);

assert(
  mixedReport.preferenceOrigin.lineItems.every((line) => line.preferential_origin === "NOT_DECLARED"),
  "mixed-origin lines use NOT_DECLARED when no preference declaration"
);
assert(mixedReport.preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT", "mixed-origin document status NON_PREFERENTIAL_EXPORT");
assert(
  mixedReport.preferenceOrigin.status === NON_PREFERENTIAL_EXPORT_STATUS_LABEL,
  "preference status = Non-Preferential Export Goods"
);
assert(mixedReport.preferenceOrigin.eur1Recommended === false, "EUR.1 not recommended when undeclared");
assert(
  (mixedReport.preferenceOrigin.requiredDocuments ?? []).length === 0,
  "no required EUR.1 documents when undeclared"
);
assert(
  !mixedReport.recommendedActions.some((action) =>
    /verify preferential origin|invoice declaration sufficient|eur\.?\s*1/i.test(action.description)
  ),
  "mixed-origin filters preferential/EUR.1 recommendations"
);
const mixedNetInfo = mixedReport.issues.find((issue) => issue.field === MISSING_NET_WEIGHT);
assert(mixedNetInfo?.type === "info", "missing net weight is info-level only");
assert(
  mixedNetInfo?.message === MISSING_NET_WEIGHT_MESSAGE,
  "missing net weight uses documentation recommendation message"
);

console.log("\nProforma invoice with VAT exemption wording");
const proformaInvoice: NormalizedInvoice = enrichInvoiceShipmentData({
  invoice_number: "PRO-2026-01",
  exporter: "Exporter d.o.o.",
  consignee: "Buyer Ltd",
  country: "United Kingdom",
  country_code: "GB",
  incoterms: "FCA",
  currency: "EUR",
  total_value: "890.00",
  vat_article: "Proforma invoice. VAT exempt export supply per Article 146(1)(a).",
  items: [
    {
      position_number: 1,
      description: "Sample goods",
      quantity: 1,
      line_total: "890.00",
      hs_code: "39269097",
      country_of_origin: "SI",
      net_weight: 12.5,
    },
  ],
  shipment_summary: {
    package_count: 1,
    package_type: "COLLI",
    gross_weight_total: 14,
    gross_weight_unit: "kg",
    net_weight_total: null,
    net_weight_unit: null,
    pallet_dimensions: null,
  },
});

assert(hasVatExemptionArticle(proformaInvoice), "proforma VAT exemption detected");
const proformaReport = mapAuditReportToExportReport(
  proformaInvoice,
  baseAudit({
    issues: [
      {
        severity: "WARNING",
        code: MISSING_VAT_ARTICLE,
        message: "VAT article is missing.",
      },
    ],
    recommended_actions: ["Request missing VAT article"],
  }),
  "proforma.pdf"
);
assert(
  !proformaReport.issues.some((issue) => issue.field === MISSING_VAT_ARTICLE),
  "proforma suppresses MISSING_VAT_ARTICLE when exemption detected"
);
assert(
  proformaReport.shipmentSummary.netWeightTotal === 12.5,
  "proforma net weight derived from line items"
);
assert(
  !proformaReport.issues.some((issue) => issue.field === MISSING_NET_WEIGHT),
  "proforma has no missing net weight info when line weights present"
);

console.log("\nInvoice without preferential-origin declarations");
const undeclaredInvoice: NormalizedInvoice = enrichInvoiceShipmentData({
  invoice_number: "UNDECL-44",
  exporter: "Maker SA",
  consignee: "Client AG",
  country: "Switzerland",
  country_code: "CH",
  incoterms: "EXW",
  currency: "EUR",
  total_value: "4200.00",
  items: [
    {
      position_number: 1,
      description: "Industrial valve",
      quantity: 4,
      line_total: "4200.00",
      hs_code: "84818099",
      country_of_origin: "FR",
    },
  ],
  shipment_summary: {
    package_count: 1,
    package_type: "PALLET",
    gross_weight_total: 55,
    gross_weight_unit: "kg",
    net_weight_total: 48,
    net_weight_unit: "kg",
    pallet_dimensions: null,
  },
});

const undeclaredReport = mapAuditReportToExportReport(
  undeclaredInvoice,
  baseAudit({ readiness: { score: 91, status: "READY", warnings: [], errors: [] } }),
  "undeclared.pdf"
);

assert(
  undeclaredReport.preferenceOrigin.originDeclarationFound === false,
  "undeclared invoice has no origin declaration"
);
assert(
  undeclaredReport.preferenceOrigin.lineItems[0]?.preferential_origin === "NOT_DECLARED",
  "undeclared line with country of origin is NOT_DECLARED"
);
assert(
  undeclaredReport.preferenceOrigin.status === NON_PREFERENTIAL_EXPORT_STATUS_LABEL,
  "status label Non-Preferential Export Goods"
);
const undeclaredVerdict = getReadinessVerdict(undeclaredReport);
assert(
  undeclaredVerdict.exportStatus === "Ready" && undeclaredVerdict.score >= 90,
  `score ${undeclaredVerdict.score} maps to Ready (got "${undeclaredVerdict.exportStatus}")`
);
assert(
  undeclaredVerdict.exportStatus !== "Needs Review",
  "high score undeclared invoice is not Needs Review"
);

console.log("\nScore tier consistency");
const score80Report = mapAuditReportToExportReport(
  undeclaredInvoice,
  baseAudit({ readiness: { score: 84, status: "WARNING", warnings: [], errors: [] } }),
  "score84.pdf"
);
assert(
  getReadinessVerdict(score80Report).exportStatus === "Ready With Review",
  "score 84 → Ready With Review"
);
const score79Report = mapAuditReportToExportReport(
  undeclaredInvoice,
  baseAudit({ readiness: { score: 79, status: "WARNING", warnings: [], errors: [] } }),
  "score79.pdf"
);
assert(
  getReadinessVerdict(score79Report).exportStatus === "Needs Review",
  "score 79 → Needs Review"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
