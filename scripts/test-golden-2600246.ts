/**
 * Regression — invoice 26/00246 (PGP Tržič → GEPARD Novi Sad)
 * Run: npm run test:golden-2600246
 */
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  extractFooterShipmentMetrics,
  extractShipmentSummary,
} from "../src/lib/export-auditor/shipment-summary-extractor";
import { evaluatePackageCountDecision } from "../src/lib/export-auditor/package-count-decision-engine";
import { evaluateShipmentReadiness, MISSING_GROSS_WEIGHT, MISSING_PACKAGE_COUNT } from "../src/lib/export-auditor/shipment-readiness";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PACKING_CORPUS = `
Invoice No.: 26/00246
PGP INDE, d.o.o., Tržič
GEPARD, Novi Sad, Serbia
PACKING: 35 CARTONS (1 PALLETE)
BTTO: 538 KG
NTTO: 500 KG
EXW place: Tržič
Total: 4.932,93 EUR
`;

const INVOICE: NormalizedInvoice = {
  invoice_number: "26/00246",
  invoice_date: "2026-02-05",
  exporter: "PGP INDE, d.o.o., Tržič, Slovenija",
  consignee: "GEPARD, Produzeče za proizvodnju sportske i namenske obuće\nNovi Sad\nSerbia",
  country: "Serbia",
  country_code: "RS",
  incoterms: "EXW place: Tržič",
  currency: "EUR",
  total_value: "4932.93",
  ocr_text: PACKING_CORPUS,
  packing_info: "PACKING: 35 CARTONS (1 PALLETE)\nBTTO: 538 KG\nNTTO: 500 KG",
  origin_declaration_text: `The exporter of products covered by this document
(customs authorisation No SI/239/10)
declares that, except where otherwise clearly indicated,
these products are of EU preferential origin`,
  items: [
    {
      description: "Footwear",
      hs_code: "64062010",
      quantity: "100",
      unit_price: "49.3293",
      line_total: "4932.93",
    },
  ],
};

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: {
      score: 80,
      status: "WARNING",
      warnings: ["Missing gross weight", "Missing package count"],
      errors: [],
    },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: true,
      authorised_exporter_found: false,
      eur1_recommended: false,
    },
    issues: [
      { severity: "warning", message: "Missing gross weight", code: MISSING_GROSS_WEIGHT },
      { severity: "warning", message: "Missing package count", code: MISSING_PACKAGE_COUNT },
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

console.log("26/00246 — packing / gross weight regression\n");

const footer = extractFooterShipmentMetrics(PACKING_CORPUS);
assert(footer.package_count === 35, `package_count=35 (got ${footer.package_count})`);
assert(footer.package_type === "CT", `package_type=CT (got ${footer.package_type})`);
assert(footer.pallet_count === 1, `pallet_count=1 (got ${footer.pallet_count})`);
assert(footer.gross_weight_total === 538, `gross=538 (got ${footer.gross_weight_total})`);
assert(footer.net_weight_total === 500, `net=500 (got ${footer.net_weight_total})`);

const summary = extractShipmentSummary(PACKING_CORPUS);
assert(summary.package_count === 35, "summary package_count=35");
assert(summary.package_type === "CT", "summary package_type=CT");

const decision = evaluatePackageCountDecision({
  colliCount: 35,
  palletCount: 1,
  packageType: "CT",
});
assert(decision.declarationPackageCount === 35, "declarationPackageCount=35");
assert(decision.declarationPackageType === "CT", "declarationPackageType=CT");

const enriched = enrichInvoiceDocument(INVOICE, null);
assert(enriched.shipment_summary?.package_count === 35, "enriched package_count=35");
assert(enriched.shipment_summary?.gross_weight_total === 538, "enriched gross=538");
assert(enriched.shipment_summary?.net_weight_total === 500, "enriched net=500");

const readiness = evaluateShipmentReadiness(enriched);
assert(!readiness.some((w) => w.code === MISSING_PACKAGE_COUNT), "no MISSING_PACKAGE_COUNT");
assert(!readiness.some((w) => w.code === MISSING_GROSS_WEIGHT), "no MISSING_GROSS_WEIGHT");

const report = mapAuditReportToExportReport(enriched, minimalAudit(), "INV-2026-22-05.pdf");
assert(report.shipmentSummary.declarationPackageCount === 35, "UI declaration count=35");
assert(report.shipmentSummary.declarationPackageType === "CT", "UI declaration type=CT");
assert(report.shipmentSummary.grossWeightTotal === 538, "UI gross=538");
assert(report.shipmentSummary.netWeightTotal === 500, "UI net=500");
assert(report.invoiceSummary.destinationCountryCode === "RS", "destination=RS");
assert(
  !report.issues.some((i) => i.field === MISSING_PACKAGE_COUNT || i.field === MISSING_GROSS_WEIGHT),
  "no package/gross warnings in issues"
);

const engine = runPreferentialOriginEngine(enriched);
assert(engine.lines.every((l) => l.preferential_origin === "YES"), "preferential YES on lines");
assert(resolveInvoiceValue(enriched) === 4932.93, "invoice value 4932.93");
assert(report.invoiceSummary.uniqueHsCodeCount === 1, "one HS code");
assert(report.hsAggregationReport.hsAggregation[0]?.hsCode === "64062010", "HS 64062010");

console.log("\nPreferential origin & authorised exporter");
const pref = report.preferenceOrigin;
assert(pref.originDeclarationFound === true, "origin_declaration_found = true");
assert(pref.authorisedExporterDetected === true, "authorised_exporter_detected = true");
assert(
  pref.authorisedExporterNumber === "SI/239/10",
  `authorised_exporter_number = SI/239/10 (got ${pref.authorisedExporterNumber})`
);
assert(engine.authorised_exporter_detected === true, "engine authorised_exporter_detected = true");
assert(
  engine.authorised_exporter_number === "SI/239/10",
  `engine authorised_exporter_number = SI/239/10 (got ${engine.authorised_exporter_number})`
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
