/**
 * Invoice total hardening — advance payments, deposits, remaining balance.
 * Run: npm run test:invoice-total-advance-payment
 */

import {
  extractMonetaryCandidates,
  findLargestMonetaryAmount,
  invoiceTotalMatchesKnownSource,
  isInvoiceTotalInconsistent,
  validateAndCorrectInvoiceTotal,
  TOTAL_VALUE_PARSING_ERROR,
} from "../src/lib/export-auditor/invoice-total-validation";
import { isExcludedMonetaryContext } from "../src/lib/export-auditor/monetary-exclusion-filter";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
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

const ADVANCE_PAYMENT_CORPUS = `
Commercial Invoice INV-ADV-001
Exporter: Acme GmbH
Consignee: Buyer d.o.o.
Destination: RS

Pos  Description  Qty  Unit price  Total
1    Widget A     10   850.00      8500.00

Invoice total: 8500.00 EUR
Advance payment: 8500.00 EUR
Remaining balance: 0.00 EUR
`.trim();

const SLOVENIAN_ADVANCE_CORPUS = `
Račun R-2024-99
Izvoznik: Podjetje d.o.o.
Prejemnik: Kupec d.o.o.
Destinacija: RS

Predujem: 3.200,00 EUR
Skupaj za plačilo: 3.200,00 EUR
Ostane za plačilo: 0,00 EUR
`.trim();

function baseInvoice(overrides: Partial<NormalizedInvoice> = {}): NormalizedInvoice {
  return {
    exporter: "Acme GmbH",
    consignee: "Buyer d.o.o.",
    invoice_number: "INV-ADV-001",
    country_code: "RS",
    country: "Serbia",
    currency: "EUR",
    incoterms: "DAP",
    total_value_numeric: 8500,
    total_value: "8,500.00",
    items: [
      {
        description: "Widget A",
        quantity: 10,
        unit_price: 850,
        line_total: 8500,
        hs_code: "84381090",
        gross_weight: 120,
      },
    ],
    gross_weight_total: 120,
    shipment_summary: { package_count: 1, gross_weight_total: 120 },
    ...overrides,
  };
}

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 85, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

console.log("Invoice total advance payment hardening\n");

console.log("1. Monetary exclusion — advance / deposit / balance lines");

const advanceIdx = ADVANCE_PAYMENT_CORPUS.indexOf("8500.00 EUR", ADVANCE_PAYMENT_CORPUS.indexOf("Advance payment"));
assert(advanceIdx > 0, "advance payment amount located in corpus");
assert(
  isExcludedMonetaryContext(ADVANCE_PAYMENT_CORPUS, advanceIdx),
  "advance payment line excluded from monetary candidates"
);

const balanceCorpus = "Invoice total: 5000.00 EUR\nRemaining balance: 500.00 EUR";
const balanceIdx = balanceCorpus.indexOf("500.00", balanceCorpus.indexOf("Remaining"));
assert(balanceIdx > 0, "remaining balance amount located in corpus");
assert(
  isExcludedMonetaryContext(balanceCorpus, balanceIdx),
  "remaining balance line excluded from monetary candidates"
);

const predujemIdx = SLOVENIAN_ADVANCE_CORPUS.indexOf("3.200,00");
assert(predujemIdx > 0, "predujem amount located");
assert(
  isExcludedMonetaryContext(SLOVENIAN_ADVANCE_CORPUS, predujemIdx),
  "predujem line excluded"
);

console.log("\n2. Canonical total match suppresses parsing error");

const invoice = baseInvoice();
assert(
  invoiceTotalMatchesKnownSource(8500, ADVANCE_PAYMENT_CORPUS, invoice),
  "8500 matches line sum and labeled invoice total"
);

const validated = validateAndCorrectInvoiceTotal(invoice, ADVANCE_PAYMENT_CORPUS);
assert(validated.hasError === false, "no TOTAL_VALUE_PARSING_ERROR for advance payment layout");
assert(
  validated.invoice.document_flags?.[TOTAL_VALUE_PARSING_ERROR] !== true,
  "document flag not set"
);

const candidates = extractMonetaryCandidates(ADVANCE_PAYMENT_CORPUS);
assert(candidates.includes(8500), "invoice total amount still in candidates");
assert(
  findLargestMonetaryAmount(ADVANCE_PAYMENT_CORPUS) === 8500,
  "largest monetary amount is invoice total, not excluded advance duplicate"
);

console.log("\n3. Genuine mismatch (>5%) still flags review, not blocked");

const mismatchCorpus = `
Pos  Description  Total
1    Widget       8500.00

Amount due on document: 8500.00 EUR
`.trim();

assert(
  isInvoiceTotalInconsistent(1000, mismatchCorpus, baseInvoice({ total_value_numeric: 1000 })),
  "parser total 1000 inconsistent with 8500 document amounts (>5%)"
);
assert(
  !invoiceTotalMatchesKnownSource(1000, mismatchCorpus, baseInvoice({ total_value_numeric: 1000 })),
  "1000 does not match line sum or labeled total"
);

const mismatchInvoiceWithFlag = baseInvoice({
  document_flags: { [TOTAL_VALUE_PARSING_ERROR]: true },
});
const mismatchReport = mapAuditReportToExportReport(
  mismatchInvoiceWithFlag,
  minimalAudit(),
  "mismatch.pdf"
);
mismatchReport.shipmentSummary = {
  ...mismatchReport.shipmentSummary,
  grossWeightTotal: 120,
};
const mismatchReadiness = evaluateCustomsReadiness(mismatchReport, mismatchInvoiceWithFlag);
assert(
  mismatchReadiness.status === "CUSTOMS_REVIEW",
  "TOTAL_VALUE_PARSING_ERROR alone → CUSTOMS_REVIEW"
);
assert(
  mismatchReadiness.status !== "CUSTOMS_BLOCKED",
  "TOTAL_VALUE_PARSING_ERROR does not block customs"
);

console.log("\n4. Advance payment layout → CUSTOMS_READY when foundation complete");

const readyReport = mapAuditReportToExportReport(validated.invoice, minimalAudit(), "advance.pdf");
readyReport.shipmentSummary = {
  ...readyReport.shipmentSummary,
  grossWeightTotal: 120,
  packageCount: 1,
};
readyReport.invoiceSummary = {
  ...readyReport.invoiceSummary,
  incoterms: "DAP",
};

const readyReadiness = evaluateCustomsReadiness(readyReport, validated.invoice);
assert(readyReadiness.status === "CUSTOMS_READY", "advance payment invoice → CUSTOMS_READY");
assert(
  readyReadiness.status !== "CUSTOMS_BLOCKED",
  "advance payment invoice not blocked"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
