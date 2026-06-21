import assert from "node:assert/strict";
import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  annotateOcrTableRecovery,
  buildOcrTableRecoveryDiagnostics,
  evaluateOcrRecoveryQuality,
  filterGenericIssuesForOcrTableFailure,
  hasInvoiceMetadata,
  OCR_TABLE_NOT_EXTRACTED,
  OCR_TABLE_NOT_EXTRACTED_MESSAGE,
  OCR_TABLE_RECOVERY_REJECTED,
  mergeRecoveredInvoiceItems,
  ocrTableRecoveryIssues,
  shouldAttemptSecondaryOcrTableRecovery,
} from "@/lib/export-auditor/ocr-table-recovery";
import {
  enrichEnglishInvoiceFieldsFromOcr,
  evaluateTableReconstructionQuality,
  extractEnglishLineItemsWithDiagnostics,
  TABLE_RECONSTRUCTION_REJECTED,
} from "@/lib/export-auditor/english-invoice-field-extractor";
import { detectCommercialGoodsLines } from "@/lib/export-auditor/commercial-line-detector";
import type { AuditIssue } from "@/lib/export-auditor/types";

const rawScannedInvoice: NormalizedInvoice = {
  country: "ME",
  country_code: "ME",
  currency: "EUR",
  items: [],
  ocr_text: "x".repeat(1200),
  shipment_summary: {
    package_count: null,
    package_type: null,
    gross_weight_total: null,
    gross_weight_unit: null,
    net_weight_total: 1881.96,
    net_weight_unit: "kg",
    pallet_dimensions: null,
    pallet_count: 5,
  },
  delivery_address: {
    company: "GRATIS BAR d.o.o.",
    address: "Bulevar Revolucije bb",
    city: "Bar",
    postal_code: null,
    country: "Crna Gora",
    country_code: "ME",
  },
  ocr_metadata: {
    page_count: 2,
    pdf_text_length: 0,
    ocr_text_length: 1200,
    raw_ocr_has_ocr_text: true,
    raw_ocr_has_delivery_address: true,
  },
};

assert.equal(hasInvoiceMetadata(rawScannedInvoice), true, "metadata detected");
assert.equal(
  shouldAttemptSecondaryOcrTableRecovery(rawScannedInvoice),
  true,
  "secondary recovery should run for zero items with metadata"
);

const failedRecovery = buildOcrTableRecoveryDiagnostics(rawScannedInvoice, rawScannedInvoice, {
  pdfText: "-- 1 of 2 --\n\n-- 2 of 2 --",
  secondaryRecoveryAttempted: true,
  secondaryRecoveryError: "Request failed (404)",
});

assert.equal(failedRecovery.status, OCR_TABLE_NOT_EXTRACTED, "status is OCR_TABLE_NOT_EXTRACTED");
assert.equal(failedRecovery.ocr_raw_items, 0, "raw item count stored");
assert.equal(failedRecovery.ocr_recovered_items, 0, "recovered item count stored");
assert.equal(failedRecovery.scanned_image_invoice, true, "scanned invoice detected");

const failureIssues = ocrTableRecoveryIssues(failedRecovery);
assert.equal(failureIssues.length, 1, "one OCR table issue emitted");
assert.equal(failureIssues[0]?.field, OCR_TABLE_NOT_EXTRACTED, "issue code stored");
assert.equal(failureIssues[0]?.message, OCR_TABLE_NOT_EXTRACTED_MESSAGE, "explicit UI message");

const genericIssues: AuditIssue[] = [
  {
    id: "NO_HS_CODES_DETECTED",
    type: "warning",
    field: "NO_HS_CODES_DETECTED",
    message: "No HS codes detected.",
  },
  {
    id: "TRACEABILITY_MISSING",
    type: "error",
    field: "TRACEABILITY_MISSING",
    message: "Line items extracted but position traceability table is empty",
  },
  {
    id: "MISSING_DESTINATION",
    type: "error",
    field: "MISSING_DESTINATION",
    message: "Destination missing.",
  },
];
const filtered = filterGenericIssuesForOcrTableFailure(genericIssues, failedRecovery);
assert.deepEqual(
  filtered.map((issue) => issue.id),
  ["MISSING_DESTINATION"],
  "generic zero-line customs warnings are suppressed"
);

const recoveredInvoice: NormalizedInvoice = {
  ...rawScannedInvoice,
  items: [
    {
      position_number: 1,
      item_code: "SKU-1",
      description: "Recovered product row",
      quantity: "2",
      unit_price: "10.00",
      line_total: "20.00",
    },
  ],
  document_flags: { line_items_recovered: true },
  parser_recovery_provenance: [
    {
      field: "line_items",
      original_value: null,
      recovered_value: "1",
      recovery_source: "TABLE_RECONSTRUCTION",
    },
  ],
};

const recovered = annotateOcrTableRecovery(rawScannedInvoice, recoveredInvoice, {
  pdfText: "",
  secondaryRecoveryAttempted: false,
});

assert.equal(recovered.ocr_table_recovery?.status, "RECOVERED", "recovered status stored");
assert.equal(
  recovered.ocr_table_recovery?.recovery_source,
  "TABLE_RECONSTRUCTION",
  "recovery source stored"
);
assert.equal(recovered.ocr_metadata?.ocr_raw_items, 0, "raw items copied to metadata");
assert.equal(recovered.ocr_metadata?.ocr_recovered_items, 1, "recovered items copied to metadata");

const fa26022525Primary: NormalizedInvoice = {
  invoice_number: "FA26022525",
  invoice_date: "26.02.2025",
  exporter: "robot coupe",
  consignee: "OSA TERMOSISTEM",
  country: "KOSOVO",
  country_code: "XK",
  incoterms: "EXW",
  currency: "EUR",
  total_value: "5,593.70",
  total_value_numeric: 5593.7,
  items: [
    {
      position_number: 1,
      description: "J80 230/50/1",
      quantity: 1,
      unit_price: "1,123.50",
      line_total: "1,123.50",
      hs_code: "8438809900",
      country_of_origin: "FR",
    },
    {
      position_number: 2,
      description: "CL50E ULTRA 230/50/1",
      quantity: 2,
      unit_price: "1,442.00",
      line_total: "2,884.00",
      hs_code: "8438809900",
      country_of_origin: "FR",
    },
    {
      position_number: 3,
      description: "PACK-5D-HUN-EXPERT Mineral+",
      quantity: 2,
      unit_price: "476.70",
      line_total: "953.40",
      hs_code: "8438809900",
      country_of_origin: "FR",
    },
    {
      position_number: 4,
      description: "S-5MM-SLICER DISC-EXPERT Mineral+",
      quantity: 2,
      unit_price: "95.90",
      line_total: "191.80",
      hs_code: "8438809900",
      country_of_origin: "FR",
    },
    {
      position_number: 5,
      description: "S-10MM-SLICER DISC-EXPERT Mineral+",
      quantity: 2,
      unit_price: "95.90",
      line_total: "191.80",
      hs_code: "8438809900",
      country_of_origin: "FR",
    },
    {
      position_number: 6,
      description: "J-3X3MM-JULIENNE DISC-EXPERT Mineral+",
      quantity: 2,
      unit_price: "124.60",
      line_total: "249.20",
      hs_code: "8438809900",
      country_of_origin: "FR",
    },
  ],
};

const malformedTwoRowRecovery: NormalizedInvoice = {
  country: "KOSOVO",
  country_code: "XK",
  currency: "EUR",
  total_value: "5,593.70",
  total_value_numeric: 5593.7,
  items: [
    {
      position_number: 48,
      description: "rue des Vignerons - BP 157 12 avenue Marechal Leclerc - BP",
      quantity: 1,
      line_total: "134.00",
      hs_code: "60014222816",
    },
    {
      position_number: 642,
      description: "OF THE PRODUCTS COVERED BY THIS invoice declaration footer",
      quantity: 1,
      line_total: "4,643.00",
    },
  ],
};

const unsafeDecision = evaluateOcrRecoveryQuality(
  fa26022525Primary,
  malformedTwoRowRecovery
);
assert.equal(unsafeDecision.accepted, false, "unsafe 2-row recovery is rejected");
assert.match(
  unsafeDecision.rejection_reason ?? "",
  /recovered item count 2 is below minimum 3/,
  "low recovered item count is diagnosed"
);
assert.match(
  unsafeDecision.rejection_reason ?? "",
  /financial reconciliation failed/,
  "financial reconciliation failure is diagnosed"
);
assert.match(
  unsafeDecision.rejection_reason ?? "",
  /address\/footer content/,
  "address/footer row content is diagnosed"
);

const preservedInvoice = mergeRecoveredInvoiceItems(
  fa26022525Primary,
  malformedTwoRowRecovery,
  unsafeDecision
);
assert.equal(preservedInvoice.invoice_number, "FA26022525", "invoice number is preserved");
assert.equal(preservedInvoice.invoice_date, "26.02.2025", "invoice date is preserved");
assert.equal(preservedInvoice.incoterms, "EXW", "incoterms are preserved");
assert.equal(preservedInvoice.items?.length, 6, "six original line items are preserved");
assert.equal(
  preservedInvoice.items?.every((item) => item.hs_code === "8438809900"),
  true,
  "original HS 8438809900 is preserved"
);

const rejectedRawInvoice: NormalizedInvoice = {
  ...fa26022525Primary,
  items: [],
};
const rejectedAnnotated = annotateOcrTableRecovery(rejectedRawInvoice, rejectedRawInvoice, {
  secondaryRecoveryAttempted: true,
  recoveryQuality: unsafeDecision,
});
assert.equal(
  rejectedAnnotated.ocr_table_recovery?.status,
  OCR_TABLE_RECOVERY_REJECTED,
  "rejected recovery status is stored"
);
assert.equal(
  rejectedAnnotated.ocr_table_recovery?.ocr_recovered_items,
  2,
  "attempted recovered item count is retained in diagnostics"
);
assert.equal(
  rejectedAnnotated.ocr_table_recovery?.recovery_score,
  unsafeDecision.score,
  "recovery score is retained in diagnostics"
);
assert.match(
  rejectedAnnotated.ocr_table_recovery?.rejection_reason ?? "",
  /financial reconciliation failed/,
  "rejection reason is retained in diagnostics"
);

const goldenMalformedReconstructionCorpus = [
  "DIRECTION INTERNATIONALE ET COMMERCIALE ADMINISTRATION COMMERCIALE FRANCE",
  "48 rue des Vignerons - BP 157 12 avenue Marechal Leclerc - BP 134",
  "94305 VINCENNES CEDEX 71305 MONTCEAU-EN-BOURGOGNE CEDEX",
  "Tel. +33 (0)1 43 98 88 33 - Fax +33(0)1 43 74 36 26",
  "642 OF THE PRODUCTS COVERED BY THIS invoice declaration footer 4,643.00",
].join("\n");

const malformedLocalRows = extractEnglishLineItemsWithDiagnostics(
  goldenMalformedReconstructionCorpus
).items;
assert.equal(malformedLocalRows.length, 2, "malformed local reconstruction candidate has 2 rows");

const localGateDecision = evaluateTableReconstructionQuality(malformedLocalRows);
assert.equal(localGateDecision.accepted, false, "malformed local table reconstruction is rejected");
assert.match(
  localGateDecision.rejection_reason ?? "",
  /address\/footer\/legal text/,
  "local gate diagnoses address/footer text"
);
assert.match(
  localGateDecision.rejection_reason ?? "",
  /first position 48 is greater than 10/,
  "local gate diagnoses implausible first position"
);

const rejectedLocalEnriched = enrichEnglishInvoiceFieldsFromOcr({
  country: "KOSOVO",
  country_code: "XK",
  currency: "EUR",
  total_value: "5,593.70",
  total_value_numeric: 5593.7,
  items: [],
  ocr_text: goldenMalformedReconstructionCorpus,
});
assert.equal(
  rejectedLocalEnriched.items?.length ?? 0,
  0,
  "rejected local reconstruction keeps items empty so OCR recovery can run"
);
assert.equal(
  rejectedLocalEnriched.document_flags?.[TABLE_RECONSTRUCTION_REJECTED],
  true,
  "TABLE_RECONSTRUCTION_REJECTED flag is set"
);
assert.equal(
  rejectedLocalEnriched.items?.some((item) => item.hs_code === "60014222816"),
  false,
  "HS 60014222816 is not generated from address text"
);
assert.equal(
  detectCommercialGoodsLines(malformedTwoRowRecovery).length,
  0,
  "address/footer rows are not treated as commercial goods"
);

const validLocalRows = extractEnglishLineItemsWithDiagnostics(
  [
    "Position Description Quantity MU Price Amount",
    "1 SKU-A-100 Stainless mixer bowl 2 pcs 10.00 20.00",
    "2 SKU-B-200 Cutting disc 1 pcs 15.00 15.00",
    "3 SKU-C-300 Motor assembly 1 pcs 40.00 40.00",
  ].join("\n")
).items;
const validLocalDecision = evaluateTableReconstructionQuality(validLocalRows);
assert.equal(validLocalDecision.accepted, true, "valid local table reconstruction is accepted");

const goldenHeaderCorpus = [
  "DIRECTION INTERNATIONALE ET COMMERCIALE ADMINISTRATION COMMERCIALE FRANCE DIRECTION DES SERVICES FINANCIERS",
  "48 rue des Vignerons - BP 157",
  "94300 VINCENNES",
  "Robot Coupe",
  "Direction Internationale et Commerciale",
  "TVA FR16 642 018 989",
  "EORI Code : FR642007843",
  "",
  "Invoice Code",
  "INVOICE",
  "650330",
  "FA26022525",
  "Code: 650330",
  "Invoice: FA26022525",
  "Invoice date",
  "15/04/2026",
  "Delivery terms: EXW",
  "Currency: EUR",
  "Delivery address:",
  "OSA TERMOSISTEM",
  "Pristina Kosovo",
  "Reference number Description Orig. Customs HS code Delivered quantity Net unit price Net Total exc.VAT",
  "1 J80 230/50/1 FR 8438809900 1 1,123.50 1,123.50",
].join("\n");

const goldenHeaderRecovered = enrichEnglishInvoiceFieldsFromOcr({
  invoice_number: "650330",
  exporter: "FA26022525",
  items: fa26022525Primary.items,
  ocr_text: goldenHeaderCorpus,
});
assert.equal(goldenHeaderRecovered.invoice_number, "FA26022525", "GOLDEN invoice number recovered");
assert.equal(goldenHeaderRecovered.invoice_date, "15/04/2026", "GOLDEN invoice date recovered");
assert.equal(goldenHeaderRecovered.incoterms, "EXW", "GOLDEN incoterms recovered");
assert.equal(goldenHeaderRecovered.exporter, "Robot Coupe", "GOLDEN exporter recovered");
assert.equal(
  goldenHeaderRecovered.items?.some((item) => item.hs_code === "8438809900"),
  true,
  "GOLDEN HS 8438809900 preserved"
);

const weightSummaryOnlyTotal = enrichEnglishInvoiceFieldsFromOcr({
  invoice_number: "194",
  currency: "EUR",
  items: [],
  ocr_text: [
    "INVOICE 194",
    "LJUBLJANA, date 11.06.2026",
    "Number of euro pallets: 5",
    "Gross weight with euro pallets: 2066,32 kg",
    "Net weight: 1881,96 kg",
    "PARITETA: FCA Grosup",
  ].join("\n"),
});
assert.equal(
  weightSummaryOnlyTotal.total_value_numeric ?? null,
  null,
  "weight summary values are not recovered as invoice totals"
);
assert.equal(
  weightSummaryOnlyTotal.total_value ?? null,
  null,
  "weight summary values do not populate total_value"
);

const nextLineHeaderRecovered = enrichEnglishInvoiceFieldsFromOcr({
  items: [],
  ocr_text: [
    "Customer order number: CO-999",
    "INVOICE",
    "FA12345",
    "Invoice date",
    "15/04/2026",
    "Due date: 30/04/2026",
  ].join("\n"),
});
assert.equal(nextLineHeaderRecovered.invoice_number, "FA12345", "invoice number on next line recovered");
assert.equal(nextLineHeaderRecovered.invoice_date, "15/04/2026", "invoice date on next line recovered");

const deliveryOnlyConsignee = enrichEnglishInvoiceFieldsFromOcr({
  items: [],
  ocr_text: "",
  delivery_address: {
    company: "Delivery Only GmbH",
    address: "Teststrasse 1",
    city: "Berlin",
    postal_code: null,
    country: "Germany",
    country_code: "DE",
  },
});
assert.equal(
  deliveryOnlyConsignee.consignee,
  "Delivery Only GmbH",
  "delivery address company is promoted when OCR text is empty"
);

const deliveryOnlyFromOcr = enrichEnglishInvoiceFieldsFromOcr({
  items: [],
  ocr_text: "Delivery address\nDelivery Only GmbH\nBerlin Germany",
  delivery_address: {
    company: "Delivery Only GmbH",
    address: "Teststrasse 1",
    city: "Berlin",
    postal_code: null,
    country: "Germany",
    country_code: "DE",
  },
});
assert.match(
  deliveryOnlyFromOcr.consignee ?? "",
  /Delivery Only GmbH/,
  "delivery address company promoted to consignee"
);

const declarationNoiseRecovered = enrichEnglishInvoiceFieldsFromOcr({
  exporter: "THE EXPORTER OF THE PRODUCTS COVERED BY THIS DOCUMENT",
  items: [],
  ocr_text: [
    "Seller: Actual Exporter Ltd",
    "THE EXPORTER OF THE PRODUCTS COVERED BY THIS DOCUMENT",
    "DECLARES THAT THESE PRODUCTS ARE OF EU PREFERENTIAL ORIGIN.",
  ].join("\n"),
});
assert.equal(
  declarationNoiseRecovered.exporter,
  "Actual Exporter Ltd",
  "preferential origin declaration is not extracted as exporter"
);

const currencyWithoutTotalRecovery = enrichEnglishInvoiceFieldsFromOcr({
  invoice_number: "INV-USD-1",
  total_value: "100.00",
  total_value_numeric: 100,
  items: [
    {
      position_number: 1,
      description: "Valid line",
      quantity: 1,
      line_total: "100.00",
    },
  ],
  ocr_text: "Currency: USD\nTotal invoice amount 100.00",
});
assert.equal(
  currencyWithoutTotalRecovery.currency,
  "USD",
  "currency is recovered even when invoice total is already valid"
);

console.log("OCR table recovery tests passed");
