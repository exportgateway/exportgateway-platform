/**
 * Regression — invoice 70399 (EL-CAR → PROFI Kosovo)
 * Run: npm run test:golden-70399
 */
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { extractHsCodes } from "../src/lib/export-auditor/invoice-fields";
import {
  extractFooterShipmentMetrics,
  extractShipmentSummary,
} from "../src/lib/export-auditor/shipment-summary-extractor";
import { extractTabularHsCodes } from "../src/lib/export-auditor/tabular-hs-extractor";
import { extractTabularShipmentMetrics } from "../src/lib/export-auditor/tabular-shipment-extractor";
import { applyParserOcrCrosscheck, PARSER_MAPPING_FAILURE } from "../src/lib/export-auditor/parser-ocr-crosscheck";
import { evaluateShipmentReadiness, MISSING_GROSS_WEIGHT, MISSING_NET_WEIGHT, MISSING_PACKAGE_COUNT } from "../src/lib/export-auditor/shipment-readiness";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const EL_CAR_CORPUS = `
Invoice No. 70399
S.C. EL-CAR S.R.L
PROFI KOSOVA SH. P. K
Prishtina
Kosovo
Incoterms: CPT
Total invoice value: 2.595,25 EUR

Pos. HS Code UM Qty Unit price Amount
1 731210810080 M 1225 1.17 1433.30
2 731210810080 M 1000 0.93 930.00

Number of packages Net weight Gross weight
Nr. de colete Greut. neta Greut. bruta
1 770 850
`;

const INVOICE: NormalizedInvoice = {
  invoice_number: "70399",
  invoice_date: "2026-01-15",
  exporter: "S.C. EL-CAR S.R.L",
  consignee: "PROFI KOSOVA SH. P. K\nPrishtina\nKosovo",
  country: "Kosovo",
  country_code: "XK",
  incoterms: "CPT",
  currency: "EUR",
  total_value: "2595.25",
  ocr_text: EL_CAR_CORPUS,
  items: [
    {
      description: "Steel wire products line 1",
      quantity: "1225",
      unit_price: "1.17",
      line_total: "1433.30",
    },
    {
      description: "Steel wire products line 2",
      quantity: "1000",
      unit_price: "0.93",
      line_total: "930.00",
    },
  ],
};

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: {
      score: 70,
      status: "WARNING",
      warnings: [
        "Missing gross weight",
        "Missing package count",
        "Missing net weight",
        "No HS codes detected",
      ],
      errors: [],
    },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: false,
    },
    issues: [
      { severity: "warning", message: "Missing gross weight", code: MISSING_GROSS_WEIGHT },
      { severity: "warning", message: "Missing package count", code: MISSING_PACKAGE_COUNT },
      { severity: "info", message: "Net weight not found on invoice.", code: MISSING_NET_WEIGHT },
      { severity: "warning", message: "No HS codes detected", code: "MISSING_HS_CODE" },
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

console.log("70399 — EL-CAR tabular shipment / HS regression\n");

console.log("Tabular shipment extraction");
const tabular = extractTabularShipmentMetrics(EL_CAR_CORPUS);
assert(tabular.package_count === 1, `tabular package_count=1 (got ${tabular.package_count})`);
assert(tabular.net_weight_total === 770, `tabular net=770 (got ${tabular.net_weight_total})`);
assert(tabular.gross_weight_total === 850, `tabular gross=850 (got ${tabular.gross_weight_total})`);

const footer = extractFooterShipmentMetrics(EL_CAR_CORPUS);
assert(footer.package_count === 1, `footer package_count=1 (got ${footer.package_count})`);
assert(footer.net_weight_total === 770, `footer net=770 (got ${footer.net_weight_total})`);
assert(footer.gross_weight_total === 850, `footer gross=850 (got ${footer.gross_weight_total})`);

const summary = extractShipmentSummary(EL_CAR_CORPUS);
assert(summary.package_count === 1, "summary package_count=1");
assert(summary.net_weight_total === 770, "summary net=770");
assert(summary.gross_weight_total === 850, "summary gross=850");

console.log("\nTabular HS extraction");
const tabularHs = extractTabularHsCodes(EL_CAR_CORPUS);
assert(tabularHs.length === 1, `unique tabular HS count=1 (got ${tabularHs.length})`);
assert(tabularHs[0] === "731210810080", `HS=731210810080 (got ${tabularHs[0]})`);

console.log("\nDocument enrichment + OCR crosscheck");
const enriched = enrichInvoiceDocument(INVOICE, null);
assert(enriched.shipment_summary?.package_count === 1, "enriched package_count=1");
assert(enriched.shipment_summary?.net_weight_total === 770, "enriched net=770");
assert(enriched.shipment_summary?.gross_weight_total === 850, "enriched gross=850");
assert(enriched.items?.every((item) => item.hs_code === "731210810080") === true, "items hs_code backfilled");
assert(enriched.document_flags?.[PARSER_MAPPING_FAILURE] === true, "PARSER_MAPPING_FAILURE signal set");

const hsCodes = extractHsCodes(enriched);
assert(hsCodes.length === 1, "extractHsCodes unique count=1");
assert(hsCodes[0] === "731210810080", "extractHsCodes HS=731210810080");

const crosscheck = applyParserOcrCrosscheck(INVOICE);
assert(crosscheck.signals.includes(PARSER_MAPPING_FAILURE), "crosscheck emits PARSER_MAPPING_FAILURE");
assert(crosscheck.invoice.shipment_summary?.package_count === 1, "crosscheck fallback package_count");

console.log("\nReadiness + invoice value");
const readiness = evaluateShipmentReadiness(enriched);
assert(!readiness.some((w) => w.code === MISSING_PACKAGE_COUNT), "no MISSING_PACKAGE_COUNT");
assert(!readiness.some((w) => w.code === MISSING_GROSS_WEIGHT), "no MISSING_GROSS_WEIGHT");
assert(!readiness.some((w) => w.code === MISSING_NET_WEIGHT), "no MISSING_NET_WEIGHT");
assert(resolveInvoiceValue(enriched) === 2595.25, "invoice value 2595.25");

console.log("\nUI mapping");
const report = mapAuditReportToExportReport(enriched, minimalAudit(), "INVOICE 70399.pdf");
assert(report.shipmentSummary.declarationPackageCount === 1, "UI declaration count=1");
assert(report.shipmentSummary.grossWeightTotal === 850, "UI gross=850");
assert(report.shipmentSummary.netWeightTotal === 770, "UI net=770");
assert(report.invoiceSummary.destinationCountryCode === "XK", `destination=XK (got ${report.invoiceSummary.destinationCountryCode})`);
assert(report.invoiceSummary.incoterms === "CPT", "incoterm=CPT");
assert(report.invoiceSummary.uniqueHsCodeCount === 1, "one unique HS code");
assert(report.hsAggregationReport.hsAggregation[0]?.hsCode === "731210810080", "HS aggregation 731210810080");
assert(
  !report.issues.some(
    (i) =>
      i.field === MISSING_PACKAGE_COUNT ||
      i.field === MISSING_GROSS_WEIGHT ||
      i.field === MISSING_NET_WEIGHT ||
      i.field === "MISSING_HS_CODE"
  ),
  "no package/weight/HS warnings after fallback"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
