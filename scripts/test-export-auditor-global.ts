/**
 * Global export-auditor corrections — gross weight, MRN lines, disposition origin.
 * Run: npm run test:export-auditor-global
 */

import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { runHsAggregationEngine } from "../src/lib/export-auditor/hs-aggregation-engine";
import { getReadinessVerdict } from "../src/lib/export-auditor/readiness-score";
import { MISSING_GROSS_WEIGHT } from "../src/lib/export-auditor/shipment-readiness";
import {
  extractFooterShipmentMetrics,
  extractGrossWeight,
  hasInvoiceGrossWeight,
  resolveInvoiceGrossWeight,
} from "../src/lib/export-auditor/shipment-summary-extractor";
import {
  deriveDispositionOriginSummary,
  sanitizeDispositionOriginText,
} from "../src/lib/export-auditor/customs-disposition-summary";
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
    readiness: { score: 67, status: "WARNING", warnings: ["Missing gross weight"], errors: [] },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: false,
    },
    issues: [
      {
        severity: "WARNING",
        code: MISSING_GROSS_WEIGHT,
        message: "Gross shipment weight is missing.",
      },
    ],
    recommended_actions: [],
    summary: "Review required.",
    ...overrides,
  };
}

async function main() {
console.log("Gross weight label patterns");
assert(extractGrossWeight("Gross: 78 kg").gross_weight_total === 78, "Gross: 78 kg");
assert(extractGrossWeight("Gross Weight: 120").gross_weight_total === 120, "Gross Weight: 120");
assert(extractGrossWeight("Bruto: 55 kg").gross_weight_total === 55, "Bruto: 55 kg");
assert(extractGrossWeight("Bruto/Gross = 78").gross_weight_total === 78, "Bruto/Gross = 78");

console.log("\nUNIOR footer — Neto/Nett unit must not match Tara line");
const uniorFooter =
  "Bruto/Gross: 78\nNeto/Nett: 62\nTara/Tare: 16\nKoli/Colli: 3\nPalete/Paletts: 1";
const uniorMetrics = extractFooterShipmentMetrics(uniorFooter);
assert(uniorMetrics.gross_weight_total === 78, "UNIOR gross = 78");
assert(uniorMetrics.net_weight_total === 62, "UNIOR net = 62");
assert(uniorMetrics.net_weight_unit === "kg", `UNIOR net unit = kg (got ${uniorMetrics.net_weight_unit})`);
assert(uniorMetrics.package_count === 3, "UNIOR colli = 3");
assert(uniorMetrics.pallet_count === 1, "UNIOR pallets = 1");

console.log("\nGross weight only on invoice footer");
const footerOnlyInvoice: NormalizedInvoice = {
  invoice_number: "FOOT-GW",
  exporter: "Exporter d.o.o.",
  consignee: "Buyer Ltd",
  country: "Iceland",
  country_code: "IS",
  currency: "EUR",
  total_value: "500.00",
  items: [{ position_number: 1, description: "Part", quantity: 1, line_total: "500.00" }],
  footer_text: "Bruto/Gross = 78\nNetto/Nett = 62",
  shipment_summary: {
    package_count: 1,
    gross_weight_total: null,
    gross_weight_unit: null,
    net_weight_total: 62,
    net_weight_unit: "kg",
    package_type: "COLLI",
    pallet_dimensions: null,
    pallet_count: null,
  },
};
assert(hasInvoiceGrossWeight(footerOnlyInvoice), "footer gross detected via resolver");
assert(resolveInvoiceGrossWeight(footerOnlyInvoice).gross_weight_total === 78, "resolved gross = 78");

const footerReport = mapAuditReportToExportReport(
  footerOnlyInvoice,
  baseAudit(),
  "footer-gross.pdf"
);
assert(
  !footerReport.issues.some((issue) => issue.field === MISSING_GROSS_WEIGHT),
  "no MISSING_GROSS_WEIGHT when footer gross present"
);
assert(footerReport.shipmentSummary.grossWeightTotal === 78, "report shipment gross = 78");

console.log("\nMRN total goods lines (>30 parsed lines, no HS codes)");
const manyLineItems = Array.from({ length: 38 }, (_, index) => ({
  position_number: index + 1,
  description: `Product line ${index + 1}`,
  quantity: 1,
  line_total: "10.00",
}));
const largeInvoice: NormalizedInvoice = {
  invoice_number: "MULTI-38",
  exporter: "Bulk Exporter",
  consignee: "Bulk Buyer",
  country: "Serbia",
  country_code: "RS",
  currency: "EUR",
  total_value: "380.00",
  items: manyLineItems,
};
const aggregation = runHsAggregationEngine(largeInvoice);
assert(
  aggregation.mrn_summary.total_goods_lines === 38,
  `TOTAL_GOODS_LINES = 38 (got ${aggregation.mrn_summary.total_goods_lines})`
);

const largeReport = mapAuditReportToExportReport(largeInvoice, baseAudit({ issues: [] }), "38-lines.pdf");
assert(
  largeReport.hsAggregationReport.mrnSummary.totalGoodsLines === 38,
  "mapped MRN summary totalGoodsLines = 38"
);

console.log("\nMixed preferential origin disposition summary");
const mixedPrefInvoice: NormalizedInvoice = {
  invoice_number: "MIX-PREF",
  exporter: "EU Supplier",
  consignee: "Importer",
  country: "Serbia",
  country_code: "RS",
  currency: "EUR",
  total_value: "3000.00",
  origin_declaration_text: "Position 1 is of preferential origin.",
  items: [
    {
      position_number: 1,
      description: "EU part",
      quantity: 1,
      line_total: "1500.00",
      country_of_origin: "DE",
      hs_code: "84713000",
    },
    {
      position_number: 2,
      description: "CN part",
      quantity: 1,
      line_total: "1500.00",
      country_of_origin: "CN",
      hs_code: "84713000",
    },
  ],
  shipment_summary: {
    package_count: 1,
    gross_weight_total: 40,
    gross_weight_unit: "kg",
    net_weight_total: 35,
    net_weight_unit: "kg",
    package_type: "COLLI",
    pallet_dimensions: null,
    pallet_count: null,
  },
};
const mixedReport = mapAuditReportToExportReport(mixedPrefInvoice, baseAudit({ issues: [] }), "mixed-pref.pdf");
const mixedSummary = deriveDispositionOriginSummary(mixedReport.preferenceOrigin, mixedPrefInvoice);
assert(
  mixedSummary.originStatusLine === "Origin Status: Mixed Origin Goods",
  "mixed origin status line"
);
assert(mixedSummary.preferentialOriginLine === "Preferential Origin: Mixed", "preferential origin mixed");
assert(
  !mixedReport.customsDisposition.includes("Country of Origin: N/A"),
  "disposition excludes Country of Origin: N/A"
);
assert(
  mixedReport.customsDisposition.includes("Mixed Origin Goods") ||
    mixedReport.customsDisposition.includes("Preferential Origin: Mixed"),
  "disposition shows mixed origin summary"
);

const sanitized = sanitizeDispositionOriginText(
  "EXPORT DISPOSITION\nCountry of Origin: N/A\nStatus: OK",
  mixedSummary
);
assert(!sanitized.includes("Country of Origin: N/A"), "sanitizer removes N/A origin line");

console.log("\nInvoice 2602002968 scenario");
const FIXTURE_PATH = path.join(__dirname, "fixtures", "2602002968-ocr.json");
const PDF_PATH =
  process.env.GOLDEN_PDF_2602002968 ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\2602002968.pdf";

if (fs.existsSync(FIXTURE_PATH)) {
  const rawInvoice = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
  let pdfText = "";
  if (fs.existsSync(PDF_PATH)) {
    pdfText = await extractPdfText(fs.readFileSync(PDF_PATH));
  } else {
    pdfText = [rawInvoice.footer_text, rawInvoice.vat_article].filter(Boolean).join("\n");
  }
  const invoice = enrichInvoiceDocument(rawInvoice, pdfText);
  const report = mapAuditReportToExportReport(
    invoice,
    {
      audit_status: "WARNING",
      readiness: {
        score: 67,
        status: "WARNING",
        warnings: [
          "No HS codes detected",
          "No country of origin detected",
          "Missing gross weight",
          "Missing package count",
          "No origin declaration found",
        ],
        errors: [],
      },
      preference_origin: {
        destination_outside_eu: true,
        origin_declaration_found: false,
        authorised_exporter_found: false,
        eur1_recommended: true,
        required_documents: ["EUR.1"],
      },
      issues: [
        { severity: "WARNING", code: "MISSING_HS_CODE", message: "No HS codes detected on invoice." },
        {
          severity: "WARNING",
          code: "MISSING_COUNTRY_OF_ORIGIN",
          message: "Country of origin is missing on invoice lines.",
        },
        { severity: "WARNING", code: MISSING_GROSS_WEIGHT, message: "Gross shipment weight is missing." },
        { severity: "WARNING", code: "MISSING_PACKAGE_COUNT", message: "Package count is missing." },
        {
          severity: "WARNING",
          code: "NO_ORIGIN_DECLARATION",
          message: "No origin declaration found on invoice",
        },
        {
          severity: "WARNING",
          code: "MISSING_ORIGIN_DECLARATION",
          message: "Origin declaration missing",
        },
      ],
      recommended_actions: ["Verify preferential origin", "Assign HS codes manually"],
      summary:
        "Invoice requires review before export declaration, preferential origin has not been confirmed.",
    },
    "2602002968.pdf"
  );

  assert(
    !report.issues.some((issue) => issue.field === MISSING_GROSS_WEIGHT),
    "2602002968 no gross weight warning"
  );
  assert(report.shipmentSummary.grossWeightTotal === 78, "2602002968 gross = 78");
  assert(
    report.preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN",
    "preferential origin MIXED_ORIGIN"
  );
  assert(report.preferenceOrigin.originDeclarationFound === true, "origin declaration detected");
  assert(
    report.readinessScore >= 85,
    `score >= 85 (got ${report.readinessScore})`
  );
  assert(
    getReadinessVerdict(report).exportStatus === "Ready With Review",
    `status Ready With Review (got "${getReadinessVerdict(report).exportStatus}")`
  );
  assert(
    !report.customsDisposition.includes("Country of Origin: N/A"),
    "2602002968 disposition has no N/A origin"
  );
} else {
  console.log("  (2602002968 fixture skipped — file not found)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
