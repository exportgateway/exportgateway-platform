/**
 * Unit tests for shipment summary extraction and readiness warnings.
 * Run: npm run test:shipment-summary
 */

import {
  enrichInvoiceShipmentData,
  extractDeliveryAddress,
  extractFooterShipmentMetrics,
  extractGrossWeight,
  extractPackageCount,
  extractPalletDimensions,
  extractShipmentSummary,
} from "../src/lib/export-auditor/shipment-summary-extractor";
import { evaluateShipmentReadiness, MISSING_GROSS_WEIGHT, MISSING_NET_WEIGHT, MISSING_PACKAGE_COUNT, NO_OCR_SHIPMENT_DATA } from "../src/lib/export-auditor/shipment-readiness";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
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

const reniCorpus = `
Račun št. 26-381-000014
Skupaj število: 1 koli
Skupna bruto teža: 120 kg
Net weight: 95 kg
Paleta dimenzije: 80x62x62 cm
Naslov za dostavo:
RENI d.o.o.
Industrijska 12
Beograd RS-11000
Serbia
`;

console.log("extractPackageCount");
const pkg = extractPackageCount(reniCorpus);
assert(pkg.package_count === 1, "RENI package_count = 1");
assert(pkg.package_type === "COLLI", "RENI package_type = COLLI");

console.log("\nextractGrossWeight");
const weight = extractGrossWeight(reniCorpus);
assert(weight.gross_weight_total === 120, "RENI gross_weight_total = 120");
assert(weight.gross_weight_unit === "kg", "RENI gross_weight_unit = kg");

console.log("\nextractPalletDimensions");
const dims = extractPalletDimensions(reniCorpus);
assert(dims === "80x62x62 cm", `RENI pallet_dimensions = 80x62x62 cm (got ${dims})`);

console.log("\nextractDeliveryAddress");
const delivery = extractDeliveryAddress(reniCorpus);
assert(delivery.company === "RENI d.o.o.", "RENI delivery company");
assert(delivery.country === "Serbia", "RENI delivery country = Serbia");
assert(delivery.country_code === "RS", "RENI delivery country_code = RS");
assert(delivery.postal_code === "RS-11000", "RENI delivery postal_code = RS-11000");

console.log("\nEnglish patterns");
assert(extractPackageCount("Number of packages: 3").package_count === 3, "Number of packages: 3");
assert(extractPackageCount("3 pallets").package_count === 3, "3 pallets count");
assert(extractPackageCount("3 pallets").package_type === "PALLET", "3 pallets type");
assert(extractGrossWeight("Gross weight: 450 kg").gross_weight_total === 450, "Gross weight 450");

console.log("\nPGP 26/00246 packing patterns");
const pgpCorpus = "PACKING: 35 CARTONS (1 PALLETE)\nBTTO: 538 KG\nNTTO: 500 KG";
const pgpFooter = extractFooterShipmentMetrics(pgpCorpus);
assert(pgpFooter.package_count === 35, "35 CARTONS → package_count=35");
assert(pgpFooter.package_type === "CT", "35 CARTONS → type CT");
assert(pgpFooter.pallet_count === 1, "35 CARTONS (1 PALLETE) → pallet_count=1");
assert(pgpFooter.gross_weight_total === 538, "BTTO: 538 KG");
assert(pgpFooter.net_weight_total === 500, "NTTO: 500 KG");
assert(extractPackageCount("35 CTNS").package_type === "CT", "35 CTNS → CT");
assert(extractPackageCount("12 BOXES").package_count === 12, "12 BOXES count");
assert(extractGrossWeight("BRUTTO: 538 KG").gross_weight_total === 538, "BRUTTO pattern");

console.log("\nenrichInvoiceShipmentData — RENI invoice 26-381-000014");
const reniInvoice: NormalizedInvoice = {
  invoice_number: "26-381-000014",
  consignee: "Buyer GmbH\nDE-10115 Berlin",
  country: "Germany",
  country_code: "DE",
  ocr_text: reniCorpus,
  items: [{ description: "Widget", quantity: 100, hs_code: "84713000" }],
};

const enriched = enrichInvoiceShipmentData(reniInvoice);
assert(enriched.shipment_summary?.package_count === 1, "enriched package_count");
assert(enriched.shipment_summary?.package_type === "COLLI", "enriched package_type");
assert(enriched.shipment_summary?.gross_weight_total === 120, "enriched gross weight");
assert(enriched.shipment_summary?.gross_weight_unit === "kg", "enriched gross unit");
assert(enriched.shipment_summary?.net_weight_total === 95, "enriched net weight");
assert(enriched.shipment_summary?.pallet_dimensions === "80x62x62 cm", "enriched pallet dims (extracted, not shown in UI)");
assert(enriched.delivery_address?.country_code === "RS", "enriched delivery RS");
assert(enriched.consignee?.includes("Berlin"), "consignee not overwritten");

console.log("\nreadiness warnings");
const complete = enrichInvoiceShipmentData({ ocr_text: reniCorpus });
assert(evaluateShipmentReadiness(complete).length === 0, "complete shipment → no warnings");

const missing = enrichInvoiceShipmentData({ invoice_number: "X" });
const warnings = evaluateShipmentReadiness(missing);
assert(
  warnings.some((w) => w.code === NO_OCR_SHIPMENT_DATA),
  "empty invoice → NO_OCR_SHIPMENT_DATA info"
);
assert(
  !warnings.some((w) => w.code === MISSING_PACKAGE_COUNT),
  "empty invoice suppresses generic package warning when OCR returned no shipment data"
);
assert(
  !warnings.some((w) => w.code === MISSING_GROSS_WEIGHT),
  "empty invoice suppresses generic gross weight warning when OCR returned no shipment data"
);
assert(
  !warnings.some((w) => w.message.toLowerCase().includes("pallet dimension")),
  "no warnings for missing pallet dimensions"
);

console.log("\naudit report output");
const audit: AuditReportResponse = {
  audit_status: "WARNING",
  readiness: { score: 80, status: "WARNING", warnings: [], errors: [] },
  preference_origin: {},
  issues: [],
  recommended_actions: [],
  summary: "Export audit completed.",
};

const report = mapAuditReportToExportReport(enriched, audit, "reni.pdf");
assert(report.shipmentSummary.packageCount === 1, "report shipmentSummary.packageCount");
assert(report.shipmentSummary.grossWeightTotal === 120, "report shipmentSummary.grossWeightTotal");
assert(report.shipmentSummary.netWeightTotal === 95, "report shipmentSummary.netWeightTotal");
assert(report.deliveryAddress.countryCode === "RS", "report deliveryAddress.countryCode");
assert(
  report.issues.some((i) => i.field === MISSING_PACKAGE_COUNT) === false,
  "complete shipment → no package warning in issues"
);

const incompleteReport = mapAuditReportToExportReport(missing, audit, "empty.pdf");
assert(
  incompleteReport.issues.some((i) => i.field === NO_OCR_SHIPMENT_DATA),
  "incomplete → NO_OCR_SHIPMENT_DATA info in issues"
);
assert(
  !incompleteReport.issues.some((i) => i.field === MISSING_PACKAGE_COUNT),
  "incomplete suppresses generic package warning when OCR returned no shipment data"
);
assert(
  !incompleteReport.issues.some((i) => i.field === MISSING_GROSS_WEIGHT),
  "incomplete suppresses generic weight warning when OCR returned no shipment data"
);

console.log("\nline items must not infer shipment weight");
const lineOnly: NormalizedInvoice = {
  items: [
    { description: "Part A", quantity: 50, line_total: "120" },
    { description: "Part B", quantity: 50, line_total: "80" },
  ],
};
const lineEnriched = enrichInvoiceShipmentData(lineOnly);
assert(lineEnriched.shipment_summary?.package_count == null, "no package from line items");
assert(lineEnriched.shipment_summary?.gross_weight_total == null, "no weight from line items");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
