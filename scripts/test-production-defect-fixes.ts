/**
 * Production hardening regression suite — real invoice validation fixes.
 * Run: npm run test:production-defect-fixes
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import {
  extractEnglishInvoiceNumber,
  extractEnglishConsignee,
  extractEnglishExporter,
  extractEnglishInvoiceTotal,
  enrichEnglishInvoiceFieldsFromOcr,
  isRejectedConsigneeText,
  shouldRecoverLineItemsFromTable,
} from "../src/lib/export-auditor/english-invoice-field-extractor";
import { buildOcrObservability } from "../src/lib/export-auditor/ocr-observability";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import { reconcileInvoiceFinancials } from "../src/lib/export-auditor/financial-reconciliation";
import { extractInvoiceDiscountContext } from "../src/lib/export-auditor/invoice-discount-context";
import { evaluatePreferentialOriginDecision } from "../src/lib/export-auditor/preferential-origin-decision-engine";
import {
  runPreferentialOriginEngine,
  extractAuthorisedExporterNumber,
  parsePositionNumbers,
} from "../src/lib/export-auditor/preferential-origin-engine";
import {
  enrichInvoiceShipmentData,
  extractGrossWeight,
  extractLineItemNetWeightTotal,
  extractNetWeightFromDocument,
  extractPackageCount,
} from "../src/lib/export-auditor/shipment-summary-extractor";
import { resolveWeightHierarchy } from "../src/lib/export-auditor/weight-extraction-hierarchy";
import { aggregateLineNetWeightsForShipment } from "../src/lib/export-auditor/weight-line-aggregation";
import { evaluateWeightValidation } from "../src/lib/export-auditor/weight-validation";
import { evaluateCustomsReadiness } from "../src/lib/export-auditor/customs-readiness-engine";
import {
  filterSupersededPreferentialAuditIssues,
  resolveIssueCode,
} from "../src/lib/export-auditor/issue-readiness";
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

function baseAudit(extraIssues: AuditReportResponse["issues"] = []): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 85, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: extraIssues,
    recommended_actions: [],
    summary: "Review required.",
  };
}

console.log("1. AS2026-1069 — English invoice OCR recovery");

const AS2026_OCR = `Buyer:
Z.T.R. "Braca Maric"
Apecs.S d.o.o.
Grška ulica 13, 1000 Ljubljana
VAT number: SI49796712
Invoice Number: AS2026-1069
Recipient:
Dragiše Mišovića 169, 32000 Čačak
Srbija
Date: 21.05.2026
Total invoice amount: 21,790.30 EUR
Amount to be paid: 21,790.30 EUR
Pos Description Barcode Quantity MU Price Amount
1 Industrial valve 88001234 50 pcs 120.00 6000.00
2 Steel flange 88005678 100 pcs 85.50 8550.00
3 Gasket set 88009901 24 pcs 31.68 760.30
`;

assert(extractEnglishInvoiceNumber(AS2026_OCR) === "AS2026-1069", "extract invoice number");
assert(extractEnglishConsignee(AS2026_OCR)?.includes("Braca Maric") === true, "extract consignee");
assert(extractEnglishExporter(AS2026_OCR)?.includes("Apecs.S d.o.o.") === true, "extract exporter");
assert(extractEnglishInvoiceTotal(AS2026_OCR) === 21790.3, "extract invoice value 21790.30");

const as2026Parsed: NormalizedInvoice = enrichEnglishInvoiceFieldsFromOcr({
  ocr_text: AS2026_OCR,
  items: [],
});
assert(as2026Parsed.invoice_number === "AS2026-1069", "invoice number recovered");
assert(as2026Parsed.exporter?.includes("Apecs.S d.o.o.") === true, "exporter recovered");
assert(as2026Parsed.consignee?.includes("Braca Maric") === true, "consignee recovered");
assert(as2026Parsed.total_value_numeric === 21790.3, "invoice value recovered");
assert((as2026Parsed.items?.length ?? 0) === 3, "3 line items recovered from Pos table");

const as2026Enriched = enrichInvoiceDocument(
  {
    ...as2026Parsed,
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
  null
);
const as2026Obs = buildOcrObservability(as2026Enriched, 1);
assert((as2026Obs.dataExtractionCompleteness ?? 0) >= 80, "completeness >= 80% after recovery");
assert(as2026Enriched.document_flags?.PARSER_MAPPING_FAILURE !== true, "no parser failure flag when recovered");

console.log("\n1d. Sprint 3 — invoice total recovery rejects HS/tariff identifiers");

const SPRINT3_TARIFF_ONLY_OCR = `
RAČUN br.: 156/26
TARIFNI BROJEVI:
- Poz. 615.15-622.15: 73089098
- Poz. 430.0-435.0: 73090090
Plaćanje: u roku 90 dana
`;
const sprint3TariffOnly = enrichInvoiceDocument(
  { ocr_text: SPRINT3_TARIFF_ONLY_OCR, items: [] },
  null
);
assert(resolveInvoiceValue(sprint3TariffOnly) === 0, "do not derive invoice total from Poz./HS tariff references");

const SPRINT3_FOR_PAYMENT_OCR = `
Ordinary share capital: 428.917,00 EUR
Register number: 1/20406/00
Value 50.956,50
Tax 0,00
For payment EUR 50.956,50
`;
const sprint3ForPayment = enrichInvoiceDocument(
  { ocr_text: SPRINT3_FOR_PAYMENT_OCR, items: [] },
  null
);
assert(Math.abs(resolveInvoiceValue(sprint3ForPayment) - 50956.5) < 0.01, "prefer For payment EUR total over company capital");

console.log("\n1c. AZ Jordan — table reconstruction must not replace 6 parser rows with 2 pallet rows");

const AZ_JORDAN_ITEMS: NormalizedInvoice["items"] = [
  { position_number: 1, item_code: "14-002-606", description: "WRO316 DN23 PVC prozoren", quantity: "900,00", line_total: "4.694,40" },
  { position_number: 2, item_code: "14-002-106", description: "WRO316L DN23 Rebrasta cev Cats", quantity: "1.200,00", line_total: "5.148,00" },
  { position_number: 3, item_code: "14-040-554", description: "GV G1 double nipple", quantity: "100,00", line_total: "369,80" },
  { position_number: 4, item_code: "14-002-104", description: "WRO316L DN18 Rebrasta cev Cats", quantity: "300,00", line_total: "1.029,30" },
  { position_number: 5, item_code: "14-040-104", description: "G3/4 DN18 Cats brass nut", quantity: "500,00", line_total: "347,50" },
  { position_number: 6, item_code: "14-002-103", description: "WRO316L DN15 Rebrasta cev Cats", quantity: "180,00", line_total: "608,94" },
];
const AZ_JORDAN_PACKING_OCR = `
Item Qty Value
1 pallet 1200 800
2 pallets 1200 1000
`;
const azJordanInvoice: NormalizedInvoice = {
  invoice_number: "26-360-000016",
  ocr_text: AZ_JORDAN_PACKING_OCR,
  items: AZ_JORDAN_ITEMS,
};
assert(!shouldRecoverLineItemsFromTable(azJordanInvoice, AZ_JORDAN_PACKING_OCR), "do not run lower-count table reconstruction over parser rows");
const azJordanEnriched = enrichEnglishInvoiceFieldsFromOcr(azJordanInvoice);
assert((azJordanEnriched.items?.length ?? 0) === 6, "6 parser rows preserved");

console.log("\n1e. Golden 305/E — shipment summary OCR labels");

const GOLDEN_305E_SHIPMENT_OCR = `
Exterior Packaging
CARTONS
Freight by
Transport date 02/02/2026
Gross Weight Km 525,00
Net Weight kg 435,00
Carton Nr. 244
`;
const golden305Package = extractPackageCount(GOLDEN_305E_SHIPMENT_OCR);
const golden305Gross = extractGrossWeight(GOLDEN_305E_SHIPMENT_OCR);
const golden305Net = extractNetWeightFromDocument(GOLDEN_305E_SHIPMENT_OCR);
assert(golden305Package.package_count === 244, "305/E package count recovered from Carton Nr. 244");
assert(golden305Package.package_type === "CT", "305/E package type CT");
assert(golden305Gross.gross_weight_total === 525, "305/E gross weight recovered from Gross Weight Km 525,00");
assert(golden305Gross.gross_weight_unit === "kg", "305/E gross unit normalized to kg");
assert(golden305Net.net_weight_total === 435, "305/E net weight recovered from Net Weight kg 435,00");
assert(extractPackageCount("Net Weight kg 435,00\nCarton").package_count == null, "reject cross-line 00/Carton package false positive");

console.log("\n1f. Golden 305/E — invoice-level discount reconciliation");

const GOLDEN_305E_DISCOUNT_OCR = `
Gross Amount € 9.493,20
Discount 3,0
Value of discount 284,80
Total amount € 9.208,40
`;
const golden305DiscountInvoice: NormalizedInvoice = {
  invoice_number: "305/E",
  total_value: "9.208,40",
  total_value_numeric: 9208.4,
  ocr_text: GOLDEN_305E_DISCOUNT_OCR,
  items: [
    { position_number: 1, description: "Recovered commercial rows", quantity: 1, line_total: "9.493,20" },
  ],
};
const golden305DiscountContext = extractInvoiceDiscountContext(GOLDEN_305E_DISCOUNT_OCR);
const golden305Reconciliation = reconcileInvoiceFinancials(golden305DiscountInvoice);
const golden305DiscountReport = mapAuditReportToExportReport(
  { ...golden305DiscountInvoice, financial_reconciliation: golden305Reconciliation },
  baseAudit(),
  "golden-305e.pdf"
);
assert(golden305DiscountContext.preDiscountAmount === 9493.2, "305/E gross amount extracted");
assert(golden305DiscountContext.discountAmount === 284.8, "305/E discount amount extracted from Value of discount");
assert(golden305DiscountContext.netTotalFromArithmetic === 9208.4, "305/E discount arithmetic equals invoice total");
assert(golden305Reconciliation.validation_status === "PASS", "305/E discount reconciliation PASS");
assert(golden305Reconciliation.invoice_total === 9208.4, "305/E invoice total remains 9208.40");
assert(golden305Reconciliation.warning == null, "305/E no financial reconciliation warning");
assert(
  !golden305DiscountReport.issues.some((issue) => issue.field === "TOTAL_MISMATCH"),
  "305/E report has no TOTAL_MISMATCH after discount reconciliation"
);

console.log("\n1g. Golden 305/E — Adressee consignee label recovery");

const GOLDEN_305E_CONSIGNEE_OCR = `
Adressee
DRILONI SPORTSWEAR SH.P.K.
RRUGA NAIM FRASHERI, 41
70000 FERIZAJ (REPUBLIC OF KOSOVO)
REPUBLIC OF KOSOVO (RKS)
`;
const golden305Consignee = extractEnglishConsignee(GOLDEN_305E_CONSIGNEE_OCR);
const golden305ConsigneeEnriched = enrichInvoiceDocument(
  {
    invoice_number: "305/E",
    consignee: "",
    ocr_text: GOLDEN_305E_CONSIGNEE_OCR,
    items: [],
  },
  null
);
assert(golden305Consignee?.includes("DRILONI SPORTSWEAR SH.P.K.") === true, "305/E Adressee label recovers consignee name");
assert(golden305Consignee?.includes("REPUBLIC OF KOSOVO") === true, "305/E Adressee label preserves consignee country lines");
assert(golden305ConsigneeEnriched.consignee?.includes("DRILONI SPORTSWEAR SH.P.K.") === true, "305/E enrichment fills consignee from Adressee");

console.log("\n1b. AS2026-1069 — production parser failure fixture (QR consignee, total 22)");

const AS2026_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "as2026-1069-ocr.json"), "utf8")
) as NormalizedInvoice;

assert(isRejectedConsigneeText(AS2026_FIXTURE.consignee), "QR consignee rejected by filter");
const as2026Prod = enrichInvoiceDocument(
  {
    ...AS2026_FIXTURE,
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
  null
);
assert(as2026Prod.consignee?.includes("Braca Maric") === true, "production fixture consignee recovered");
assert(!isRejectedConsigneeText(as2026Prod.consignee), "production fixture no QR in consignee");
assert(Math.abs(resolveInvoiceValue(as2026Prod) - 21790.3) < 0.01, "production fixture total 21790.30");
assert((as2026Prod.items?.length ?? 0) === 3, "production fixture 3 line items");
assert(as2026Prod.country_code === "RS", "production fixture destination RS");

console.log("\n2. HENN — authorised exporter + declaration → DECLARED");

const HENN_CORPUS = `The exporter of the products covered by this document (customs authorization No. AT/920/038) declares that, except where otherwise clearly indicated, these products are of preferential origin.`;
assert(extractAuthorisedExporterNumber(HENN_CORPUS) === "AT/920/038", "detect AT/920/038");

const hennInvoice: NormalizedInvoice = enrichInvoiceDocument(
  {
    invoice_number: "HENN-001",
    exporter: "HENN GmbH",
    consignee: "Buyer RS",
    country: "Serbia",
    country_code: "RS",
    incoterms: "DAP",
    currency: "EUR",
    total_value_numeric: 12000,
    origin_declaration_text: HENN_CORPUS,
    authorised_exporter_number: "AT/920/038",
    items: [
      { position_number: 1, description: "Part A", quantity: 1, line_total: 6000, country_of_origin: "AT", hs_code: "84818073" },
      { position_number: 2, description: "Part B", quantity: 1, line_total: 6000, country_of_origin: "AT", hs_code: "84819000" },
    ],
    shipment_summary: {
      package_count: 1,
      gross_weight_total: 100,
      gross_weight_unit: "kg",
      net_weight_total: 90,
      net_weight_unit: "kg",
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  null
);

const hennDecision = evaluatePreferentialOriginDecision({
  preferenceScheme: { scheme: "PEM", schemeLabel: "PEM", applicableProofDocuments: [], workflowActive: true },
  originDeclarationDetected: true,
  authorisedExporterDetected: true,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  invoiceValueEur: 12000,
});
assert(hennDecision.evidenceStatus === "DECLARED", "HENN evidence DECLARED");

const hennEngine = runPreferentialOriginEngine(hennInvoice);
assert(
  hennEngine.lines.every((line) => line.preferential_origin === "YES"),
  "HENN lines preferential YES with auth declaration"
);

const hennReport = mapAuditReportToExportReport(
  hennInvoice,
  baseAudit([
    { severity: "WARNING", code: "EUR1_RECOMMENDED", message: "Recommend EUR.1" },
    { severity: "WARNING", code: "NO_AUTHORISED_EXPORTER", message: "No authorised exporter" },
  ]),
  "henn.pdf"
);
assert(hennReport.preferenceOrigin.evidenceStatus === "DECLARED", "mapped report DECLARED");
const hennIssues = filterSupersededPreferentialAuditIssues(hennReport.issues, hennReport.preferenceOrigin);
assert(
  !hennIssues.some((issue) => /EUR1_RECOMMENDED|NO_AUTHORISED_EXPORTER/.test(resolveIssueCode(issue) ?? "")),
  "superseded EUR1/NO_AUTHORISED issues removed"
);

console.log("\n3. Häfele — position-specific declaration only");

assert(
  parsePositionNumbers("5, 6, 8, 11, 12 and 16").join(",") === "5,6,8,11,12,16",
  "parse Häfele position list"
);

const hafelePositions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const hafeleInvoice: NormalizedInvoice = {
  invoice_number: "HF-001",
  exporter: "Häfele",
  consignee: "Buyer BA",
  country: "Bosnia and Herzegovina",
  country_code: "BA",
  currency: "EUR",
  total_value_numeric: 5000,
  vat_article: "Positions 5, 6, 8, 11, 12 and 16 are of preferential origin.",
  items: hafelePositions.map((pos) => ({
    position_number: pos,
    description: `Item ${pos}`,
    quantity: 1,
    line_total: 100,
    country_of_origin: pos <= 8 ? "DE" : "CN",
  })),
};

const hafeleEngine = runPreferentialOriginEngine(hafeleInvoice);
const preferentialPositions = [5, 6, 8, 11, 12, 16];
for (const pos of preferentialPositions) {
  assert(
    hafeleEngine.lines.find((l) => l.position_number === pos)?.preferential_origin === "YES",
    `Häfele pos ${pos} YES`
  );
}
for (const pos of hafelePositions.filter((p) => !preferentialPositions.includes(p))) {
  const status = hafeleEngine.lines.find((l) => l.position_number === pos)?.preferential_origin;
  assert(status === "UNKNOWN" || status === "NOT_DECLARED", `Häfele pos ${pos} UNKNOWN or NOT_DECLARED`);
}

console.log("\n4. Klintek — document gross 1574 kg authoritative, unit-weight misuse");

const klintekItems = [
  { position_number: 1, description: "A", quantity: 40, line_total: 100, net_weight: 200, country_of_origin: "DE" },
  { position_number: 2, description: "B", quantity: 30, line_total: 100, net_weight: 300, country_of_origin: "DE" },
];

const klintekInvoice: NormalizedInvoice = enrichInvoiceShipmentData({
  ocr_text: "Gross Weight: 1574 kg",
  items: klintekItems,
  shipment_summary: {
    package_count: 10,
    gross_weight_total: 1574,
    gross_weight_unit: "kg",
    gross_weight_source: "DOCUMENT",
    gross_weight_type: "SHIPMENT",
    net_weight_total: 11060,
    net_weight_unit: "kg",
    net_weight_source: "CALCULATED",
    package_type: "PALLET",
    pallet_dimensions: null,
    pallet_count: 5,
  },
});

const lineAggregation = aggregateLineNetWeightsForShipment(klintekItems, 1574);
assert(lineAggregation.unitWeightMisuseLikely === true, "unit-weight misuse detected (11060 vs 1574 gross)");
assert(klintekInvoice.shipment_summary?.gross_weight_total === 1574, "gross remains 1574");
assert(klintekInvoice.shipment_summary?.net_weight_total == null, "shipment net UNKNOWN when only document gross");
assert(klintekInvoice.shipment_summary?.gross_weight_type === "SHIPMENT", "gross weight type SHIPMENT");

const hierarchy = resolveWeightHierarchy({
  existing: klintekInvoice.shipment_summary,
  documentNet: { net_weight_total: null, net_weight_unit: null },
  documentGross: { gross_weight_total: 1574, gross_weight_unit: "kg" },
  calculatedNet: extractLineItemNetWeightTotal(klintekItems, 1574),
  unitWeightMisuseLikely: lineAggregation.unitWeightMisuseLikely,
});
assert(hierarchy.grossWeightTotal === 1574, "hierarchy gross 1574");
assert(hierarchy.netWeightTotal == null, "hierarchy net UNKNOWN with document gross only");
assert(hierarchy.unitWeightMisuseDetected === true, "hierarchy flags unit-weight misuse");

const weightFindings = evaluateWeightValidation({
  netWeightTotal: klintekInvoice.shipment_summary?.net_weight_total,
  grossWeightTotal: 1574,
  calculatedLineNet: lineAggregation.unitAdjustedSum ?? lineAggregation.rawLineSum,
  unitWeightMisuseDetected: lineAggregation.unitWeightMisuseLikely,
});
assert(
  weightFindings.some((f) => f.message.includes("unit-level weights")),
  "unit-weight misuse warning emitted"
);

console.log("\n5. Extraction completeness — missing COO should not collapse score");

const completeNoCoo: NormalizedInvoice = {
  invoice_number: "CMP-001",
  exporter: "Exporter GmbH",
  consignee: "Buyer RS",
  country: "Serbia",
  country_code: "RS",
  total_value_numeric: 3200,
  items: [
    { position_number: 1, description: "Part", quantity: 2, line_total: 1600, hs_code: "84818073" },
    { position_number: 2, description: "Part B", quantity: 1, line_total: 1600, hs_code: "84819000" },
  ],
  shipment_summary: {
    package_count: 1,
    gross_weight_total: 120,
    gross_weight_unit: "kg",
    net_weight_total: null,
    net_weight_unit: null,
    package_type: "COLLI",
    pallet_dimensions: null,
    pallet_count: null,
  },
};
const noCooObs = buildOcrObservability(completeNoCoo, 1);
assert((noCooObs.dataExtractionCompleteness ?? 0) >= 80, "major fields without COO stay >= 80%");

console.log("\n6. Customs readiness — no CUSTOMS_READY with impossible weights");

const klintekReport = mapAuditReportToExportReport(
  klintekInvoice,
  baseAudit(),
  "klintek.pdf"
);
const klintekReadiness = evaluateCustomsReadiness(klintekReport, klintekInvoice);
assert(klintekReadiness.status !== "CUSTOMS_READY", "Klintek unit-weight misuse prevents CUSTOMS_READY");

console.log("\n7. HS Wizard — wizard HS fills gap when invoice HS missing");

const wizardInvoice: NormalizedInvoice = enrichInvoiceDocument(
  {
    invoice_number: "WIZ-001",
    exporter: "EU Maker d.o.o.",
    consignee: "Buyer RS",
    country: "Serbia",
    country_code: "RS",
    incoterms: "DAP",
    currency: "EUR",
    total_value_numeric: 2500,
    items: [
      {
        position_number: 1,
        description: "Aluminium article",
        quantity: 1,
        line_total: 2500,
        wizard_hs_code: "76169990",
        wizard_confidence: 89,
        country_of_origin: "DE",
      },
    ],
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
  null
);
const wizardReport = mapAuditReportToExportReport(wizardInvoice, baseAudit(), "wizard.pdf");
assert(wizardReport.hsWorkflowSummary?.documentHsStatus === "VALID", "wizard HS → VALID status");
assert(
  evaluateCustomsReadiness(wizardReport, wizardInvoice).status !== "CUSTOMS_BLOCKED",
  "wizard HS does not block customs"
);
assert(
  !wizardReport.customsReadiness?.reasons.includes("Missing HS codes"),
  "wizard HS satisfies HS readiness"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
