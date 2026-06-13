/**
 * 2602002968_GOLDEN_TEST — UNIOR invoice to Iceland.
 * Run: npm run test:golden-2602002968
 */

import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { getReadinessVerdict } from "../src/lib/export-auditor/readiness-score";
import {
  HS_CODE_NOT_ON_INVOICE,
  HS_CODE_NOT_ON_INVOICE_MESSAGE,
} from "../src/lib/export-auditor/issue-readiness";
import { assertInvoiceValueConsistent } from "../src/lib/export-auditor/invoice-value-consistency";
import { assertShipmentDataConsistent } from "../src/lib/export-auditor/shipment-data-consistency";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const TEST_NAME = "2602002968_GOLDEN_TEST";
const PDF_PATH =
  process.env.GOLDEN_PDF_2602002968 ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\2602002968.pdf";
const FIXTURE_PATH = path.join(__dirname, "fixtures", "2602002968-ocr.json");

const EXPECTED_INVOICE_VALUE = 1610.7;
const EXPECTED_PREFERENTIAL_YES = 18;
const EXPECTED_PREFERENTIAL_NO = 20;

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

function loadOcrFixture(): NormalizedInvoice {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
}

function buildUpstreamAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: {
      score: 67,
      status: "WARNING",
      warnings: [
        "No HS codes detected",
        "No country of origin detected",
        "Missing gross weight",
        "Missing package count",
        "No origin declaration found",
      ],
      errors: [],
    },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: true,
      required_documents: ["EUR.1"],
    },
    issues: [
      { severity: "WARNING", code: "MISSING_HS_CODE", message: "No HS codes detected on invoice." },
      {
        severity: "WARNING",
        code: "MISSING_COUNTRY_OF_ORIGIN",
        message: "Country of origin is missing on invoice lines.",
      },
      { severity: "WARNING", code: "MISSING_GROSS_WEIGHT", message: "Gross shipment weight is missing." },
      { severity: "WARNING", code: "MISSING_PACKAGE_COUNT", message: "Package count is missing." },
      {
        severity: "WARNING",
        code: "NO_ORIGIN_DECLARATION",
        message: "No origin declaration found on invoice",
      },
      {
        severity: "WARNING",
        code: "MISSING_ORIGIN_DECLARATION",
        message: "Origin declaration missing",
      },
    ],
    recommended_actions: ["Verify preferential origin", "Assign HS codes manually"],
    summary:
      "Invoice requires review before export declaration, preferential origin has not been confirmed.",
  };
}

async function main() {
  console.log(`${TEST_NAME}\n`);

  const rawInvoice = loadOcrFixture();
  let pdfText = "";
  if (fs.existsSync(PDF_PATH)) {
    pdfText = await extractPdfText(fs.readFileSync(PDF_PATH));
    assert(pdfText.length > 50, `PDF text extracted (${pdfText.length} chars)`);
  } else {
    pdfText = [rawInvoice.footer_text, rawInvoice.vat_article].filter(Boolean).join("\n");
    console.log("  (PDF not found — using fixture footer text for enrichment)");
  }

  const invoice = enrichInvoiceDocument(rawInvoice, pdfText);
  const report = mapAuditReportToExportReport(
    invoice,
    buildUpstreamAudit(),
    "2602002968.pdf"
  );

  console.log("\nShipment footer parsing");
  const shipment = report.shipmentSummary;
  assert(shipment.grossWeightTotal === 78, `gross_weight = 78 kg (got ${shipment.grossWeightTotal})`);
  assert(shipment.netWeightTotal === 62, `net_weight = 62 kg (got ${shipment.netWeightTotal})`);
  assert(shipment.netWeightUnit === "kg", `net_weight unit = kg (got ${shipment.netWeightUnit})`);
  assert(shipment.packageCount === 3, `package_count = 3 colli (got ${shipment.packageCount})`);
  assert(shipment.palletCount === 1, `pallet_count = 1 (got ${shipment.palletCount})`);
  assert(
    shipment.declarationPackageCount === 1,
    `declaration package count = 1 pallet (got ${shipment.declarationPackageCount})`
  );
  assert(shipment.declarationPackageType === "PAL", "declaration package type = PAL");
  assert(shipment.requiresManualPackageReview === true, "manual package verification when colli and pallets");

  console.log("\nPreferential origin & authorised exporter");
  const pref = report.preferenceOrigin;
  assert(pref.originDeclarationFound === true, "origin_declaration_found = true");
  assert(pref.authorisedExporterDetected === true, "authorised_exporter_detected = true");
  assert(
    pref.authorisedExporterNumber === "SI/105/00",
    `authorised_exporter_number = SI/105/00 (got ${pref.authorisedExporterNumber})`
  );
  assert(pref.eur1Recommended === false, "eur1_recommended = false");
  assert(
    pref.preferentialOriginStatus === "MIXED_ORIGIN",
    `document status = MIXED_ORIGIN (got ${pref.preferentialOriginStatus})`
  );
  assert(
    pref.invoiceDeclarationSufficient === false,
    "invoice declaration not sufficient when mixed origin"
  );
  assert(pref.mixedOrigin === true, "mixed origin = YES");
  assert(pref.mixedOriginTotals != null, "mixed origin totals generated");
  const mixedOriginTotals = pref.mixedOriginTotals!;
  assert(
    mixedOriginTotals.preferentialQuantity === EXPECTED_PREFERENTIAL_YES,
    `preferential quantity = ${EXPECTED_PREFERENTIAL_YES} (got ${mixedOriginTotals.preferentialQuantity})`
  );
  assert(
    mixedOriginTotals.nonPreferentialQuantity === EXPECTED_PREFERENTIAL_NO,
    `non-preferential quantity = ${EXPECTED_PREFERENTIAL_NO} (got ${mixedOriginTotals.nonPreferentialQuantity})`
  );

  console.log("\nGoods lines & enterprise summary");
  assert(
    report.invoiceSummary.lineItemCount === 38,
    `goods lines = 38 (got ${report.invoiceSummary.lineItemCount})`
  );
  assert(
    report.hsAggregationReport.mrnSummary.totalGoodsLines === 38,
    `MRN total goods lines = 38 (got ${report.hsAggregationReport.mrnSummary.totalGoodsLines})`
  );
  assert(report.invoiceSummary.invoiceValue > 0, "invoice value shown when lines parsed");
  assert(
    !report.customsDisposition.includes("Country of Origin: N/A"),
    "customs disposition has no N/A origin when evidence exists"
  );

  console.log("\nFalse validation warnings removed");
  assert(
    !report.issues.some(
      (issue) =>
        issue.field === "NO_ORIGIN_DECLARATION" ||
        issue.field === "MISSING_ORIGIN_DECLARATION" ||
        /origin declaration/i.test(issue.message)
    ),
    "no missing origin declaration warnings"
  );
  assert(
    !report.issues.some(
      (issue) =>
        issue.field === "MISSING_COUNTRY_OF_ORIGIN" ||
        /country of origin.*missing/i.test(issue.message)
    ),
    "no missing country of origin warnings"
  );
  assert(
    !report.issues.some((issue) => issue.field === "MISSING_GROSS_WEIGHT"),
    "no missing gross weight warning"
  );
  assert(
    !report.issues.some((issue) => issue.field === "MISSING_NET_WEIGHT"),
    "no missing net weight warning"
  );
  assert(
    !report.issues.some((issue) => issue.field === "MISSING_PACKAGE_COUNT"),
    "no missing package count warning"
  );

  console.log("\nHS classification finding");
  const hsInfo = report.issues.filter((issue) => issue.field === HS_CODE_NOT_ON_INVOICE);
  assert(hsInfo.length === 1, `one HS_CODE_NOT_ON_INVOICE info finding (got ${hsInfo.length})`);
  assert(hsInfo[0]?.type === "info", "HS finding is informational");
  assert(
    hsInfo[0]?.message === HS_CODE_NOT_ON_INVOICE_MESSAGE,
    "HS finding uses manual classification message"
  );
  assert(report.hsCodesDetected.length === 0, "no HS codes on invoice lines");

  console.log("\nReadiness score & status");
  assert(
    report.readinessScore >= 85 && report.readinessScore <= 90,
    `readinessScore 85–90 (got ${report.readinessScore})`
  );
  const verdict = getReadinessVerdict(report);
  assert(
    verdict.exportStatus === "Ready With Review",
    `exportStatus Ready With Review (got "${verdict.exportStatus}")`
  );
  assert(report.auditStatus === "WARNING", `auditStatus WARNING aligned (got ${report.auditStatus})`);
  assert(
    verdict.exportStatus === verdict.exportStatus && report.auditStatus === verdict.auditStatus,
    "unified readiness — no READY vs Ready With Review contradiction"
  );
  assert(
    !/preferential origin has not been confirmed/i.test(report.exportSummary),
    "export summary does not claim unconfirmed preferential origin"
  );
  assert(
    !report.recommendedActions.some((action) =>
      /verify preferential origin/i.test(action.description)
    ),
    "no Verify preferential origin in recommended actions"
  );

  console.log("\nInvoice value");
  assert(
    Math.abs(report.invoiceSummary.invoiceValue - EXPECTED_INVOICE_VALUE) < 0.01,
    `invoiceValue = ${EXPECTED_INVOICE_VALUE} EUR (got ${report.invoiceSummary.invoiceValue})`
  );
  const valueConsistency = assertInvoiceValueConsistent(report, EXPECTED_INVOICE_VALUE);
  assert(valueConsistency.ok, "invoice value consistent across all UI sections");
  if (!valueConsistency.ok) {
    for (const mismatch of valueConsistency.mismatches) {
      console.error(`    ${mismatch}`);
    }
  }

  console.log("\nCross-section shipment data consistency");
  const shipmentConsistency = assertShipmentDataConsistent(report, {
    expectedInvoiceValue: EXPECTED_INVOICE_VALUE,
    expectedGrossWeight: 78,
    expectedNetWeight: 62,
    expectedPackageCount: 1,
    expectedInvoiceNumber: "2602002968",
    expectedGoodsLines: 38,
  });
  assert(shipmentConsistency.ok, "shipment data consistent across all sections");
  if (!shipmentConsistency.ok) {
    for (const mismatch of shipmentConsistency.mismatches) {
      console.error(`    ${mismatch}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
