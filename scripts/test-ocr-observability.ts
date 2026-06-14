/**
 * OCR observability — page counting, cost calculation, quality scoring.
 * Run: npm run test:ocr-observability
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildOcrObservability,
  computeEstimatedOcrCost,
  computeOcrQualityScore,
  countItemMetrics,
  DEFAULT_MISTRAL_OCR_COST_PER_PAGE_USD,
  inferExtractionSource,
  MISTRAL_OCR_PROVIDER,
} from "../src/lib/export-auditor/ocr-observability";
import { aggregateOcrSessionMetrics } from "../src/lib/export-auditor/ocr-session-metrics";
import { extractPdfPageCount } from "../src/lib/export-auditor/pdf-text-extract";
import type { ApiInvoiceItem, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

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

function sampleInvoice(items: ApiInvoiceItem[]): NormalizedInvoice {
  return {
    invoice_number: "TEST-001",
    ocr_text: "Sample OCR corpus for length measurement.",
    items,
    extraction_provenance: [
      { field: "exporter", value: "ACME", source: "ocr_primary" },
    ],
  };
}

console.log("\n=== countItemMetrics ===");
const fullItems: ApiInvoiceItem[] = [
  {
    description: "Widget A",
    hs_code: "84713000",
    country_of_origin: "DE",
    line_total: 100,
    quantity: 1,
    unit_price: 100,
  },
  {
    description: "Widget B",
    hs_code: "39269097",
    country_of_origin: "SI",
    line_total: 50,
    quantity: 1,
    unit_price: 50,
  },
  {
    description: "Widget C",
    hs_code: "73089059",
    country_of_origin: "IT",
    line_total: 25,
    quantity: 1,
    unit_price: 25,
  },
];
const partialItems: ApiInvoiceItem[] = [
  { description: "Line only", hs_code: null, country_of_origin: "", line_total: null },
  { description: "HS only", hs_code: "12345678", country_of_origin: "", line_total: null },
  { description: "", hs_code: null, country_of_origin: "DE", line_total: 10 },
];

const fullMetrics = countItemMetrics(fullItems);
assert(fullMetrics.itemsExtracted === 3, "full invoice — 3 items extracted");
assert(fullMetrics.itemsWithHsCode === 3, "full invoice — 3 items with HS");
assert(fullMetrics.itemsWithCountryOfOrigin === 3, "full invoice — 3 items with COO");
assert(fullMetrics.itemsWithLineTotal === 3, "full invoice — 3 items with line total");

const partialMetrics = countItemMetrics(partialItems);
assert(partialMetrics.itemsExtracted === 3, "partial invoice — 3 items extracted");
assert(partialMetrics.itemsWithHsCode === 1, "partial invoice — 1 item with HS");
assert(partialMetrics.itemsWithCountryOfOrigin === 1, "partial invoice — 1 item with COO");
assert(partialMetrics.itemsWithLineTotal === 1, "partial invoice — 1 item with line total");

console.log("\n=== computeOcrQualityScore ===");
assert(computeOcrQualityScore(fullMetrics) === 100, "full coverage invoice — 100% quality");
const partialQuality = computeOcrQualityScore(partialMetrics);
assert(
  partialQuality === 37,
  `partial coverage invoice — 37% quality (got ${partialQuality})`
);
assert(computeOcrQualityScore(countItemMetrics([])) === 0, "empty items — 0% quality");

console.log("\n=== computeEstimatedOcrCost ===");
assert(
  computeEstimatedOcrCost(5, DEFAULT_MISTRAL_OCR_COST_PER_PAGE_USD) === 0.01,
  "5 pages × $0.002 = $0.01"
);
assert(
  computeEstimatedOcrCost(0, DEFAULT_MISTRAL_OCR_COST_PER_PAGE_USD) === 0,
  "0 pages — $0 cost"
);
assert(
  computeEstimatedOcrCost(3, 0.005) === 0.015,
  "custom rate — 3 × $0.005 = $0.015"
);

console.log("\n=== inferExtractionSource ===");
assert(
  inferExtractionSource(sampleInvoice([])) === "ocr_primary",
  "provenance ocr_primary wins"
);
assert(
  inferExtractionSource({ ocr_text: "text only" }) === "mistral_ocr",
  "no provenance but ocr_text — mistral_ocr"
);
assert(
  inferExtractionSource({}) === "mistral_ocr",
  "empty invoice — default mistral_ocr"
);

console.log("\n=== buildOcrObservability ===");
const completeInvoice: NormalizedInvoice = {
  ...sampleInvoice(fullItems),
  exporter: "ACME GmbH",
  consignee: "Buyer RS",
  country: "Serbia",
  country_code: "RS",
  total_value_numeric: 175,
  shipment_summary: {
    package_count: 1,
    gross_weight_total: 10,
    gross_weight_unit: "kg",
    net_weight_total: null,
    net_weight_unit: null,
    package_type: "COLLI",
    pallet_dimensions: null,
    pallet_count: null,
  },
};
const observability = buildOcrObservability(completeInvoice, 4, 0.002);
assert(observability.ocrProvider === MISTRAL_OCR_PROVIDER, "provider is Mistral");
assert(observability.pageCount === 4, "page count preserved");
assert(observability.extractionSource === "ocr_primary", "extraction source from provenance");
assert(observability.ocrQualityScore === 100, "full items — quality 100");
assert(observability.estimatedOcrCostUsd === 0.008, "4 pages × $0.002 = $0.008");
assert(observability.itemsExtracted === 3, "items extracted count");
assert(observability.ocrTextLength > 0, "ocr text length > 0");

const shipmentObs = buildOcrObservability(
  {
    ...sampleInvoice(fullItems),
    ocr_metadata: {
      shipment_fields_detected: ["package_count", "gross_weight_total"],
      shipment_fields_missing: ["net_weight_total", "pallet_count", "package_type"],
    },
  },
  2,
  0.002
);
assert(
  shipmentObs.shipmentFieldsDetected?.includes("package_count") === true,
  "shipment_fields_detected passed through"
);
assert(
  shipmentObs.shipmentFieldsMissing?.includes("net_weight_total") === true,
  "shipment_fields_missing passed through"
);

console.log("\n=== aggregateOcrSessionMetrics ===");
const obsFull = buildOcrObservability(completeInvoice, 2, 0.002);
const obsPartial = buildOcrObservability(sampleInvoice(partialItems), 3, 0.002);
const session = aggregateOcrSessionMetrics([obsFull, obsPartial]);
assert(session.invoiceCount === 2, "session — 2 invoices");
assert(session.totalOcrPages === 5, "session — 5 total pages");
assert(session.totalOcrCostUsd === 0.01, "session — $0.01 total cost");
assert(session.averageOcrCostPerInvoiceUsd === 0.005, "session — $0.005 avg cost");
assert(
  session.averageOcrQuality ===
    Math.round((obsFull.ocrQualityScore + obsPartial.ocrQualityScore) / 2),
  "session — average quality"
);

console.log("\n=== extractPdfPageCount ===");
async function runPdfPageCountTests() {
  const fixturesDir = path.join(process.cwd(), "test-fixtures");
  const pdfCandidates = [
    path.join(fixturesDir, "FA26022525.pdf"),
    path.join(fixturesDir, "reni.pdf"),
    path.join(fixturesDir, "INVOICE 70399.pdf"),
  ];

  let pdfTested = false;
  for (const pdfPath of pdfCandidates) {
    if (!fs.existsSync(pdfPath)) continue;
    const buf = fs.readFileSync(pdfPath);
    const pages = await extractPdfPageCount(buf, path.basename(pdfPath));
    assert(pages >= 1, `${path.basename(pdfPath)} — page count >= 1 (got ${pages})`);
    pdfTested = true;
    break;
  }

  if (!pdfTested) {
    console.log("  (skipped PDF page count — no fixture PDF found)");
  }

  const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const imagePages = await extractPdfPageCount(imageBuffer, "scan.png");
  assert(imagePages === 1, "non-PDF image — fallback page count 1");
}

runPdfPageCountTests().then(() => {
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
});
