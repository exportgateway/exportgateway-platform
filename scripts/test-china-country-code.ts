/**
 * Regression — ISO2 country code resolution (China ≠ CH).
 * Run: npm run test:china-country-code
 */
import { resolveIso2CountryCode } from "../src/lib/export-auditor/country-resolution";
import { normalizeCountryOfOrigin } from "../src/lib/export-auditor/country-of-origin-extraction-engine";
import { runHsAggregationEngine } from "../src/lib/export-auditor/hs-aggregation-engine";
import type { NormalizedInvoice } from "../src/lib/export-auditor/api-types";

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

console.log("China / Switzerland ISO2 regression\n");

assert(resolveIso2CountryCode("China") === "CN", "China → CN");
assert(resolveIso2CountryCode("china") === "CN", "china lowercase → CN");
assert(resolveIso2CountryCode("CH") === "CH", "CH → CH (Switzerland)");
assert(resolveIso2CountryCode("Switzerland") === "CH", "Switzerland → CH");
assert(normalizeCountryOfOrigin("China") === "CN", "normalizeCountryOfOrigin China → CN");

const invoice: NormalizedInvoice = {
  invoice_number: "COO-TEST",
  exporter: "Test GmbH",
  consignee: "Buyer RS",
  country_code: "RS",
  items: [
    {
      description: "Valve",
      quantity: 1,
      line_total: 100,
      hs_code: "84818081",
      country_of_origin: "China",
    },
  ],
};

const agg = runHsAggregationEngine(invoice);
assert(
  agg.mrn_summary.countries_of_origin.includes("CN"),
  `aggregation origin CN (got ${agg.mrn_summary.countries_of_origin.join(",")})`
);
assert(
  !agg.mrn_summary.countries_of_origin.includes("CH"),
  "aggregation must not map China to CH"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
