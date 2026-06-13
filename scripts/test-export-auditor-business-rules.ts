/**
 * Export Auditor generalized business rules — package count, status cap, consistency.
 * Run: npm run test:export-auditor-business-rules
 */

import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import {
  enrichInvoiceShipmentData,
  extractFooterShipmentMetrics,
  extractShipmentSummary,
} from "../src/lib/export-auditor/shipment-summary-extractor";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { evaluateShipmentReadiness, MISSING_PACKAGE_COUNT } from "../src/lib/export-auditor/shipment-readiness";
import { isAllNotDeclaredLines } from "../src/lib/export-auditor/mixed-origin-status-engine";
import { runHsAggregationEngine, NON_PREFERENTIAL_EXPORT_LABEL } from "../src/lib/export-auditor/hs-aggregation-engine";
import { computePreferentialAllocation } from "../src/lib/export-auditor/preferential-allocation-engine";
import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { getReadinessVerdict, applyHsClassificationStatusCap } from "../src/lib/export-auditor/readiness-score";
import {
  evaluatePackageCountDecision,
  MANUAL_REVIEW_REQUIRED,
} from "../src/lib/export-auditor/package-count-decision-engine";
import {
  assertShipmentDataConsistent,
} from "../src/lib/export-auditor/shipment-data-consistency";
import {
  deriveDispositionOriginSummary,
} from "../src/lib/export-auditor/customs-disposition-summary";
import { applyEnterpriseCommercialSummary } from "../src/lib/export-auditor/enterprise-commercial-summary";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import type { ExportAuditReport } from "../src/lib/export-auditor/types";
import {
  detectSupportingDocuments,
  filterSupportingDocumentIssues,
  isSupportingDocumentReferenceIssue,
} from "../src/lib/export-auditor/supporting-documents-detect";
import { DELIVERY_NOTE_DETECTED, EUR1_REFERENCED } from "../src/lib/export-auditor/issue-readiness";

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

function buildAudit(overrides: Partial<AuditReportResponse> = {}): AuditReportResponse {
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
    ...overrides,
  };
}

console.log("Package count decision engine");
const onlyPallets = evaluatePackageCountDecision({ colliCount: null, palletCount: 2 });
assert(onlyPallets.declarationPackageCount === 2, "only pallets → count 2");
assert(onlyPallets.declarationPackageType === "PAL", "only pallets → type PAL");

const onlyColli = evaluatePackageCountDecision({ colliCount: 5, palletCount: null });
assert(onlyColli.declarationPackageCount === 5, "only colli → count 5");
assert(onlyColli.declarationPackageType === "COLLI", "only colli → type COLLI");

const both = evaluatePackageCountDecision({ colliCount: 3, palletCount: 1 });
assert(both.declarationPackageCount === 1, "both → declaration count uses pallets (1)");
assert(both.declarationPackageType === "PAL", "both → declaration type PAL");
assert(both.colliCount === 3 && both.palletCount === 1, "both → colli and pallets stored separately");
assert(both.requiresManualReview === true, "both → requires manual verification note");
assert(both.packageVerificationNote != null, "both → verification note present");

console.log("\nPallet count extraction — Nx pallet patterns");
const palletCorpus = "1x pallet: 2300x800x800mm\nGross weight: 450 kg\nNet weight: 400 kg";
const palletFooter = extractFooterShipmentMetrics(palletCorpus);
assert(palletFooter.pallet_count === 1, "1x pallet: → pallet_count=1");
assert(palletFooter.package_count == null, "1x pallet: does not set colli count");

const twoPallets = extractFooterShipmentMetrics("Shipment: 2x pallet\nBruto/Gross: 120 kg");
assert(twoPallets.pallet_count === 2, "2x pallet → pallet_count=2");

const spacedPallet = extractFooterShipmentMetrics("1 x pallet dimensions 120x80x80");
assert(spacedPallet.pallet_count === 1, "1 x pallet → pallet_count=1");

const paletaCorpus = extractFooterShipmentMetrics("1x paleta: 120x80 cm\n1 paleta: backup");
assert(paletaCorpus.pallet_count === 1, "1x paleta / 1 paleta: → pallet_count=1");

const mixedColliPallet = extractShipmentSummary("Colli: 3\n1x pallet: 120x80x80\nGross: 100 kg");
assert(mixedColliPallet.pallet_count === 1, "mixed colli+pallet → pallet_count=1");
assert(mixedColliPallet.package_count === 3, "mixed colli+pallet → package_count=3");

const palletOnlySummary = extractShipmentSummary("1x pallet: 2300x800x800mm\nGross weight: 450 kg");
assert(palletOnlySummary.pallet_count === 1, "pallet-only summary → pallet_count=1");
assert(palletOnlySummary.package_count == null, "pallet-only summary → no colli count");

const palletInvoice = enrichInvoiceShipmentData({
  invoice_number: "PAL-1",
  ocr_text: "1x pallet: 2300x800x800mm\nGross weight: 450 kg\nNet weight: 400 kg",
});
assert(palletInvoice.shipment_summary?.pallet_count === 1, "enriched invoice pallet_count=1");
assert(
  !evaluateShipmentReadiness(palletInvoice).some((w) => w.code === MISSING_PACKAGE_COUNT),
  "pallet_count>0 clears MISSING_PACKAGE_COUNT"
);

console.log("\nNon-preferential export aggregation — all NOT_DECLARED");
const siCnInvoice: NormalizedInvoice = {
  invoice_number: "SI-CN-1",
  currency: "EUR",
  total_value: "2500.00",
  country_code: "RS",
  items: [
    ...Array.from({ length: 10 }, (_, i) => ({
      position_number: i + 1,
      description: `SI part ${i + 1}`,
      quantity: 1,
      line_total: "100.00",
      hs_code: "84713000",
      country_of_origin: "SI",
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      position_number: 11 + i,
      description: `CN part ${i + 1}`,
      quantity: 1,
      line_total: "300.00",
      hs_code: "84713000",
      country_of_origin: "CN",
    })),
  ],
  shipment_summary: {
    package_count: null,
    package_type: null,
    gross_weight_total: 120,
    gross_weight_unit: "kg",
    net_weight_total: 100,
    net_weight_unit: "kg",
    pallet_dimensions: null,
    pallet_count: null,
  },
};
const prefLines = runPreferentialOriginEngine(siCnInvoice).lines;
assert(isAllNotDeclaredLines(prefLines), "SI+CN invoice → all NOT_DECLARED");
const hsEngine = runHsAggregationEngine(siCnInvoice);
assert(hsEngine.non_preferential_export_summary != null, "non-preferential export bucket created");
const nonPref = hsEngine.non_preferential_export_summary!;
assert(
  nonPref.display_label === NON_PREFERENTIAL_EXPORT_LABEL,
  "bucket label Non-Preferential Export Goods"
);
assert(nonPref.source_positions.length === 15, "15 source positions");
assert(hsEngine.unknown_preference_summary.length === 0, "NOT_DECLARED not in unknown bucket");
assert(
  hsEngine.origin_countries_detected?.includes("SI (10 lines)") ?? false,
  "origin countries detected SI"
);
assert(
  hsEngine.origin_countries_detected?.includes("CN (5 lines)") ?? false,
  "origin countries detected CN"
);

const siCnReport = mapAuditReportToExportReport(siCnInvoice, buildAudit(), "si-cn.pdf");
assert(
  siCnReport.preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT",
  "document status NON_PREFERENTIAL_EXPORT"
);
assert(siCnReport.hsAggregationReport.nonPreferentialExportSummary != null, "report export bucket");
assert(
  siCnReport.preferenceOrigin.preferentialAllocation?.nonPreferentialQuantity === 15,
  "allocation quantity totals all lines"
);

console.log("\nDeclaration package priority PAL > COLLI (colli on pallet)");
const priorityDecision = evaluatePackageCountDecision({ colliCount: 3, palletCount: 1 });
assert(priorityDecision.declarationPackageCount === 1, "PAL priority count=1");
assert(priorityDecision.declarationPackageType === "PAL", "PAL priority type=PAL");

console.log("\nCarton declaration — 35 CARTONS (1 PALLETE)");
const cartonsDecision = evaluatePackageCountDecision({
  colliCount: 35,
  palletCount: 1,
  packageType: "CT",
});
assert(cartonsDecision.declarationPackageCount === 35, "CT priority count=35");
assert(cartonsDecision.declarationPackageType === "CT", "CT priority type=CT");
assert(cartonsDecision.palletCount === 1, "CT+pallet preserves pallet count");

console.log("\nExecutive status rule — goods lines without HS cannot be READY");
const hsPendingReport: ExportAuditReport = {
  documentId: "HS-PENDING",
  fileName: "hs-pending.pdf",
  processedAt: new Date().toISOString(),
  auditStatus: "READY",
  readinessScore: 95,
  missingFields: [],
  invoiceSummary: {
    invoiceNumber: "HS-PENDING",
    invoiceDate: "2026-01-01",
    exporter: "Exporter",
    consignee: "Buyer",
    destinationCountry: "Iceland (IS)",
    destinationCountryCode: "IS",
    incoterms: "EXW",
    currency: "EUR",
    invoiceValue: 1000,
    lineItemCount: 10,
    uniqueHsCodeCount: 0,
    countriesOfOrigin: [],
  },
  shipmentSummary: {
    packageCount: 1,
    packageType: "COLLI",
    grossWeightTotal: 50,
    grossWeightUnit: "kg",
    netWeightTotal: 40,
    netWeightUnit: "kg",
    palletCount: null,
    declarationPackageCount: 1,
    declarationPackageType: "COLLI",
    requiresManualPackageReview: false,
    packageVerificationNote: null,
  },
  deliveryAddress: {
    company: null,
    address: null,
    city: null,
    postalCode: null,
    country: null,
    countryCode: null,
  },
  hsAggregationReport: {
    hsAggregation: [],
    preferentialSummary: [],
    nonPreferentialSummary: [],
    unknownPreferenceSummary: [],
    nonPreferentialExportSummary: null,
    originCountriesDetected: null,
    mrnSummary: {
      totalGoodsLines: 10,
      uniqueHsCodes: 0,
      totalInvoiceValue: 1000,
      totalNetWeight: 40,
      totalGrossWeight: 50,
      countriesOfOrigin: [],
      excludedServiceLines: 0,
    },
    traceabilityLines: [],
  },
  confidence: { ocrQuality: 90, dataCompleteness: 90, overallConfidence: 90 },
  preferenceOrigin: {
    destinationOutsideEu: true,
    preferenceScheme: "PEM",
    schemeLabel: "PEM",
    applicableProofDocuments: [],
    preferenceWorkflowActive: true,
    preferentialOriginStatus: "CONFIRMED",
    invoiceDeclarationSufficient: true,
    evidenceStatus: "DECLARED",
    eur1Recommended: false,
    originDeclarationFound: true,
    authorisedExporterDetected: true,
    statementOnOriginDetected: false,
    rexRegistrationDetected: false,
    rexRegistrationNumber: null,
    authorisedExporterNumber: "SI/105/00",
    status: "Confirmed",
    recommendation: "Declared",
    requiredDocuments: [],
    lineItems: [],
    declarationsDetected: [],
    preferentialOriginSummary: "",
    mixedOrigin: false,
    mixedOriginTotals: null,
    preferentialAllocation: null,
  },
  issues: [],
  supportingDocumentsDetected: [],
  recommendedActions: [],
  customsDisposition: "",
  hsCodesDetected: [],
  exportSummary: "",
  filingRecommendations: [],
  mrnExportReady: false,
};

const capped = applyHsClassificationStatusCap(hsPendingReport, {
  exportStatus: "Ready",
  statusLabel: "Ready For Export Filing",
  isReady: true,
});
assert(capped.exportStatus === "Ready With Review", "score 95 + no HS → Ready With Review not Ready");
const verdict = getReadinessVerdict(hsPendingReport);
assert(verdict.exportStatus !== "Ready", "getReadinessVerdict never returns Ready without HS codes");

console.log("\nEnterprise commercial summary — parsed lines never show zero goods/value");
const zeroDisplayInvoice: NormalizedInvoice = {
  invoice_number: "ENT-1",
  currency: "EUR",
  total_value: "500.00",
  items: Array.from({ length: 5 }, (_, index) => ({
    position_number: index + 1,
    description: `Line ${index + 1}`,
    quantity: 1,
    line_total: "100.00",
  })),
};
const zeroReport = mapAuditReportToExportReport(zeroDisplayInvoice, buildAudit(), "ent.pdf");
const guarded = applyEnterpriseCommercialSummary(zeroReport, zeroDisplayInvoice);
assert(guarded.invoiceSummary.lineItemCount === 5, "enterprise goods lines = 5 when parsed");
assert(guarded.invoiceSummary.invoiceValue > 0, "enterprise invoice value > 0 when parsed");
assert(guarded.hsAggregationReport.mrnSummary.totalGoodsLines === 5, "MRN goods lines = 5");

console.log("\nCustoms disposition origin — evidence shows status not N/A");
const mixedInvoice: NormalizedInvoice = {
  invoice_number: "MIX-1",
  exporter: "EU Supplier",
  consignee: "Buyer",
  country: "Serbia",
  country_code: "RS",
  currency: "EUR",
  total_value: "1000.00",
  origin_declaration_text: "Position 1 is of preferential origin.",
  items: [
    { position_number: 1, description: "EU part", quantity: 1, line_total: "500.00", country_of_origin: "DE" },
    { position_number: 2, description: "CN part", quantity: 1, line_total: "500.00", country_of_origin: "CN" },
  ],
};
const mixedReport = mapAuditReportToExportReport(mixedInvoice, buildAudit(), "mix.pdf");
const mixedSummary = deriveDispositionOriginSummary(mixedReport.preferenceOrigin, mixedInvoice);
assert(
  mixedSummary.originStatusLine === "Origin Status: Mixed Origin Goods",
  "mixed origin disposition status"
);
assert(
  !mixedReport.customsDisposition.includes("Country of Origin: N/A"),
  "disposition never shows Country of Origin: N/A when evidence exists"
);

async function main() {
  console.log("\nInvoice 2602002968 regression");
  const FIXTURE_PATH = path.join(__dirname, "fixtures", "2602002968-ocr.json");
  const PDF_TEXT_FIXTURE = path.join(__dirname, "fixtures", "2602002968-pdf-text.txt");
  const PDF_PATH =
    process.env.GOLDEN_PDF_2602002968 ||
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\2602002968.pdf";

  const rawInvoice = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
  let pdfText = "";
  if (fs.existsSync(PDF_TEXT_FIXTURE)) {
    pdfText = fs.readFileSync(PDF_TEXT_FIXTURE, "utf8");
  } else if (fs.existsSync(PDF_PATH)) {
    pdfText = await extractPdfText(fs.readFileSync(PDF_PATH));
  } else {
    pdfText = [rawInvoice.footer_text, rawInvoice.vat_article].filter(Boolean).join("\n");
  }

  const invoice = enrichInvoiceDocument(rawInvoice, pdfText);
  const report = mapAuditReportToExportReport(
    invoice,
    buildAudit({
      readiness: { score: 67, status: "WARNING", warnings: ["No HS codes detected"], errors: [] },
      issues: [
        { severity: "INFO", code: "HS_CODE_NOT_ON_INVOICE", message: "No HS codes on invoice." },
      ],
      recommended_actions: ["Assign HS codes manually"],
    }),
    "2602002968.pdf"
  );

  assert(report.shipmentSummary.declarationPackageCount === 1, "declaration package count = 1 pallet");
  assert(report.shipmentSummary.declarationPackageType === "PAL", "declaration package type PAL");
  assert(report.shipmentSummary.requiresManualPackageReview === true, "manual package verification required");
  assert(report.shipmentSummary.packageCount === 3, "colli count preserved");
  assert(report.shipmentSummary.palletCount === 1, "pallet count preserved");
  assert(report.invoiceSummary.lineItemCount === 38, `goods lines = 38 (got ${report.invoiceSummary.lineItemCount})`);
  assert(report.preferenceOrigin.mixedOrigin === true, "mixed origin detected");
  assert(
    report.preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN",
    "document status MIXED_ORIGIN"
  );
  assert(report.preferenceOrigin.mixedOriginTotals != null, "mixed origin totals generated");
  assert(report.auditStatus === "WARNING", "audit status WARNING (unified with Ready With Review)");
  assert(
    getReadinessVerdict(report).exportStatus === "Ready With Review",
    "status Ready With Review until HS classification"
  );

  const consistency = assertShipmentDataConsistent(report, {
    expectedInvoiceValue: 1610.7,
    expectedGrossWeight: 78,
    expectedNetWeight: 62,
    expectedPackageCount: 1,
    expectedInvoiceNumber: "2602002968",
    expectedGoodsLines: 38,
  });
  assert(consistency.ok, "all sections consistent");
  if (!consistency.ok) {
    for (const mismatch of consistency.mismatches) {
      console.error(`    ${mismatch}`);
    }
  }

  const a0054Pdf =
    process.env.GOLDEN_PDF_A0054 ||
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\A0054-2026(1).pdf";
  const a0054Fixture = path.join(__dirname, "fixtures", "a0054-2026-ocr.json");
  if (fs.existsSync(a0054Pdf) || fs.existsSync(a0054Fixture)) {
    console.log("\nA0054/2026 regression");
    let a0054Invoice: NormalizedInvoice;
    let a0054PdfText = "";
    if (fs.existsSync(a0054Fixture)) {
      a0054Invoice = JSON.parse(fs.readFileSync(a0054Fixture, "utf8")) as NormalizedInvoice;
      a0054PdfText = [a0054Invoice.footer_text, a0054Invoice.ocr_text].filter(Boolean).join("\n");
    } else {
      const { extractPdfText: extractPdf } = await import("../src/lib/export-auditor/pdf-text-extract");
      a0054PdfText = await extractPdf(fs.readFileSync(a0054Pdf));
      a0054Invoice = {
        invoice_number: "A0054/2026",
        exporter: "TRANSPAK d.o.o.",
        consignee: "KNJAZ MILOŠ A.D.",
        country: "Serbia",
        country_code: "RS",
        incoterms: "DDP Aranđelovac",
        currency: "EUR",
        total_value: "1227.03",
        ocr_text: a0054PdfText,
        items: [],
      };
    }
    const a0054Enriched = enrichInvoiceDocument(a0054Invoice, a0054PdfText);
    const a0054Report = mapAuditReportToExportReport(
      a0054Enriched,
      buildAudit({
        readiness: {
          score: 70,
          status: "WARNING",
          warnings: ["Missing package count"],
          errors: [],
        },
        issues: [
          { severity: "WARNING", code: "MISSING_PACKAGE_COUNT", message: "Package count is missing." },
        ],
      }),
      "A0054-2026(1).pdf"
    );
    assert(
      a0054Report.shipmentSummary.declarationPackageCount === 1,
      `A0054 declaration package count=1 (got ${a0054Report.shipmentSummary.declarationPackageCount})`
    );
    assert(a0054Report.shipmentSummary.declarationPackageType === "PAL", "A0054 declaration type PAL");
    assert(
      !a0054Report.issues.some((i) => i.field === MISSING_PACKAGE_COUNT),
      "A0054 no MISSING_PACKAGE_COUNT when pallet detected"
    );
    assert(
      a0054Report.preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT",
      "A0054 origin status NON_PREFERENTIAL_EXPORT"
    );
    assert(
      a0054Report.hsAggregationReport.nonPreferentialExportSummary != null ||
        a0054Report.hsAggregationReport.nonPreferentialSummary.length > 0,
      "A0054 enterprise summary populated"
    );
  } else {
    console.log("\nA0054/2026 regression — skipped (PDF not found)");
  }

  console.log("\nSupporting documents detection");
  const docFlagsInvoice: NormalizedInvoice = {
    invoice_number: "DOC-FLAGS",
    document_flags: {
      delivery_note_referenced: true,
      packing_list_referenced: true,
      certificate_of_origin_referenced: false,
    },
  };
  const fromFlags = detectSupportingDocuments(docFlagsInvoice);
  assert(
    fromFlags.some((d) => d.kind === "delivery_note") &&
      fromFlags.some((d) => d.kind === "packing_list"),
    "document_flags detect delivery note and packing list"
  );
  assert(
    !fromFlags.some((d) => d.kind === "certificate_of_origin"),
    "false certificate_of_origin flag not detected"
  );

  const corpusInvoice: NormalizedInvoice = {
    invoice_number: "CORPUS",
    ocr_text: "EUR.1 enclosed for all positions. Long-term supplier declaration attached.",
  };
  const fromCorpus = detectSupportingDocuments(corpusInvoice);
  assert(fromCorpus.some((d) => d.kind === "eur1"), "corpus detects EUR.1");
  assert(
    fromCorpus.some((d) => d.kind === "long_term_supplier_declaration"),
    "corpus detects long-term supplier declaration"
  );

  const deliveryIssue = {
    id: "dn-1",
    type: "warning" as const,
    field: DELIVERY_NOTE_DETECTED,
    message: "Delivery note detected",
  };
  assert(isSupportingDocumentReferenceIssue(deliveryIssue), "delivery note issue recognized");
  const filtered = filterSupportingDocumentIssues([deliveryIssue, {
    id: "hs-1",
    type: "info" as const,
    field: "HS_CODE_NOT_ON_INVOICE",
    message: "HS codes not present on invoice.",
  }]);
  assert(filtered.length === 1, "supporting document issues filtered from issues list");
  assert(filtered[0].field === "HS_CODE_NOT_ON_INVOICE", "compliance info issue retained");

  const mappedWithDeliveryNote = mapAuditReportToExportReport(
    { invoice_number: "MAP-DN" },
    buildAudit({
      issues: [{ severity: "WARNING", code: DELIVERY_NOTE_DETECTED, message: "Delivery note detected" }],
    }),
    "map-dn.pdf"
  );
  assert(
    !mappedWithDeliveryNote.issues.some((i) => i.field === DELIVERY_NOTE_DETECTED),
    "mapped report removes delivery note from issues"
  );
  assert(
    mappedWithDeliveryNote.supportingDocumentsDetected.some((d) => d.kind === "delivery_note"),
    "mapped report adds delivery note to supportingDocumentsDetected"
  );

  const mappedWithEur1 = mapAuditReportToExportReport(
    { invoice_number: "MAP-EUR1", ocr_text: "EUR.1 attached" },
    buildAudit({
      issues: [{ severity: "INFO", code: EUR1_REFERENCED, message: "EUR.1 referenced on invoice" }],
    }),
    "map-eur1.pdf"
  );
  assert(
    mappedWithEur1.supportingDocumentsDetected.some((d) => d.kind === "eur1"),
    "EUR.1 detected from issue fallback and corpus"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
