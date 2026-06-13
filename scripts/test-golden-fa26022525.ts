/**
 * FA26022525_CR0698891_GOLDEN_TEST
 * Golden regression — Robot Coupe invoice FA26022525 / CR0698891 → Kosovo.
 * Run: npm run test:golden-fa26022525
 *
 * Validates European number parsing, HS aggregation, MRN summary, shipment summary,
 * and preferential origin against the real PDF + OCR fixture.
 */

import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { runHsAggregationEngine } from "../src/lib/export-auditor/hs-aggregation-engine";
import { parseLocaleNumber, sumLineTotals } from "../src/lib/export-auditor/parse-locale-number";
import { getReadinessVerdict } from "../src/lib/export-auditor/readiness-score";
import {
  MISSING_VAT_ARTICLE,
  VAT_ARTICLE_CANONICAL_MESSAGE,
} from "../src/lib/export-auditor/issue-readiness";
import { REQUEST_MISSING_VAT_ARTICLE } from "../src/lib/export-auditor/preferential-export-readiness";
import type {
  AuditReportResponse,
  DispositionResponse,
  NormalizedInvoice,
  ReadinessResponse,
} from "../src/lib/export-auditor/api-types";

const TEST_NAME = "FA26022525_CR0698891_GOLDEN_TEST";
const PDF_PATH =
  process.env.GOLDEN_PDF_FA26022525 ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\650330_FA26022525_CR0698891.PDF";
const FIXTURE_PATH = path.join(__dirname, "fixtures", "fa26022525-ocr.json");

const EXPECTED_LINE_TOTALS = [1123.5, 2884, 953.4, 191.8, 191.8, 249.2];
const EXPECTED_INVOICE_VALUE = 5593.7;
const EXPECTED_HS = "8438809900";

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
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`OCR fixture missing: ${FIXTURE_PATH}`);
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
}

const VAT_ARTICLE_SHORT = "VAT article is missing.";
const VAT_ARTICLE_LONG = "VAT article is missing or incomplete.";

function buildUpstreamAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: {
      score: 80,
      status: "WARNING",
      warnings: [VAT_ARTICLE_SHORT],
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
      {
        severity: "WARNING",
        code: "MISSING_VAT_ARTICLE",
        message: VAT_ARTICLE_SHORT,
      },
      {
        severity: "WARNING",
        code: "MISSING_VAT_ARTICLE",
        message: VAT_ARTICLE_LONG,
      },
      {
        severity: "WARNING",
        code: "NO_ORIGIN_DECLARATION",
        message: "No origin declaration found on invoice",
      },
    ],
    recommended_actions: [
      "Verify preferential origin",
      "Request missing VAT article",
    ],
    summary:
      "Invoice requires review before export declaration, preferential origin has not been confirmed.",
  };
}

function buildUpstreamExtras(): {
  readiness: ReadinessResponse;
  disposition: DispositionResponse;
} {
  return {
    readiness: {
      score: 80,
      status: "WARNING",
      warnings: [VAT_ARTICLE_LONG],
      errors: [],
      checks_passed: 5,
      checks_total: 8,
    },
    disposition: {
      status: "REVIEW REQUIRED BEFORE EXPORT DECLARATION",
      disposition_text:
        "EXPORT CUSTOMS DISPOSITION (INDICATIVE)\n\nStatus: REVIEW REQUIRED BEFORE EXPORT DECLARATION",
    },
  };
}

async function main() {
  console.log(`${TEST_NAME}\n`);

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF not found: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfText = await extractPdfText(pdfBuffer);
  assert(pdfText.length > 100, `PDF text extracted (${pdfText.length} chars)`);

  const rawInvoice = loadOcrFixture();
  const invoice = enrichInvoiceDocument(rawInvoice, pdfText);
  const report = mapAuditReportToExportReport(
    invoice,
    buildUpstreamAudit(),
    "650330_FA26022525_CR0698891.PDF",
    buildUpstreamExtras()
  );
  const aggregation = runHsAggregationEngine(invoice);

  console.log("\nEuropean number parsing");
  assert(parseLocaleNumber("1,123.50") === 1123.5, "US thousands comma: 1,123.50 → 1123.50");
  assert(parseLocaleNumber("1123.50") === 1123.5, "US decimal: 1123.50 → 1123.50");
  assert(parseLocaleNumber("1.123,50") === 1123.5, "EU format: 1.123,50 → 1123.50");
  assert(parseLocaleNumber("5.593,70") === 5593.7, "EU total: 5.593,70 → 5593.70");
  assert(parseLocaleNumber("953.40") === 953.4, "US decimal: 953.40 → 953.40");

  console.log("\nLine totals vs OCR source");
  const items = invoice.items ?? [];
  for (let i = 0; i < EXPECTED_LINE_TOTALS.length; i++) {
    const parsed = parseLocaleNumber(items[i]?.line_total);
    assert(
      Math.abs(parsed - EXPECTED_LINE_TOTALS[i]) < 0.01,
      `position ${i + 1} line_total = ${EXPECTED_LINE_TOTALS[i]} (got ${parsed})`
    );
  }
  const lineSum = sumLineTotals(invoice.items);
  assert(
    lineSum != null && Math.abs(lineSum - EXPECTED_INVOICE_VALUE) < 0.01,
    `line sum = ${EXPECTED_INVOICE_VALUE} EUR (got ${lineSum})`
  );

  console.log("\nInvoice value (must not use mis-OCR header 158.624,01)");
  assert(
    Math.abs(report.invoiceSummary.invoiceValue - EXPECTED_INVOICE_VALUE) < 0.01,
    `invoiceValue = ${EXPECTED_INVOICE_VALUE} EUR (got ${report.invoiceSummary.invoiceValue})`
  );

  console.log("\nDestination");
  const dest = report.invoiceSummary.destinationCountry;
  assert(/kosovo/i.test(dest) && /XK/i.test(dest), `destination_country = Kosovo (XK) (got "${dest}")`);

  console.log("\nShipment summary");
  const shipment = report.shipmentSummary;
  assert(shipment.packageCount === 1, `package_count = 1 (got ${shipment.packageCount})`);
  assert(shipment.packageType === "PALLET", `package_type = PALLET (got ${shipment.packageType})`);
  assert(shipment.grossWeightTotal === 81, `gross_weight = 81 kg (got ${shipment.grossWeightTotal})`);
  assert(
    shipment.grossWeightUnit?.toLowerCase() === "kg",
    `gross_weight unit = kg (got ${shipment.grossWeightUnit})`
  );
  assert(shipment.netWeightTotal === 65, `net_weight = 65 kg (got ${shipment.netWeightTotal})`);
  assert(
    shipment.netWeightUnit?.toLowerCase() === "kg",
    `net_weight unit = kg (got ${shipment.netWeightUnit})`
  );
  assert(
    !("palletDimensions" in shipment),
    "shipment summary does not expose pallet dimensions"
  );
  assert(
    !report.issues.some((i) => i.field === "MISSING_NET_WEIGHT"),
    "no MISSING_NET_WEIGHT when shipment net weight is present"
  );

  console.log("\nHS aggregation & MRN summary");
  const hsRow = aggregation.hs_aggregation.find((row) => row.hs_code === EXPECTED_HS);
  assert(hsRow != null, `HS ${EXPECTED_HS} aggregated`);
  const hsAggregationRow = hsRow!;
  assert(hsAggregationRow.item_count === 6, `HS ${EXPECTED_HS} covers 6 positions`);
  assert(
    Math.abs(hsAggregationRow.total_value - EXPECTED_INVOICE_VALUE) < 0.01,
    `HS ${EXPECTED_HS} total_value = ${EXPECTED_INVOICE_VALUE} (got ${hsAggregationRow.total_value})`
  );
  assert(
    Math.abs(aggregation.mrn_summary.total_invoice_value - EXPECTED_INVOICE_VALUE) < 0.01,
    `MRN total_invoice_value = ${EXPECTED_INVOICE_VALUE} (got ${aggregation.mrn_summary.total_invoice_value})`
  );
  assert(
    aggregation.mrn_summary.total_gross_weight === 81,
    `MRN total_gross_weight = 81 kg (got ${aggregation.mrn_summary.total_gross_weight})`
  );
  assert(
    aggregation.mrn_summary.total_net_weight === 65,
    `MRN total_net_weight = 65 kg (got ${aggregation.mrn_summary.total_net_weight})`
  );
  assert(aggregation.mrn_summary.total_goods_lines === 6, "MRN total_goods_lines = 6");

  console.log("\nPreferential origin");
  const pref = report.preferenceOrigin;
  assert(pref.authorisedExporterDetected === true, "authorised_exporter_found = true");
  assert(
    pref.authorisedExporterNumber === "FR006130/0032",
    `authorised_exporter_number = FR006130/0032 (got ${pref.authorisedExporterNumber})`
  );
  assert(pref.originDeclarationFound === true, "origin_declaration_found = true");
  assert(
    pref.lineItems.length === 6 && pref.lineItems.every((line) => line.preferential_origin === "YES"),
    "all 6 positions preferential_origin = YES"
  );
  assert(
    !pref.lineItems.some((line) => line.preferential_origin === "UNKNOWN"),
    "no position remains UNKNOWN"
  );

  const prefYes = report.hsAggregationReport.preferentialSummary.find(
    (row) => row.hsCode === EXPECTED_HS
  );
  assert(prefYes != null, "preferential summary row for HS 8438809900");
  const prefYesRow = prefYes!;
  assert(
    Math.abs(prefYesRow.totalValue - EXPECTED_INVOICE_VALUE) < 0.01,
    `preferential summary value = ${EXPECTED_INVOICE_VALUE} EUR (got ${prefYesRow.totalValue})`
  );
  assert(
    prefYesRow.totalNetWeight === 65,
    `preferential summary weight = 65 kg (got ${prefYesRow.totalNetWeight})`
  );
  assert(
    prefYesRow.weightAllocationUnavailable !== true,
    "preferential summary weight allocated from shipment net weight"
  );
  assert(
    report.hsAggregationReport.nonPreferentialSummary.length === 0,
    "non-preferential summary empty"
  );
  assert(
    report.hsAggregationReport.mrnSummary.totalNetWeight === 65,
    `MRN net weight = 65 kg (got ${report.hsAggregationReport.mrnSummary.totalNetWeight})`
  );
  assert(
    report.hsAggregationReport.mrnSummary.totalNetWeight === prefYesRow.totalNetWeight,
    "preferential summary and MRN use the same net weight source"
  );
  assert(
    (report.hsAggregationReport.unknownPreferenceSummary ?? []).length === 0,
    "unknown preference summary empty"
  );

  console.log("\nEUR.1 recommendation");
  assert(pref.eur1Recommended === false, "eur1_recommended = false");
  assert(
    (pref.requiredDocuments ?? []).length === 0,
    `required_documents = [] (got ${JSON.stringify(pref.requiredDocuments)})`
  );

  console.log("\nIssue deduplication & origin-declaration filtering");
  const vatIssues = report.issues.filter((issue) => issue.field === MISSING_VAT_ARTICLE);
  assert(vatIssues.length === 1, `MISSING_VAT_ARTICLE deduplicated (got ${vatIssues.length})`);
  assert(
    vatIssues[0]?.message === VAT_ARTICLE_CANONICAL_MESSAGE,
    `canonical VAT message (got "${vatIssues[0]?.message}")`
  );
  assert(
    !report.issues.some(
      (issue) =>
        issue.field === "NO_ORIGIN_DECLARATION" ||
        /no origin declaration/i.test(issue.message)
    ),
    "NO_ORIGIN_DECLARATION removed when origin + authorised exporter detected"
  );

  console.log("\nReadiness score & export status");
  assert(
    report.readinessScore >= 90 && report.readinessScore <= 95,
    `readinessScore 90–95 with only MISSING_VAT_ARTICLE (got ${report.readinessScore})`
  );
  assert(report.auditStatus === "READY", `auditStatus READY (got ${report.auditStatus})`);
  const verdict = getReadinessVerdict(report);
  assert(
    verdict.exportStatus === "Ready",
    `exportStatus Ready for score >= 90 (got "${verdict.exportStatus}")`
  );
  assert(
    verdict.statusMessage === "Ready with 1 documentation warning.",
    `statusMessage documentation warning (got "${verdict.statusMessage}")`
  );
  assert(verdict.isReady === true, "isReady true for customs-complete invoice with minor warning");
  assert(report.mrnExportReady === true, "mrnExportReady true");

  console.log("\nPreferential-origin cleanup");
  assert(
    !report.recommendedActions.some((action) =>
      /verify preferential origin/i.test(action.description)
    ),
    "no Verify preferential origin in recommended actions"
  );
  assert(
    !/preferential origin has not been confirmed/i.test(report.exportSummary),
    "export summary does not claim preferential origin unconfirmed"
  );
  assert(
    report.filingRecommendations.length === 1 &&
      report.filingRecommendations[0] === REQUEST_MISSING_VAT_ARTICLE,
    `filingRecommendations only VAT request (got ${JSON.stringify(report.filingRecommendations)})`
  );
  assert(
    !report.filingRecommendations.some((rec) => /verify preferential origin/i.test(rec)),
    "no Verify preferential origin in filing recommendations"
  );
  assert(
    !report.issues.some(
      (issue) =>
        issue.field === "NO_ORIGIN_DECLARATION" ||
        /no origin declaration|verify preferential origin/i.test(issue.message)
    ),
    "no preferential-origin warnings remain"
  );
  assert(
    vatIssues[0]?.message === VAT_ARTICLE_CANONICAL_MESSAGE,
    "VAT warning uses exemption article wording"
  );

  console.log("\nCustoms disposition");
  assert(
    /READY FOR EXPORT DECLARATION/i.test(report.customsDisposition),
    `customsDisposition status READY FOR EXPORT DECLARATION (got snippet: ${report.customsDisposition.slice(0, 120)})`
  );
  assert(
    /EUR\.1 is not required/i.test(report.customsDisposition) &&
      /authorised exporter/i.test(report.customsDisposition),
    "customsDisposition explains EUR.1 not required via authorised exporter declaration"
  );
  assert(
    !/REVIEW REQUIRED BEFORE EXPORT DECLARATION/i.test(report.customsDisposition),
    "customsDisposition overrides upstream REVIEW REQUIRED text when ready"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
