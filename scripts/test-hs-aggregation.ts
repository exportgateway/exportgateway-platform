/**
 * Unit tests for HS Aggregation Engine.
 * Run: npm run test:hs-aggregation
 */

import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
import type { LinePreferentialOrigin } from "../src/lib/export-auditor/preferential-origin-engine";
import {
  filterGoodsLines,
  isServiceOrTransportLine,
  normalizeAggregationItems,
  runHsAggregationEngine,
} from "../src/lib/export-auditor/hs-aggregation-engine";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { parseLocaleNumber } from "../src/lib/export-auditor/parse-locale-number";
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

function hsRow(result: ReturnType<typeof runHsAggregationEngine>, code: string) {
  return result.hs_aggregation.find((row) => row.hs_code === code);
}

const reniInvoice: NormalizedInvoice = {
  invoice_number: "26-381-000014",
  total_value_numeric: 12372.78,
  vat_article: "EUR.1 enclosed except positions 3 and 8",
  shipment_summary: {
    package_count: 1,
    package_type: "COLLI",
    gross_weight_total: 120,
    gross_weight_unit: "kg",
    pallet_dimensions: "80x62x62 cm",
  },
  items: [
    { description: "Valve assembly A", hs_code: "84818073", quantity: 13, line_total: 1200.5, country_of_origin: "DE", net_weight: 12.5 },
    { description: "Valve assembly B", hs_code: "84818073", quantity: 13, line_total: 1180.2, country_of_origin: "DE", net_weight: 12.486 },
    { description: "Seal kit A", hs_code: "84819000", quantity: 13, line_total: 890.1, country_of_origin: "DE", net_weight: 8.2 },
    { description: "Seal kit B", hs_code: "84819000", quantity: 13, line_total: 910.4, country_of_origin: "DE", net_weight: 8.1 },
    { description: "Bolt set CN", hs_code: "73072390", quantity: 26, line_total: 2100, country_of_origin: "CN", net_weight: 18.5 },
    { description: "Bolt set IT", hs_code: "73072390", quantity: 26, line_total: 2050, country_of_origin: "IT", net_weight: 18.2 },
    { description: "Bracket A", hs_code: "73269098", quantity: 13, line_total: 760, country_of_origin: "DE", net_weight: 6.1 },
    { description: "Bracket B", hs_code: "73269098", quantity: 13, line_total: 740, country_of_origin: "CN", net_weight: 6.05 },
    { description: "Rubber gasket", hs_code: "40169300", quantity: 32, line_total: 1420, country_of_origin: "DE", net_weight: 15.81 },
    { description: "Stroški izvoza", quantity: 1, line_total: 120, country_of_origin: "SI" },
  ],
};

console.log("transport exclusion");
assert(isServiceOrTransportLine("Stroški izvoza"), "Stroški izvoza is service line");
assert(isServiceOrTransportLine("Freight charges"), "Freight is service line");
assert(!isServiceOrTransportLine("Valve assembly A"), "goods line not service");

const reniResult = runHsAggregationEngine(reniInvoice);

console.log("\nRENI HS aggregation — invoice 26-381-000014");
assert(hsRow(reniResult, "84818073")?.total_quantity === 26, "84818073 qty 26");
assert(hsRow(reniResult, "84819000")?.total_quantity === 26, "84819000 qty 26");
assert(hsRow(reniResult, "73072390")?.total_quantity === 52, "73072390 qty 52");
assert(hsRow(reniResult, "73269098")?.total_quantity === 26, "73269098 qty 26");
assert(hsRow(reniResult, "40169300")?.total_quantity === 32, "40169300 qty 32");
assert(hsRow(reniResult, "84818073")?.item_count === 2, "84818073 item_count 2");

console.log("\nweight aggregation");
const totalNet = reniResult.mrn_summary.total_net_weight ?? 0;
assert(totalNet > 0, "total net weight calculated");
assert(
  Math.abs(totalNet - 105.946) < 0.01,
  `MRN net weight ~105.946 (got ${totalNet})`
);

console.log("\ntransport excluded from totals");
assert(reniResult.mrn_summary.excluded_service_lines === 1, "one service line excluded");
assert(reniResult.mrn_summary.total_goods_lines === 9, "nine goods lines");
assert(reniResult.mrn_summary.unique_hs_codes === 5, "five unique HS codes");
assert(
  !reniResult.hs_aggregation.some((row) => row.hs_code === ""),
  "no empty HS from transport"
);

console.log("\nEUR.1 exclusion — positions 3 and 8");
const preference = runPreferentialOriginEngine(reniInvoice);
const pos3 = preference.lines.find((l) => l.position_number === 3);
const pos8 = preference.lines.find((l) => l.position_number === 8);
assert(pos3?.preferential_origin === "NO", "position 3 NON_PREFERENTIAL");
assert(pos8?.preferential_origin === "NO", "position 8 NON_PREFERENTIAL");

const nonPrefPositions = reniResult.non_preferential_summary.flatMap((r) => r.source_positions);
assert(nonPrefPositions.includes(3), "position 3 in non_preferential_summary");
assert(nonPrefPositions.includes(8), "position 8 in non_preferential_summary");
assert(
  reniResult.non_preferential_summary.some((r) => r.hs_code === "84819000"),
  "84819000 in non_preferential (position 3)"
);
assert(
  reniResult.non_preferential_summary.some((r) => r.hs_code === "73269098"),
  "73269098 in non_preferential (position 8)"
);

console.log("\npreference-origin separation");
const goods = filterGoodsLines(normalizeAggregationItems(reniInvoice));
const yesCount = goods.filter((g) => g.preferential_origin === "YES").length;
const noCount = goods.filter((g) => g.preferential_origin === "NO").length;
const unknownCount = goods.filter((g) => g.preferential_origin === "UNKNOWN").length;
assert(noCount === 2, "two NO lines");
assert(yesCount + unknownCount === 7, "remaining seven not NO");
assert(reniResult.preferential_summary.every((r) => r.source_positions.length > 0), "preferential traceable");

console.log("\nMRN summary");
assert(reniResult.mrn_summary.total_gross_weight === 120, "gross weight 120 from shipment");
assert(
  reniResult.mrn_summary.countries_of_origin.includes("DE"),
  "MRN includes DE"
);
assert(
  reniResult.mrn_summary.countries_of_origin.includes("CN"),
  "MRN includes CN"
);

console.log("\nsource position traceability");
for (const row of reniResult.hs_aggregation) {
  assert(row.source_positions.length === row.item_count, `HS ${row.hs_code} positions match item_count`);
}

console.log("\nEuropean number parsing");
assert(parseLocaleNumber("1,123.50") === 1123.5, "US thousands: 1,123.50");
assert(parseLocaleNumber("1123.50") === 1123.5, "US decimal: 1123.50");
assert(parseLocaleNumber("1.123,50") === 1123.5, "EU format: 1.123,50");
assert(parseLocaleNumber("5.593,70") === 5593.7, "EU total: 5.593,70");

console.log("\naudit report output");
const audit: AuditReportResponse = {
  audit_status: "READY",
  readiness: { score: 90, status: "READY", warnings: [], errors: [] },
  preference_origin: {},
  issues: [],
  recommended_actions: [],
  summary: "Export audit completed.",
};
const report = mapAuditReportToExportReport(reniInvoice, audit, "reni.pdf");
assert(report.hsAggregationReport.hsAggregation.length === 5, "report hsAggregation rows");
assert(report.hsAggregationReport.mrnSummary.totalGoodsLines >= 9, "report MRN goods lines");
assert(report.hsAggregationReport.nonPreferentialSummary.length >= 2, "report non-preferential rows");

console.log("\nshipment net weight — 100% preferential, no line weights");
const allPrefInvoice: NormalizedInvoice = {
  invoice_number: "FA26022525",
  total_value_numeric: 5593.7,
  shipment_summary: {
    package_count: 1,
    package_type: "PALLET",
    gross_weight_total: 81,
    gross_weight_unit: "kg",
    net_weight_total: 65,
    net_weight_unit: "kg",
    pallet_dimensions: null,
  },
  items: [
    { position_number: 1, description: "Item A", hs_code: "8438809900", quantity: 1, line_total: 1123.5, country_of_origin: "FR" },
    { position_number: 2, description: "Item B", hs_code: "8438809900", quantity: 2, line_total: 2884, country_of_origin: "FR" },
  ],
};
const allPrefLines: LinePreferentialOrigin[] = [
  {
    position_number: 1,
    country_of_origin: "FR",
    preferential_origin: "YES",
    preference_reason: "test",
    preference_source: "invoice_declaration",
  },
  {
    position_number: 2,
    country_of_origin: "FR",
    preferential_origin: "YES",
    preference_reason: "test",
    preference_source: "invoice_declaration",
  },
];
const allPrefResult = runHsAggregationEngine(allPrefInvoice, { preferenceLines: allPrefLines });
const allPrefRow = allPrefResult.preferential_summary.find((row) => row.hs_code === "8438809900");
assert(allPrefRow?.total_net_weight === 65, `all-preferential shipment weight = 65 kg (got ${allPrefRow?.total_net_weight})`);
assert(
  allPrefResult.mrn_summary.total_net_weight === 65,
  `MRN net weight matches shipment fallback (got ${allPrefResult.mrn_summary.total_net_weight})`
);
assert(allPrefResult.non_preferential_summary.length === 0, "non-preferential summary empty");

console.log("\nshipment net weight — mixed preferential/non-preferential, no line weights");
const mixedLines: LinePreferentialOrigin[] = [
  {
    position_number: 1,
    country_of_origin: "FR",
    preferential_origin: "YES",
    preference_reason: "test",
    preference_source: "invoice_declaration",
  },
  {
    position_number: 2,
    country_of_origin: "FR",
    preferential_origin: "NO",
    preference_reason: "test",
    preference_source: "invoice_declaration",
  },
];
const mixedInvoice: NormalizedInvoice = {
  invoice_number: "MIX-001",
  shipment_summary: {
    package_count: 1,
    package_type: "COLLI",
    gross_weight_total: 40,
    gross_weight_unit: "kg",
    net_weight_total: 30,
    net_weight_unit: "kg",
    pallet_dimensions: null,
  },
  items: [
    { position_number: 1, description: "Pref item", hs_code: "84818073", quantity: 1, line_total: 100, country_of_origin: "FR" },
    { position_number: 2, description: "Non-pref item", hs_code: "84819000", quantity: 1, line_total: 200, country_of_origin: "FR" },
  ],
};
const mixedResult = runHsAggregationEngine(mixedInvoice, { preferenceLines: mixedLines });
assert(
  mixedResult.preferential_summary.every((row) => row.weight_allocation_unavailable),
  "mixed invoice preferential weight allocation unavailable"
);
assert(
  mixedResult.non_preferential_summary.every((row) => row.weight_allocation_unavailable),
  "mixed invoice non-preferential weight allocation unavailable"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
