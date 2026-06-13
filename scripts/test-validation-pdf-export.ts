/**
 * Validation PDF export smoke tests.
 * Run: npm run test:validation-pdf-export
 */

import type { ExportAuditReport } from "../src/lib/export-auditor/types";
import {
  buildValidationReportHtmlForTest,
  EXPORT_AUDITOR_VERSION,
} from "../src/lib/export-auditor/validation-pdf-export";

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

const minimalReport: ExportAuditReport = {
  documentId: "doc-1",
  fileName: "invoice-001.pdf",
  processedAt: "2026-06-10T12:00:00.000Z",
  auditStatus: "WARNING",
  readinessScore: 72,
  missingFields: ["net_weight_total"],
  invoiceSummary: {
    invoiceNumber: "INV-001",
    invoiceDate: "2026-05-01",
    exporter: "Exporter d.o.o.",
    consignee: "Buyer GmbH",
    destinationCountry: "Germany",
    destinationCountryCode: "DE",
    incoterms: "DAP Berlin",
    currency: "EUR",
    invoiceValue: 12500.5,
    lineItemCount: 3,
    uniqueHsCodeCount: 2,
    countriesOfOrigin: ["SI", "DE"],
  },
  shipmentSummary: {
    packageCount: 12,
    packageType: "COLLI",
    grossWeightTotal: 540,
    grossWeightUnit: "kg",
    netWeightTotal: 500,
    netWeightUnit: "kg",
    palletCount: 1,
    declarationPackageCount: 1,
    declarationPackageType: "PAL",
    requiresManualPackageReview: false,
    packageVerificationNote: null,
  },
  deliveryAddress: {
    company: "Buyer GmbH",
    address: "Hauptstr. 1",
    city: "Berlin",
    postalCode: "DE-10115",
    country: "Germany",
    countryCode: "DE",
  },
  hsAggregationReport: {
    hsAggregation: [
      {
        hsCode: "84713000",
        totalQuantity: 100,
        totalValue: 12500.5,
        totalNetWeight: 500,
        itemCount: 3,
        countriesOfOrigin: ["SI"],
        sourcePositions: [1, 2, 3],
      },
    ],
    preferentialSummary: [],
    nonPreferentialSummary: [],
    unknownPreferenceSummary: [],
    nonPreferentialExportSummary: null,
    originCountriesDetected: "SI",
    mrnSummary: {
      totalGoodsLines: 3,
      uniqueHsCodes: 1,
      totalInvoiceValue: 12500.5,
      totalNetWeight: 500,
      totalGrossWeight: 540,
      countriesOfOrigin: ["SI"],
      excludedServiceLines: 0,
    },
    traceabilityLines: [
      {
        positionNumber: 1,
        description: "Laptop",
        quantity: 100,
        value: 12500.5,
        netWeight: 500,
        countryOfOrigin: "SI",
        preferentialOrigin: "YES",
        hsCode: "84713000",
      },
    ],
  },
  confidence: { ocrQuality: 88, dataCompleteness: 75, overallConfidence: 80 },
  preferenceOrigin: {
    destinationOutsideEu: false,
    preferenceScheme: "NO_PREFERENCE",
    schemeLabel: "No preference scheme (intra-EU)",
    applicableProofDocuments: [],
    preferenceWorkflowActive: false,
    preferentialOriginStatus: "NOT_DECLARED",
    invoiceDeclarationSufficient: false,
    evidenceStatus: "NOT_DECLARED",
    eur1Recommended: false,
    originDeclarationFound: false,
    authorisedExporterDetected: false,
    statementOnOriginDetected: false,
    rexRegistrationDetected: false,
    rexRegistrationNumber: null,
    status: "Review required",
    recommendation: "Verify origin documentation.",
    requiredDocuments: [],
    lineItems: [
      {
        position_number: 1,
        country_of_origin: "SI",
        preferential_origin: "YES",
        preference_reason: "Declaration on invoice",
        preference_source: "invoice_declaration",
      },
    ],
    declarationsDetected: [],
    preferentialOriginSummary: "1 line preferential YES",
    authorisedExporterNumber: null,
    mixedOrigin: false,
    mixedOriginTotals: null,
    preferentialAllocation: null,
  },
  issues: [
    {
      id: "issue-1",
      type: "warning",
      field: "MISSING_NET_WEIGHT",
      message: "Net weight recommended for customs.",
    },
  ],
  supportingDocumentsDetected: [],
  recommendedActions: [],
  customsDisposition: "Export allowed with review.",
  hsCodesDetected: ["84713000"],
  exportSummary: "Standard export review completed.",
  filingRecommendations: [],
  mrnExportReady: true,
  ocrObservability: {
    ocrProvider: "Mistral",
    pageCount: 2,
    ocrTextLength: 4200,
    extractionSource: "mistral_ocr",
    itemsExtracted: 3,
    itemsWithHsCode: 3,
    itemsWithCountryOfOrigin: 3,
    itemsWithLineTotal: 3,
    ocrQualityScore: 91,
    estimatedOcrCostUsd: 0.004,
    costPerPageUsd: 0.002,
  },
};

console.log("validation-pdf-export");

const html = buildValidationReportHtmlForTest(minimalReport, new Date("2026-06-10T14:30:00"));

assert(html.includes("Export Auditor Validation Report"), "title present");
assert(html.includes(EXPORT_AUDITOR_VERSION), "version present");
assert(html.includes("INV-001"), "invoice number present");
assert(html.includes("Mistral"), "OCR provider present");
assert(html.includes("91%"), "OCR quality present");
assert(html.includes("$0.0040"), "OCR cost present");
assert(html.includes("Invoice Summary"), "invoice summary section");
assert(html.includes("Shipment Summary"), "shipment summary section");
assert(html.includes("Delivery Address"), "delivery section");
assert(html.includes("Origin Analysis"), "origin analysis section");
assert(html.includes("Preference Origin Analysis"), "preference section");
assert(html.includes("HS Aggregation"), "HS aggregation section");
assert(html.includes("Position Traceability"), "traceability section");
assert(html.includes("OCR Diagnostics"), "OCR diagnostics section");
assert(html.includes("Enterprise Summaries"), "enterprise section");
assert(html.includes("Issues Detected"), "issues section");
assert(html.includes("Golden Invoice Review Export"), "temporary banner");
assert(html.includes("window.print"), "auto-print script present");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
