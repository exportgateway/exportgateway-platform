/**
 * Invoice value consistency — canonical total across all UI sections.
 * Run: npm run test:invoice-value-consistency
 */

import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  assertInvoiceValueConsistent,
  collectInvoiceValueSurfaces,
} from "../src/lib/export-auditor/invoice-value-consistency";
import {
  formatInvoiceValueDisplay,
  resolveInvoiceValue,
  sumLineTotals,
} from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const EXPECTED_2602002968 = 1610.7;

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

function buildAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 67, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: false,
    },
    issues: [],
    recommended_actions: [],
    summary: "Review.",
  };
}

console.log("resolveInvoiceValue — header priority over inflated line sum");
const inflatedLines: NormalizedInvoice = {
  invoice_number: "2602002968",
  currency: "EUR",
  total_value: "1610.70",
  items: Array.from({ length: 38 }, (_, index) => ({
    position_number: index + 1,
    description: `Line ${index + 1}`,
    quantity: 1,
    line_total: "60.556,25",
  })),
};
const inflatedSum = sumLineTotals(inflatedLines.items);
assert(inflatedSum != null && inflatedSum > 1_000_000, "inflated line sum simulates OCR corruption");
assert(
  Math.abs(resolveInvoiceValue(inflatedLines) - EXPECTED_2602002968) < 0.01,
  `canonical value uses header 1610.70 (got ${resolveInvoiceValue(inflatedLines)})`
);

console.log("\nresolveInvoiceValue — FA26022525 mis-OCR header still uses line sum");
const faLines: NormalizedInvoice = {
  currency: "EUR",
  total_value: "158.624,01",
  items: [
    { line_total: "1,123.50", quantity: 1, unit_price: "1,123.50" },
    { line_total: "2,884.00", quantity: 2, unit_price: "1,442.00" },
    { line_total: "953.40", quantity: 2, unit_price: "476.70" },
    { line_total: "191.80", quantity: 2, unit_price: "95.90" },
    { line_total: "191.80", quantity: 2, unit_price: "95.90" },
    { line_total: "249.20", quantity: 2, unit_price: "124.60" },
  ],
};
assert(
  Math.abs(resolveInvoiceValue(faLines) - 5593.7) < 0.01,
  `mis-OCR header reconciled to line sum 5593.70 (got ${resolveInvoiceValue(faLines)})`
);

console.log("\nAmount EUR field has highest priority");
const amountEurInvoice: NormalizedInvoice = {
  currency: "EUR",
  amount_eur: "1610.70",
  total_value: "9999.99",
  items: [{ line_total: "5000.00", quantity: 1, unit_price: "5000.00" }],
};
assert(
  Math.abs(resolveInvoiceValue(amountEurInvoice) - EXPECTED_2602002968) < 0.01,
  "amount_eur overrides header and lines"
);

async function main() {
  console.log("\n2602002968 — all UI sections show EUR 1.610,70");
  const FIXTURE_PATH = path.join(__dirname, "fixtures", "2602002968-ocr.json");
  const PDF_PATH =
    process.env.GOLDEN_PDF_2602002968 ||
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\2602002968.pdf";

  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error("  fixture missing");
    process.exit(1);
  }

  const rawInvoice = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
  let pdfText = "";
  if (fs.existsSync(PDF_PATH)) {
    pdfText = await extractPdfText(fs.readFileSync(PDF_PATH));
  } else {
    pdfText = [rawInvoice.footer_text, rawInvoice.vat_article].filter(Boolean).join("\n");
  }

  const invoice = enrichInvoiceDocument(rawInvoice, pdfText);
  const report = mapAuditReportToExportReport(invoice, buildAudit(), "2602002968.pdf");

  const consistency = assertInvoiceValueConsistent(report, EXPECTED_2602002968);
  assert(consistency.ok, "all sections consistent at 1610.70 EUR");
  if (!consistency.ok) {
    for (const mismatch of consistency.mismatches) {
      console.error(`    ${mismatch}`);
    }
  }

  for (const surface of collectInvoiceValueSurfaces(report)) {
    assert(
      Math.abs(surface.amount - EXPECTED_2602002968) < 0.01,
      `${surface.id} = ${EXPECTED_2602002968} (${surface.display})`
    );
  }

  assert(
    formatInvoiceValueDisplay(report.invoiceSummary.invoiceValue, "EUR") === "EUR 1.610,70",
    `executive display format EUR 1.610,70 (got "${formatInvoiceValueDisplay(report.invoiceSummary.invoiceValue, "EUR")}")`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
