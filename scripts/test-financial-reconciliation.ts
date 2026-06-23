/**
 * Unit tests for invoice financial reconciliation.
 * Run: npm run test:financial-reconciliation
 */

import { reconcileInvoiceFinancials } from "../src/lib/export-auditor/financial-reconciliation";
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

console.log("Golden 305/E discount reconciliation");

const golden305eInvoice: NormalizedInvoice = {
  invoice_number: "305/E",
  total_value: "9.208,40",
  total_value_numeric: 9208.4,
  ocr_text: `
Gross Amount € 9.493,20
Discount 3,0
Value of discount 284,80
Total amount € 9.208,40
`,
  items: [{ description: "Recovered commercial rows", quantity: 1, line_total: "9.493,20" }],
};

const pass = reconcileInvoiceFinancials(golden305eInvoice);
assert(pass.validation_status === "PASS", "gross minus discount reconciles invoice total");
assert(pass.invoice_total === 9208.4, "invoice total remains 9208.40");
assert(pass.calculated_total === 9208.4, "calculated total is discount-adjusted");
assert(pass.difference === 0, "no reconciliation difference");
assert(pass.warning == null, "no reconciliation warning");
assert(pass.likely_ocr_failure === false, "not flagged as OCR failure");

console.log("\nMismatch guardrails");

const unrelatedMismatch: NormalizedInvoice = {
  invoice_number: "NO-DISCOUNT",
  total_value_numeric: 9208.4,
  ocr_text: "Total amount € 9.208,40",
  items: [{ description: "Rows", quantity: 1, line_total: "9.493,20" }],
};
const mismatch = reconcileInvoiceFinancials(unrelatedMismatch);
assert(mismatch.validation_status === "WARNING", "unrelated 3% mismatch remains WARNING");
assert(mismatch.difference === 284.8, "unrelated mismatch difference remains 284.80");
assert(mismatch.warning != null, "unrelated mismatch still warns");

const nonMatchingGross: NormalizedInvoice = {
  invoice_number: "BAD-GROSS",
  total_value_numeric: 9208.4,
  ocr_text: `
Gross Amount € 9.493,20
Value of discount 284,80
Total amount € 9.208,40
`,
  items: [{ description: "Rows", quantity: 1, line_total: "9.350,00" }],
};
const badGross = reconcileInvoiceFinancials(nonMatchingGross);
assert(badGross.validation_status === "WARNING", "discount does not suppress line sum that does not match gross");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
