/**
 * Unit tests for invoice-level discount context extraction.
 * Run: npm run test:invoice-discount
 */

import {
  extractInvoiceDiscountContext,
  resolvePostDiscountInvoiceTotal,
} from "../src/lib/export-auditor/invoice-discount-context";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
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

console.log("Golden 305/E discount context");

const golden305eCorpus = `
Gross Amount € 9.493,20
Discount 3,0
Value of discount 284,80
Total amount € 9.208,40
`;

const ctx = extractInvoiceDiscountContext(golden305eCorpus);
assert(ctx.preDiscountAmount === 9493.2, "Gross Amount extracted as pre-discount amount");
assert(ctx.discountAmount === 284.8, "Value of discount extracted as discount amount");
assert(ctx.netTotalFromArithmetic === 9208.4, "gross - discount = final total");
assert(ctx.finalTotal === 9208.4, "final total resolves to 9208.40");
assert(resolvePostDiscountInvoiceTotal(golden305eCorpus) === 9208.4, "post-discount total = 9208.40");

console.log("\nSupported label variants");

for (const label of ["Gross Amount", "Gross amount", "Gross value"]) {
  const variant = `${label} € 9.493,20\nValue of discount 284,80\nTotal amount € 9.208,40`;
  assert(
    extractInvoiceDiscountContext(variant).preDiscountAmount === 9493.2,
    `${label} → pre-discount amount`
  );
}

for (const label of ["Value of discount", "Discount value"]) {
  const variant = `Gross Amount € 9.493,20\n${label} 284,80\nTotal amount € 9.208,40`;
  assert(
    extractInvoiceDiscountContext(variant).discountAmount === 284.8,
    `${label} → discount amount`
  );
}

console.log("\nInvoice value remains final total");

const invoice: NormalizedInvoice = {
  invoice_number: "305/E",
  total_value: "9.208,40",
  total_value_numeric: 9208.4,
  ocr_text: golden305eCorpus,
  items: [{ description: "Rows", quantity: 1, line_total: "9.493,20" }],
};

assert(resolveInvoiceValue(invoice) === 9208.4, "canonical invoice total remains 9208.40");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
