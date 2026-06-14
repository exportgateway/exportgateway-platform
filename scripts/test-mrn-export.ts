/**
 * Unit tests for MRN export and position traceability.
 * Run: npm run test:mrn-export
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  aggregateCustomsDescriptions,
  generateCustomsDescription,
} from "../src/lib/export-auditor/customs-description";
import {
  assertExportRowsHaveSourcePositions,
  buildMrnExportDataset,
  generateMrnCsv,
  generateMrnExcelBuffer,
  isMrnExportReady,
  MRN_EXPORT_COLUMNS,
  MRN_EXPORT_FOOTER,
  DECLARATION_DESCRIPTION_DISCLAIMER,
  MRN_WORKSHEET_NAME,
  TRACEABILITY_EXPORT_COLUMNS,
  TRACEABILITY_WORKSHEET_NAME,
} from "../src/lib/export-auditor/mrn-export";
import {
  buildPositionTraceability,
  derivePreferentialStatusForHs,
  formatSourcePositions,
  getSourcePositionsForHs,
  getTraceabilityLinesForHs,
  resolveItemUnit,
} from "../src/lib/export-auditor/position-traceability";
import { runHsAggregationEngine } from "../src/lib/export-auditor/hs-aggregation-engine";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import type { ExportAuditReport } from "../src/lib/export-auditor/types";

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

const ROPE_DESCRIPTION =
  "Non rotating rope 10mm-18x7+WSC galvanized EN12385-4 lubricated";

const reniInvoice: NormalizedInvoice = {
  invoice_number: "26-381-000014",
  exporter: "RENI d.o.o.",
  consignee: "Buyer GmbH",
  country: "Serbia",
  country_code: "RS",
  incoterms: "DAP",
  currency: "EUR",
  total_value_numeric: 12372.78,
  vat_article: "EUR.1 enclosed except positions 3 and 8",
  shipment_summary: {
    package_count: 1,
    package_type: "COLLI",
    gross_weight_total: 120,
    gross_weight_unit: "kg",
    net_weight_total: null,
    net_weight_unit: null,
    pallet_dimensions: "80x62x62 cm",
    pallet_count: null,
  },
  items: [
    { description: "Valve A", hs_code: "84818073", quantity: 13, line_total: 1200.5, country_of_origin: "DE", net_weight: 12.5 },
    { description: "Valve B", hs_code: "84818073", quantity: 13, line_total: 1180.2, country_of_origin: "DE", net_weight: 12.486 },
    { description: "Seal A", hs_code: "84819000", quantity: 13, line_total: 890.1, country_of_origin: "DE", net_weight: 8.2 },
    { description: "Seal B", hs_code: "84819000", quantity: 13, line_total: 910.4, country_of_origin: "DE", net_weight: 8.1 },
    { description: "Bolt CN", hs_code: "73072390", quantity: 26, line_total: 2100, country_of_origin: "CN", net_weight: 18.5 },
    { description: "Bolt IT", hs_code: "73072390", quantity: 26, line_total: 2050, country_of_origin: "IT", net_weight: 18.2 },
    { description: "Bracket A", hs_code: "73269098", quantity: 13, line_total: 760, country_of_origin: "DE", net_weight: 6.1 },
    { description: "Bracket B", hs_code: "73269098", quantity: 13, line_total: 740, country_of_origin: "CN", net_weight: 6.05 },
    { description: "Rubber gasket", hs_code: "40169300", quantity: 32, line_total: 1420, country_of_origin: "DE", net_weight: 15.81 },
    { description: "Stroški izvoza", quantity: 1, line_total: 120, country_of_origin: "SI" },
  ],
};

const ropeInvoice: NormalizedInvoice = {
  invoice_number: "70399",
  exporter: "S.C. EL-CAR S.R.L",
  consignee: "PROFI KOSOVA SH. P. K",
  country: "Kosovo",
  country_code: "XK",
  incoterms: "CPT",
  currency: "EUR",
  total_value_numeric: 2595.25,
  shipment_summary: {
    package_count: 1,
    package_type: null,
    gross_weight_total: 850,
    gross_weight_unit: "kg",
    net_weight_total: null,
    net_weight_unit: null,
    pallet_dimensions: null,
    pallet_count: null,
  },
  items: [
    {
      description: ROPE_DESCRIPTION,
      hs_code: "73121081",
      quantity: "1225 M",
      line_total: 1433.3,
      country_of_origin: "RO",
      net_weight: 420,
    },
    {
      description: ROPE_DESCRIPTION,
      hs_code: "73121081",
      quantity: "1000 M",
      line_total: 930,
      country_of_origin: "RO",
      net_weight: 350,
    },
  ],
};

const audit: AuditReportResponse = {
  audit_status: "READY",
  readiness: { score: 90, status: "READY", warnings: [], errors: [] },
  preference_origin: {},
  issues: [],
  recommended_actions: [],
  summary: "Export audit completed.",
};

const report: ExportAuditReport = mapAuditReportToExportReport(reniInvoice, audit, "reni.pdf");
const ropeReport: ExportAuditReport = mapAuditReportToExportReport(ropeInvoice, audit, "70399.pdf");

async function main() {
console.log("customs description condenser");
const ropeCustoms = generateCustomsDescription(ROPE_DESCRIPTION);
assert(/galvanized/i.test(ropeCustoms), "rope customs description contains Galvanized");
assert(/rope/i.test(ropeCustoms), "rope customs description contains rope or wire rope");
assert(
  generateCustomsDescription("Valve A").toLowerCase().includes("valve"),
  "valve description condenses to valve"
);
assert(
  aggregateCustomsDescriptions(["Galvanized steel wire rope", "Galvanized steel wire rope"]).includes(
    "Galvanized"
  ),
  "aggregate customs descriptions merges identical rope lines"
);

console.log("\nunit resolution");
assert(resolveItemUnit({ quantity: "1225 M" }) === "M", "parses unit from quantity string");
assert(resolveItemUnit({ unit: "pcs", quantity: 13 }) === "pcs", "prefers explicit unit field");

console.log("\nposition traceability");
const traceability = buildPositionTraceability(reniInvoice);
assert(traceability.length === 9, "nine goods traceability lines");
assert(!traceability.some((l) => l.description.includes("Stroški")), "transport excluded from traceability");
assert(traceability.every((line) => line.customsDescription && line.customsDescription.length > 0), "traceability lines have customs descriptions");
const valveLine = traceability.find((line) => line.description === "Valve A");
assert(valveLine?.description === "Valve A", "invoice description preserved exactly");
assert(valveLine?.customsDescription != null, "valve line has customs description");

const ropeTraceability = buildPositionTraceability(ropeInvoice);
assert(ropeTraceability.length === 2, "two rope traceability lines");
assert(ropeTraceability.every((line) => line.unit === "M"), "rope lines resolve unit M");

const hs7307Rows = report.hsAggregationReport.hsAggregation.filter((r) => r.hsCode === "73072390");
assert(hs7307Rows.length === 1, "73072390 single YES bucket (CN+IT merged)");
const hs7307 = hs7307Rows[0]!;
assert(hs7307.countryOfOrigin.includes("CN") && hs7307.countryOfOrigin.includes("IT"), "73072390 countries CN, IT");
assert(formatSourcePositions(hs7307.sourcePositions) === "5,6", "73072390 source positions 5,6");
const lines7307 = getTraceabilityLinesForHs("73072390", hs7307, report.hsAggregationReport.traceabilityLines);
assert(lines7307.length === 2, "two traceability lines for 73072390 merged bucket");
assert(lines7307.some((line) => line.countryOfOrigin === "CN"), "73072390 CN traceability COO");
assert(lines7307.some((line) => line.countryOfOrigin === "IT"), "73072390 IT traceability COO");

console.log("\npreferential status for export");
const hs848190No = report.hsAggregationReport.hsAggregation.find(
  (r) => r.hsCode === "84819000" && r.preferentialOrigin === "NO"
);
if (hs848190No) {
  const status = derivePreferentialStatusForHs(
    hs848190No.sourcePositions,
    report.hsAggregationReport.traceabilityLines
  );
  assert(status === "NO", "84819000 NO bucket status derived");
}

console.log("\ndeclaration export dataset");
assert(isMrnExportReady(report), "mrn export ready");
assert(report.mrnExportReady === true, "report.mrnExportReady true");
const dataset = buildMrnExportDataset(report);
assert(dataset != null, "dataset built");
if (dataset) {
  assert(dataset.rows.length === 7, "seven export rows (HS+pref buckets, COO merged)");
  assert(dataset.traceabilityRows.length === 9, "nine traceability export rows");
  assert(assertExportRowsHaveSourcePositions(dataset), "every row has source positions");
  const row7307 = dataset.rows.find((r) => r.hsCode === "73072390");
  assert(row7307 != null, "73072390 export row exists (CN+IT merged)");
  const exportRow7307 = row7307!;
  assert(exportRow7307.countryOfOrigin.includes("CN"), "export row includes CN origin");
  assert(exportRow7307.sourcePositions.includes("5"), "export row includes CN source position 5");
  assert(exportRow7307.preferentialOrigin === "YES" || exportRow7307.preferentialOrigin === "NO" || exportRow7307.preferentialOrigin === "UNKNOWN", "export row preferential column");
  assert((exportRow7307.declarationDescription?.length ?? 0) > 0, "export row has declaration description");
  assert(exportRow7307.descriptionSource === "Rule Based", "rule based source without AI enrichment");
  const hs848180 = dataset.rows.find((r) => r.hsCode === "84818073");
  assert(hs848180?.originalDescription === "Valve A | Valve B", "84818073 original descriptions joined");
  assert(hs848180?.preferentialOrigin === "YES" || hs848180?.preferentialOrigin === "UNKNOWN", "84818073 preferential column populated");
}

const ropeDataset = buildMrnExportDataset(ropeReport);
assert(ropeDataset != null, "rope dataset built");
if (ropeDataset) {
  assert(ropeDataset.rows.length === 1, "one rope HS row");
  const ropeRow = ropeDataset.rows[0];
  assert(ropeRow.hsCode === "73121081", "rope HS code exported");
  assert(ropeRow.originalDescription.includes(ROPE_DESCRIPTION), "rope invoice description preserved");
  assert(/galvanized/i.test(ropeRow.declarationDescription), "rope declaration description in export row");
  assert(ropeRow.quantity === 2225, "rope total quantity aggregated");
  assert(ropeRow.unitOfMeasure === "M", "rope UOM from quantity text");
  assert(ropeDataset.traceabilityRows.length === 2, "two rope traceability export rows");
  const traceRow = ropeDataset.traceabilityRows[0];
  assert(traceRow.originalDescription === ROPE_DESCRIPTION, "traceability preserves invoice description");
  assert(traceRow.countryOfOrigin === "RO", "traceability exports origin");
}

console.log("\nCSV generation");
const csv = generateMrnCsv(report);
assert(csv.startsWith("\uFEFF"), "CSV UTF-8 BOM");
assert(csv.includes(";"), "CSV semicolon delimiter");
assert(csv.includes(MRN_EXPORT_COLUMNS.join(";")), "CSV declaration preparation header row");
assert(csv.includes(TRACEABILITY_EXPORT_COLUMNS.join(";")), "CSV traceability header row");
assert(csv.includes("73072390"), "CSV contains HS row");
assert(csv.includes("Preferential Origin"), "CSV contains preferential column");
assert(
  csv.includes("Valve A | Valve B") || csv.includes("Valve A"),
  "CSV contains description column content"
);
assert(csv.includes("Bolt CN"), "CSV contains invoice description");
assert(csv.includes("Gross Weight"), "CSV contains gross weight header");
assert(csv.includes(MRN_EXPORT_FOOTER), "CSV footer");
assert(csv.includes(DECLARATION_DESCRIPTION_DISCLAIMER), "CSV disclaimer footer");

const ropeCsv = generateMrnCsv(ropeReport);
assert(ropeCsv.includes(ROPE_DESCRIPTION), "rope CSV preserves invoice description");
assert(/galvanized/i.test(ropeCsv), "rope CSV contains declaration description");

console.log("\nExcel generation");
  const buffer = await generateMrnExcelBuffer(report);
  assert(buffer.byteLength > 0, "Excel buffer non-empty");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  assert(workbook.SheetNames.includes(MRN_WORKSHEET_NAME), "DECLARATION PREPARATION worksheet");
  assert(workbook.SheetNames.includes(TRACEABILITY_WORKSHEET_NAME), "TRACEABILITY worksheet");
  const sheet = workbook.Sheets[MRN_WORKSHEET_NAME];
  const excelRows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
  assert(String(excelRows[0]?.[0]) === "Invoice Number", "Excel invoice header");
  assert(String(excelRows[0]?.[1]) === "26-381-000014", "Excel invoice number");
  assert(String(excelRows[6]?.[0]) === "Gross Weight", "Excel gross weight header");
  const hsHeaderIndex = excelRows.findIndex((r) => r[0] === "HS Code");
  assert(hsHeaderIndex >= 0, "Excel HS table header");
  assert(excelRows[hsHeaderIndex]?.[1] === MRN_EXPORT_COLUMNS[1], "Excel description column");
  assert(excelRows[hsHeaderIndex]?.[4] === "Quantity", "Excel quantity column");
  assert(excelRows[hsHeaderIndex]?.[7] === "Value", "Excel value column");
  assert(excelRows[hsHeaderIndex]?.[9] === "Source Positions", "Excel source positions column");
  const hsDataRow = excelRows.find((r) => r[0] === "73072390");
  assert(hsDataRow != null, "Excel HS data row 73072390");
  const hsExcelRow = hsDataRow!;
  assert(String(hsExcelRow[9]).includes("5"), "Excel source positions include CN line");
  assert(/bolt/i.test(String(hsExcelRow[1])), "Excel description column");

  const traceSheet = workbook.Sheets[TRACEABILITY_WORKSHEET_NAME];
  const traceRows = XLSX.utils.sheet_to_json<(string | number)[]>(traceSheet, { header: 1 });
  assert(traceRows[0]?.[0] === "Position Number", "Excel traceability header");
  assert(traceRows[0]?.[1] === "Original Description", "Excel traceability original description");
  assert(traceRows[0]?.[2] === "Declaration Description", "Excel traceability declaration description");
  assert(traceRows[0]?.[15] === "Review Recommended", "Excel traceability review column");
  const valveTraceRow = traceRows.find((r) => r[1] === "Valve A");
  assert(valveTraceRow != null, "Excel traceability valve row");
  const valveTraceExcelRow = valveTraceRow!;
  assert(String(valveTraceExcelRow[4]) === "84818073", "Excel traceability final HS code");

console.log("\naggregation traceability invariant");
const engine = runHsAggregationEngine(reniInvoice);
for (const row of engine.hs_aggregation) {
  assert(row.source_positions.length > 0, `HS ${row.hs_code} has source positions`);
  assert(row.source_positions.length === row.item_count, `HS ${row.hs_code} positions match item_count`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
