/**
 * Confidence score engine — provenance penalties and caps.
 * Run: npx tsx scripts/test-confidence-score.ts
 */

import { computeConfidenceScores } from "../src/lib/export-auditor/confidence-score-engine";
import type { NormalizedInvoice } from "../src/lib/export-auditor/api-types";

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

const completeInvoice: NormalizedInvoice = {
  invoice_number: "INV-100",
  invoice_date: "2025-01-15",
  incoterms: "EXW",
  vat_article: "Art. 146",
  country_code: "RS",
  country: "Serbia",
  items: [
    {
      position_number: 1,
      description: "Part",
      quantity: 1,
      line_total: "500",
      hs_code: "84713000",
      country_of_origin: "SI",
    },
  ],
  shipment_summary: {
    package_count: 1,
    package_type: "PALLET",
    gross_weight_total: 50,
    gross_weight_unit: "kg",
    net_weight_total: 45,
    net_weight_unit: "kg",
    pallet_dimensions: null,
    pallet_count: 1,
  },
};

console.log("Case A: All primary parsers → 100%");
const caseA = computeConfidenceScores(completeInvoice, {
  checksPassed: 8,
  checksTotal: 8,
  readinessScore: 95,
});
assert(caseA.overallConfidence === 100, `overallConfidence=100 (got ${caseA.overallConfidence})`);
assert(
  Object.keys(caseA.confidenceBreakdown).length === 0,
  "no fallback provenance on primary invoice"
);

console.log("\nCase B: OCR fallback used → <=97%");
const ocrFallbackInvoice: NormalizedInvoice = {
  ...completeInvoice,
  extraction_provenance: [
    { field: "package_count", value: "1", source: "ocr_fallback" },
  ],
};
const caseB = computeConfidenceScores(ocrFallbackInvoice, {
  checksPassed: 8,
  checksTotal: 8,
  readinessScore: 100,
});
assert(caseB.overallConfidence <= 97, `OCR fallback capped at 97 (got ${caseB.overallConfidence})`);
assert(
  caseB.confidenceBreakdown.package_count === "ocr_fallback",
  "confidenceBreakdown records ocr_fallback"
);

console.log("\nCase C: Heuristic recovery used → <=95%");
const heuristicInvoice: NormalizedInvoice = {
  ...completeInvoice,
  extraction_provenance: [
    { field: "net_weight_total", value: "45", source: "heuristic_recovery" },
  ],
};
const caseC = computeConfidenceScores(heuristicInvoice, {
  checksPassed: 8,
  checksTotal: 8,
  readinessScore: 100,
});
assert(
  caseC.overallConfidence <= 95,
  `heuristic recovery capped at 95 (got ${caseC.overallConfidence})`
);

console.log("\nMultiple fallback layers → <=92%");
const multiFallback: NormalizedInvoice = {
  ...completeInvoice,
  extraction_provenance: [
    { field: "package_count", value: "1", source: "ocr_fallback" },
    { field: "net_weight_total", value: "45", source: "heuristic_recovery" },
  ],
};
const caseMulti = computeConfidenceScores(multiFallback, {
  checksPassed: 8,
  checksTotal: 8,
  readinessScore: 100,
});
assert(
  caseMulti.overallConfidence <= 92,
  `multi-layer fallback capped at 92 (got ${caseMulti.overallConfidence})`
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
