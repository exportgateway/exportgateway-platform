/**
 * OCR recovery hardening regression — AS2026 live layout fixes.
 * Run: npm run test:ocr-recovery-hardening
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  extractBlockAfterLabel,
  extractEnglishConsignee,
  extractTradeNameFromBuyerLine,
  extractEnglishLineItemsWithDiagnostics,
} from "../src/lib/export-auditor/english-invoice-field-extractor";
import {
  findLargestMonetaryAmount,
  resolveRecoveryInvoiceTotalReference,
  validateAndCorrectInvoiceTotal,
} from "../src/lib/export-auditor/invoice-total-validation";
import { isParserVatRateAsTotal } from "../src/lib/export-auditor/parser-invoice-total-guards";
import {
  extractInvoiceDiscountContext,
  extractVatInclusiveInvoiceTotal,
  isPreDiscountInvoiceAmount,
} from "../src/lib/export-auditor/invoice-discount-context";
import { extractLabeledInvoiceTotal } from "../src/lib/export-auditor/money-token-extract";
import { isDateLikeMonetaryToken } from "../src/lib/export-auditor/monetary-date-filter";
import { buildOcrObservability } from "../src/lib/export-auditor/ocr-observability";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import {
  parseQuantity,
  isQuantityArithmeticConsistent,
  QUANTITY_PARSING_WARNING,
} from "../src/lib/export-auditor/parse-quantity";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const LIVE_PDF_TEXT = fs
  .readFileSync(path.join(__dirname, "fixtures/as2026-live-pdfText.txt"), "utf8")
  .trim();
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/as2026-1069-ocr.json"), "utf8")
) as NormalizedInvoice;

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

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

console.log("OCR Recovery Hardening — regression tests\n");

console.log("FIX #1 — Recipient block not terminated by Date:");

const liveRecipientBlock = extractBlockAfterLabel(
  LIVE_PDF_TEXT,
  /Recipient\s*:?\s*/i,
  10,
  "address"
);
assert(
  liveRecipientBlock.some((l) => l.includes("Dragiše Mišovića")),
  "Recipient block includes Dragiše Mišovića after Date line"
);

const liveConsignee = extractEnglishConsignee(LIVE_PDF_TEXT);
assert(
  !liveConsignee?.includes("QR for payment"),
  "consignee extraction excludes QR payment text"
);
assert(liveConsignee?.includes("Braca Maric") === true, "live pdf consignee includes Braca Maric");
assert(liveConsignee?.includes("Dragiše Mišovića") === true, "live pdf consignee includes address");

console.log("\nFIX #2 — Buyer trade name before d.o.o.:");

assert(
  extractTradeNameFromBuyerLine('Z.T.R. "Braca Maric" Apecs.S d.o.o.') === "Braca Maric",
  "extract trade name from mixed buyer line"
);

console.log("\nFIX #3 — Date values excluded from monetary fallback:");

assert(
  isDateLikeMonetaryToken("Date: 21.05.2026", 6, "21.05"),
  "21.05 flagged as date fragment"
);
assert(findLargestMonetaryAmount("Date: 21.05.2026\nDue date: 05.06.2026") !== 21.05, "largest monetary ignores invoice dates");

const corpusWithDateOnly = "Date: 21.05.2026\nPayment amount: 1.500,00 EUR";
const totalRef = resolveRecoveryInvoiceTotalReference({ items: [] }, corpusWithDateOnly);
assert(totalRef === 1500, "falls back to non-date monetary when no labeled total");

const vatCorpus =
  "Total w/o VAT 17.861,24\nVAT 22% 3.929,06\nVAT base at 22% 17.861,24\nTotal invoice amount: 21.790,30 EUR";
assert(
  resolveRecoveryInvoiceTotalReference({ items: [] }, vatCorpus) === 21790.3,
  "labeled total wins over VAT base"
);
assert(
  findLargestMonetaryAmount(vatCorpus) !== 17861.24,
  "largest monetary excludes Total w/o VAT line"
);

console.log("\nFIX #3b — Parser VAT rate (22) mistaken as invoice total:");

assert(isParserVatRateAsTotal(22, "VAT 22% 3.929,06"), "22 flagged as VAT rate on VAT line");

const vatParserTotal = validateAndCorrectInvoiceTotal(
  { ...FIXTURE, total_value_numeric: 22, total_value: "22", items: [] },
  vatCorpus
);
assert(
  resolveInvoiceValue(vatParserTotal.invoice) === 21790.3,
  "corrects parser total 22 → 21790.30 from labeled total"
);
assert(vatParserTotal.corrected === true, "VAT-as-total correction flagged");

console.log("\nFIX #3c — European thousands + amount_eur fragment:");

assert(
  extractLabeledInvoiceTotal("Total invoice amount: 21 790,30 EUR") === 21790.3,
  "space thousands 21 790,30 → 21790.30"
);
assert(
  extractLabeledInvoiceTotal("Total invoice amount: EUR 21.790,30") === 21790.3,
  "EUR prefix before amount → 21790.30"
);
assert(
  extractLabeledInvoiceTotal("Total invoice amount: 21.790,30 EUR") === 21790.3,
  "dot thousands 21.790,30 → 21790.30"
);
assert(
  extractLabeledInvoiceTotal("Total invoice amount: 21,790.30 EUR") === 21790.3,
  "comma thousands US 21,790.30 → 21790.30"
);

const fragmentInvoice = validateAndCorrectInvoiceTotal(
  {
    ...FIXTURE,
    total_value_numeric: 790.3,
    total_value: "790,30",
    amount_eur: "790,30",
    items: [],
  },
  vatCorpus
);
assert(
  resolveInvoiceValue(fragmentInvoice.invoice) === 21790.3,
  "resolveInvoiceValue ignores truncated amount_eur 790,30"
);

console.log("\nFIX #3d — Pre-discount Amount vs Total invoice amount after discount:");

const DISCOUNT_CORPUS = [
  "Amount: 22.235,00",
  "Discount: 444,70",
  "Total invoice amount: 21.790,30 EUR",
  "Amount to be paid: 21.790,30 EUR",
].join("\n");

const discountCtx = extractInvoiceDiscountContext(DISCOUNT_CORPUS);
assert(discountCtx.preDiscountAmount === 22235, "pre-discount Amount 22235");
assert(discountCtx.discountAmount === 444.7, "discount 444.70");
assert(discountCtx.finalTotal === 21790.3, "labeled final total 21790.30");
assert(discountCtx.netTotalFromArithmetic === 21790.3, "amount - discount = 21790.30");
assert(isPreDiscountInvoiceAmount(22235, DISCOUNT_CORPUS), "22235 flagged as pre-discount");
assert(!isPreDiscountInvoiceAmount(21790.3, DISCOUNT_CORPUS), "21790.30 not pre-discount");

const preDiscountParser = validateAndCorrectInvoiceTotal(
  {
    ...FIXTURE,
    total_value_numeric: 22235,
    total_value: "22.235,00",
    amount_eur: "22.235,00",
    items: [],
  },
  DISCOUNT_CORPUS
);
assert(
  resolveInvoiceValue(preDiscountParser.invoice) === 21790.3,
  "corrects pre-discount parser total 22235 → 21790.30"
);
assert(preDiscountParser.corrected === true, "pre-discount correction flagged");

const preDiscountNoLabelCorpus = "Amount: 22.235,00\nDiscount: 444,70\nAmount to be paid: 21.790,30 EUR";
assert(
  resolveInvoiceValue({
    ...FIXTURE,
    ocr_text: preDiscountNoLabelCorpus,
    total_value_numeric: 22235,
    amount_eur: 22235,
    items: [],
  }) === 21790.3,
  "Amount to be paid wins when Total invoice amount label missing"
);

assert(
  resolveInvoiceValue({
    ...FIXTURE,
    ocr_text: "Amount: 22.235,00\nDiscount: 444,70",
    total_value_numeric: 22235,
    amount_eur: 22235,
    items: [],
  }) === 21790.3,
  "discount arithmetic recovers final total without labeled total line"
);

assert(
  findLargestMonetaryAmount(DISCOUNT_CORPUS) !== 22235,
  "largest monetary excludes pre-discount Amount line"
);

const totalAmountPreDiscountCorpus =
  "Amount: 22.235,00\nDiscount: 444,70\nTotal amount: 22.235,00 EUR";
assert(
  extractLabeledInvoiceTotal(totalAmountPreDiscountCorpus) === null,
  "Total amount pre-discount label skipped when discount present"
);
assert(
  resolveInvoiceValue({
    ...FIXTURE,
    ocr_text: totalAmountPreDiscountCorpus,
    total_value_numeric: 22235,
    amount_eur: 22235,
    items: [],
  }) === 21790.3,
  "Total amount 22235 ignored — uses discount arithmetic 21790.30"
);

const vatOnlyCorpus = LIVE_PDF_TEXT.replace(/Total invoice amount:[^\n]+\n?/i, "").replace(
  /Amount to be paid:[^\n]+\n?/i,
  ""
);
assert(
  extractVatInclusiveInvoiceTotal(vatOnlyCorpus) === 21790.3,
  "VAT net + VAT amount = 21790.30"
);
assert(
  resolveInvoiceValue({
    ...FIXTURE,
    ocr_text: vatOnlyCorpus,
    total_value_numeric: 22235,
    amount_eur: 22235,
    items: [],
  }) === 21790.3,
  "parser 22235 corrected via VAT arithmetic when final labels missing"
);

const TABULAR_SUMMARY_OCR = [
  "amount VAT amount Total invoice amount Amount to be paid",
  "22 235,00 444,70 21 790,30 0,00 21 790,30 21 790,30",
].join("\n");
assert(
  extractLabeledInvoiceTotal(TABULAR_SUMMARY_OCR) === 21790.3,
  "tabular summary row Total invoice amount column = 21790.30"
);
assert(
  resolveInvoiceValue({
    ...FIXTURE,
    ocr_text: TABULAR_SUMMARY_OCR,
    total_value_numeric: 22235,
    amount_eur: 22235,
    items: [],
  }) === 21790.3,
  "parser 22235 corrected from tabular summary row layout"
);

console.log("\nFIX #4 — Partial line item reconstruction:");

const lineResult = extractEnglishLineItemsWithDiagnostics(LIVE_PDF_TEXT);
assert(lineResult.items.length === 3, "live pdf extracts 3 line items");
assert(lineResult.items[0]?.description?.includes("Ventil") === true, "first line description recovered");
assert(Number(lineResult.items[0]?.line_total) > 0, "first line value recovered");

console.log("\nFIX #5 — Quantity thousand-separator normalization:");

assert(parseQuantity("1 400") === 1400, "1 400 → 1400");
assert(parseQuantity("2 000 pcs") === 2000, "2 000 pcs → 2000");
assert(parseQuantity("1.400") === 1400, "1.400 → 1400");
assert(parseQuantity("2.000") === 2000, "2.000 → 2000");
assert(parseQuantity("1,400") === 1400, "1,400 → 1400");
assert(isQuantityArithmeticConsistent(1400, 5.73, 8026.2), "8026.20 / 1400 ≈ 5.73 valid");
assert(!isQuantityArithmeticConsistent(1, 5.73, 8026.2), "8026.20 / 1 vs unit 5.73 invalid");

const qtyLines = extractEnglishLineItemsWithDiagnostics(LIVE_PDF_TEXT);
assert(Number(qtyLines.items[0]?.quantity) === 1400, "line 1 quantity 1400");
assert(Number(qtyLines.items[1]?.quantity) === 100, "line 2 quantity 100");
assert(Number(qtyLines.items[2]?.quantity) === 2000, "line 3 quantity 2000");
const totalQty = qtyLines.items.reduce(
  (sum, item) => sum + parseQuantity(item.quantity),
  0
);
assert(totalQty === 3500, "total quantity 3500");

console.log("\nFIX #6 — Recovery observability:");

const enrichedLive = enrichInvoiceDocument(
  {
    ...FIXTURE,
    ocr_text: LIVE_PDF_TEXT,
    incoterms: "DAP",
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
  },
  LIVE_PDF_TEXT
);

const obs = buildOcrObservability(enrichedLive, 1);
assert(obs.recoveryApplied?.consigneeRecovery === true, "consignee recovery flagged");
assert(obs.recoveryApplied?.totalRecovery === true, "total recovery flagged");
assert(obs.recoveryApplied?.lineRecovery === true, "line recovery flagged");
assert((obs.recoveryConfidence ?? 0) >= 80, "recovery confidence >= 80%");
assert(enrichedLive.document_flags?.line_items_recovered === true, "line_items_recovered diagnostic set");

console.log("\nSUCCESS CRITERIA — AS2026-1069 live layout:");

assert(enrichedLive.consignee?.includes("Braca Maric") === true, "consignee Braca Maric");
assert(enrichedLive.country_code === "RS", "destination RS");
assert(Math.abs(resolveInvoiceValue(enrichedLive) - 21790.3) < 0.01, "invoice value 21790.30");
assert((enrichedLive.items?.length ?? 0) === 3, "3 line items");
assert((obs.dataExtractionCompleteness ?? 0) >= 90, "data extraction >= 90%");
assert(enrichedLive.document_flags?.[QUANTITY_PARSING_WARNING] !== true, "no quantity parsing warning when arithmetic valid");

const report = mapAuditReportToExportReport(enrichedLive, minimalAudit(), "AS2026-1069.pdf");
assert(report.customsReadiness?.status === "CUSTOMS_REVIEW", "customs status CUSTOMS_REVIEW");

const totalValidation = validateAndCorrectInvoiceTotal(
  { ...FIXTURE, total_value_numeric: 22, items: lineResult.items },
  LIVE_PDF_TEXT
);
assert(totalValidation.corrected === true, "total correction from line sum or labeled total");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
