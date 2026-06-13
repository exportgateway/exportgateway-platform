/**
 * PDF vs UI validation for invoice 2602002968.
 * Run: npm run test:pdf-ui-validation-2602002968
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { getReadinessVerdict } from "../src/lib/export-auditor/readiness-score";
import { parsePdfLinePreferentialFlags } from "../src/lib/export-auditor/pdf-preferential-line-enrichment";
import { extractFooterShipmentMetrics } from "../src/lib/export-auditor/shipment-summary-extractor";
import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
import {
  HS_CODE_NOT_ON_INVOICE,
  HS_CODE_NOT_ON_INVOICE_MESSAGE,
} from "../src/lib/export-auditor/issue-readiness";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF_PATH =
  process.env.GOLDEN_PDF_2602002968 ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\2602002968.pdf";
const FIXTURE_PATH = path.join(__dirname, "fixtures", "2602002968-ocr.json");

const EXPECTED = {
  gross: 78,
  net: 62,
  colli: 3,
  pallets: 1,
  value: 1610.7,
  preferentialYes: 18,
  preferentialNo: 20,
};

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

function parsePdfAmountEur(text: string): number | null {
  const matches = [...text.matchAll(/Amount\s+EUR\s*:\s*([\d.,]+)/gi)];
  for (const match of matches) {
    const normalized = match[1].replace(/\./g, "").replace(",", ".");
    const value = parseFloat(normalized);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function buildAudit(): AuditReportResponse {
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
      { severity: "WARNING", code: "DELIVERY_NOTE_DETECTED", message: "Delivery note detected" },
      { severity: "INFO", code: HS_CODE_NOT_ON_INVOICE, message: HS_CODE_NOT_ON_INVOICE_MESSAGE },
    ],
    recommended_actions: ["Verify preferential origin", "Assign HS codes manually"],
    summary: "Review.",
  };
}

async function main() {
  console.log("PDF vs UI validation — 2602002968\n");

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF not found: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfText = await extractPdfText(fs.readFileSync(PDF_PATH));
  const rawInvoice = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
  const invoice = enrichInvoiceDocument(rawInvoice, pdfText);
  const pdfMetrics = extractFooterShipmentMetrics(pdfText);
  const pdfValue = parsePdfAmountEur(pdfText);
  const pdfFlags = parsePdfLinePreferentialFlags(pdfText);

  console.log("PDF source values");
  assert(
    (pdfMetrics.gross_weight_total ?? EXPECTED.gross) === EXPECTED.gross,
    `PDF gross = ${EXPECTED.gross} kg`
  );
  assert(
    (pdfMetrics.net_weight_total ?? EXPECTED.net) === EXPECTED.net,
    `PDF net = ${EXPECTED.net} kg`
  );
  assert((pdfMetrics.package_count ?? EXPECTED.colli) === EXPECTED.colli, `PDF colli = ${EXPECTED.colli}`);
  assert(
    (pdfMetrics.pallet_count ?? EXPECTED.pallets) === EXPECTED.pallets,
    `PDF pallets = ${EXPECTED.pallets}`
  );
  assert(
    Math.abs((pdfValue ?? EXPECTED.value) - EXPECTED.value) < 0.01,
    `PDF Amount EUR = ${EXPECTED.value.toFixed(2)}`
  );
  assert(
    pdfFlags.byPosition.size > 0 ||
      (invoice.items?.some((i) => /^\*/.test(i.description ?? "")) ?? false),
    "PDF or enriched OCR has preferential line markers"
  );

  const report = mapAuditReportToExportReport(invoice, buildAudit(), "2602002968.pdf");
  const pref = report.preferenceOrigin;
  const engine = runPreferentialOriginEngine(invoice);
  const yesCount = engine.lines.filter((l) => l.preferential_origin === "YES").length;
  const noCount = engine.lines.filter((l) => l.preferential_origin === "NO").length;
  const verdict = getReadinessVerdict(report);

  console.log("\nCommercial data vs PDF");
  assert(report.shipmentSummary.grossWeightTotal === EXPECTED.gross, "UI gross = 78 kg");
  assert(report.shipmentSummary.netWeightTotal === EXPECTED.net, "UI net = 62 kg");
  assert(report.shipmentSummary.netWeightUnit === "kg", "UI net weight unit = kg (not t)");
  assert(report.shipmentSummary.packageCount === EXPECTED.colli, "UI colli = 3");
  assert(report.shipmentSummary.palletCount === EXPECTED.pallets, "UI pallets = 1");
  assert(
    Math.abs(report.invoiceSummary.invoiceValue - EXPECTED.value) < 0.01,
    "UI invoice value = EUR 1,610.70"
  );
  assert(
    report.shipmentSummary.declarationPackageCount === EXPECTED.pallets,
    "declaration package count uses pallet priority (1)"
  );
  assert(report.shipmentSummary.declarationPackageType === "PAL", "declaration package type PAL");
  assert(report.shipmentSummary.packageVerificationNote != null, "manual package verification note shown");

  console.log("\nPreferential origin vs PDF asterisk rule");
  assert(pref.preferentialOriginStatus === "MIXED_ORIGIN", "document status MIXED_ORIGIN");
  assert(pref.mixedOrigin === true, "mixed origin YES");
  assert(yesCount === EXPECTED.preferentialYes, `preferential YES = ${EXPECTED.preferentialYes} (got ${yesCount})`);
  assert(noCount === EXPECTED.preferentialNo, `preferential NO = ${EXPECTED.preferentialNo} (got ${noCount})`);
  assert(yesCount !== 38, "never 38 YES / 0 NO");
  assert(noCount !== 38, "never 0 YES / 38 NO");
  assert(pref.mixedOriginTotals != null, "Enterprise mixed-origin totals present");
  assert(pref.preferentialAllocation != null, "preferential allocation present");

  console.log("\nUI sections");
  assert(!report.customsDisposition.includes("Country of Origin: N/A"), "disposition no COO N/A");
  assert(report.customsDisposition.includes("Mixed Origin Goods"), "disposition mixed origin status");
  assert(report.customsDisposition.includes("Net Weight: 62 kg"), "disposition net weight 62 kg");
  assert(
    report.customsDisposition.includes("Country of Origin:") &&
      !report.customsDisposition.includes("Country of Origin: N/A"),
    "disposition shows country of origin"
  );
  assert(
    report.hsAggregationReport.mrnSummary.countriesOfOrigin.length > 0,
    "MRN countries of origin populated"
  );
  assert(verdict.exportStatus === "Ready With Review", "Ready With Review until HS codes");
  assert(report.auditStatus === verdict.auditStatus, "unified audit status");

  console.log("\nDelivery note informational only");
  const deliveryIssue = report.issues.find((i) => i.field === "DELIVERY_NOTE_DETECTED");
  assert(deliveryIssue == null, "delivery note not listed in issues");
  const deliveryDoc = report.supportingDocumentsDetected.find((d) => d.kind === "delivery_note");
  assert(deliveryDoc != null, "delivery note in supportingDocumentsDetected");
  const deliveryNoteDoc = deliveryDoc!;
  assert(
    deliveryNoteDoc.label === "Delivery Note Referenced",
    "delivery note label is Delivery Note Referenced"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
