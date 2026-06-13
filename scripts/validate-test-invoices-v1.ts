/**
 * Real-world validation runner — test_invoice_v1 batch.
 * Uses existing Export Auditor pipeline modules only.
 * Run: npx tsx scripts/validate-test-invoices-v1.ts
 */

import fs from "fs";
import path from "path";
import { resolveDestinationCountry } from "../src/lib/export-auditor/destination-country";
import { enrichInvoiceShipmentData } from "../src/lib/export-auditor/shipment-summary-extractor";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
import { isMrnExportReady } from "../src/lib/export-auditor/mrn-export";
import type {
  AuditReportResponse,
  DispositionResponse,
  NormalizedInvoice,
  PreferenceOriginResponse,
  ReadinessResponse,
} from "../src/lib/export-auditor/api-types";
import type { ExportAuditReport } from "../src/lib/export-auditor/types";

const TEST_FOLDER = process.env.TEST_INVOICE_FOLDER || "C:\\CURSOR\\export-auditor\\test_invoice_v1";
const REPORTS_DIR = path.join(process.cwd(), "reports");
const BASE_URL =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

interface QualityChecks {
  countryDetected: boolean;
  hsCodesDetected: boolean;
  countriesOfOriginDetected: boolean;
  grossWeightDetected: boolean;
  packageCountDetected: boolean;
  preferenceOriginDetected: boolean;
  eur1LogicDetected: boolean;
  mrnSummaryGenerated: boolean;
}

interface InvoiceValidationRow {
  filename: string;
  invoiceNumber: string;
  exporter: string;
  consignee: string;
  destinationCountry: string;
  incoterms: string;
  totalValue: number;
  packageCount: string;
  grossWeight: string;
  hsCodesDetected: string;
  countriesOfOrigin: string;
  preferenceOriginStatus: string;
  readinessStatus: string;
  mrnExportReady: boolean;
  quality: QualityChecks;
  potentialIssues: string[];
  error?: string;
}

async function postOcr(filePath: string): Promise<NormalizedInvoice> {
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const form = new FormData();
  form.append("file", blob, path.basename(filePath));
  const res = await fetch(`${BASE_URL}/export-auditor/ocr`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR failed (${res.status}): ${await res.text()}`);
  const raw = (await res.json()) as NormalizedInvoice;
  return enrichInvoiceShipmentData(resolveDestinationCountry(raw));
}

async function postJson<T>(endpoint: string, invoice: NormalizedInvoice): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });
  if (!res.ok) throw new Error(`${endpoint} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

async function processInvoice(filePath: string): Promise<InvoiceValidationRow> {
  const filename = path.basename(filePath);
  const emptyQuality: QualityChecks = {
    countryDetected: false,
    hsCodesDetected: false,
    countriesOfOriginDetected: false,
    grossWeightDetected: false,
    packageCountDetected: false,
    preferenceOriginDetected: false,
    eur1LogicDetected: false,
    mrnSummaryGenerated: false,
  };

  try {
    const invoice = await postOcr(filePath);
    const [readiness, disposition, preferenceOrigin, auditReport] = await Promise.all([
      postJson<ReadinessResponse>("/export-auditor/readiness", invoice),
      postJson<DispositionResponse>("/export-auditor/disposition", invoice),
      postJson<PreferenceOriginResponse>("/export-auditor/preference-origin", invoice),
      postJson<AuditReportResponse>("/export-auditor/audit-report", invoice),
    ]);

    const report: ExportAuditReport = mapAuditReportToExportReport(
      invoice,
      auditReport,
      filename,
      { readiness, disposition, preferenceOrigin }
    );

    const prefEngine = runPreferentialOriginEngine(invoice);
    const eur1Detected = prefEngine.declarations_detected.some(
      (d) => d.kind === "eur1_except_positions" || /eur\.?\s*1/i.test(d.text)
    );
    const prefStatuses = new Set(prefEngine.lines.map((l) => l.preferential_origin));
    const hasExplicitPref = prefStatuses.has("YES") || prefStatuses.has("NO");
    const prefSummary = `${[...prefStatuses].join("/")}${eur1Detected ? " + EUR.1" : ""}`;

    const quality: QualityChecks = {
      countryDetected: Boolean(
        invoice.country?.trim() || invoice.country_code?.trim() || report.invoiceSummary.destinationCountry !== "—"
      ),
      hsCodesDetected: report.hsCodesDetected.length > 0,
      countriesOfOriginDetected:
        report.invoiceSummary.countriesOfOrigin.length > 0 ||
        report.hsAggregationReport.mrnSummary.countriesOfOrigin.length > 0,
      grossWeightDetected: report.shipmentSummary.grossWeightTotal != null,
      packageCountDetected: report.shipmentSummary.packageCount != null,
      preferenceOriginDetected:
        hasExplicitPref ||
        report.preferenceOrigin.originDeclarationFound ||
        prefEngine.declarations_detected.length > 0,
      eur1LogicDetected: eur1Detected,
      mrnSummaryGenerated:
        report.hsAggregationReport.hsAggregation.length > 0 &&
        report.hsAggregationReport.mrnSummary.totalGoodsLines > 0,
    };

    const potentialIssues = buildPotentialIssues(report, quality, invoice);

    return {
      filename,
      invoiceNumber: report.invoiceSummary.invoiceNumber,
      exporter: report.invoiceSummary.exporter,
      consignee: report.invoiceSummary.consignee,
      destinationCountry: report.invoiceSummary.destinationCountry,
      incoterms: report.invoiceSummary.incoterms,
      totalValue: report.invoiceSummary.invoiceValue,
      packageCount:
        report.shipmentSummary.packageCount != null
          ? String(report.shipmentSummary.packageCount)
          : "—",
      grossWeight:
        report.shipmentSummary.grossWeightTotal != null
          ? `${report.shipmentSummary.grossWeightTotal} ${report.shipmentSummary.grossWeightUnit || "kg"}`
          : "—",
      hsCodesDetected: report.hsCodesDetected.join(", ") || "—",
      countriesOfOrigin:
        report.hsAggregationReport.mrnSummary.countriesOfOrigin.join(", ") ||
        report.invoiceSummary.countriesOfOrigin.join(", ") ||
        "—",
      preferenceOriginStatus: prefSummary || report.preferenceOrigin.status,
      readinessStatus: report.auditStatus,
      mrnExportReady: isMrnExportReady(report),
      quality,
      potentialIssues,
    };
  } catch (err) {
    return {
      filename,
      invoiceNumber: "—",
      exporter: "—",
      consignee: "—",
      destinationCountry: "—",
      incoterms: "—",
      totalValue: 0,
      packageCount: "—",
      grossWeight: "—",
      hsCodesDetected: "—",
      countriesOfOrigin: "—",
      preferenceOriginStatus: "—",
      readinessStatus: "ERROR",
      mrnExportReady: false,
      quality: emptyQuality,
      potentialIssues: ["Pipeline processing failed"],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildPotentialIssues(
  report: ExportAuditReport,
  quality: QualityChecks,
  invoice: NormalizedInvoice
): string[] {
  const issues: string[] = [];
  if (!quality.countryDetected) issues.push("Destination country missing or unclear");
  if (!quality.hsCodesDetected) issues.push("No HS codes detected");
  if (!quality.countriesOfOriginDetected) issues.push("No country of origin detected");
  if (!quality.grossWeightDetected) issues.push("Missing gross weight");
  if (!quality.packageCountDetected) issues.push("Missing package count");
  if (!quality.preferenceOriginDetected) issues.push("Preference origin unclear");
  if (!quality.eur1LogicDetected && /eur|preferential|origin/i.test(invoice.vat_article ?? "")) {
    issues.push("EUR.1 / preference text present but not parsed");
  }
  if (!quality.mrnSummaryGenerated) issues.push("MRN summary incomplete");
  if (report.auditStatus === "ERROR") issues.push("Readiness status ERROR");
  if (report.auditStatus === "WARNING" && issues.length === 0) {
    issues.push("Readiness warnings present");
  }
  const consignee = invoice.consignee ?? "";
  const dest = invoice.country ?? "";
  if (consignee && dest && /slovenia|SI\b/i.test(dest) && /MK-|RS-|BA-|MK\b|serbia|skopje|beograd/i.test(consignee)) {
    issues.push("Destination country appears incorrect (consignee vs destination mismatch)");
  }
  return issues;
}

function scoreRow(row: InvoiceValidationRow): number {
  if (row.error) return 0;
  const q = row.quality;
  const checks = [
    q.countryDetected,
    q.hsCodesDetected,
    q.countriesOfOriginDetected,
    q.grossWeightDetected,
    q.packageCountDetected,
    q.mrnSummaryGenerated,
  ];
  return checks.filter(Boolean).length / checks.length;
}

function escapeCsv(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function writeCsv(rows: InvoiceValidationRow[], outPath: string) {
  const headers = [
    "Filename",
    "Invoice Number",
    "Exporter",
    "Consignee",
    "Destination Country",
    "Incoterms",
    "Total Value",
    "Package Count",
    "Gross Weight",
    "HS Codes Detected",
    "Countries Of Origin",
    "Preference Origin Status",
    "Readiness Status",
    "MRN Export Ready",
    "Potential Issues",
  ];
  const lines = [headers.join(";")];
  for (const row of rows) {
    lines.push(
      [
        row.filename,
        row.invoiceNumber,
        row.exporter,
        row.consignee,
        row.destinationCountry,
        row.incoterms,
        String(row.totalValue),
        row.packageCount,
        row.grossWeight,
        row.hsCodesDetected,
        row.countriesOfOrigin,
        row.preferenceOriginStatus,
        row.readinessStatus,
        row.mrnExportReady ? "YES" : "NO",
        row.potentialIssues.join(" | "),
      ]
        .map((c) => escapeCsv(c))
        .join(";")
    );
  }
  fs.writeFileSync(outPath, `\uFEFF${lines.join("\r\n")}`, "utf8");
}

async function writeExcel(
  rows: InvoiceValidationRow[],
  mainPath: string,
  failurePath: string,
  summary: Record<string, unknown>
) {
  const XLSX = await import("xlsx");

  const mainAoA: (string | number | boolean)[][] = [
    ["ExportGateway — test_invoice_v1 Validation Report"],
    ["Generated", new Date().toISOString()],
    [],
    [
      "Filename",
      "Invoice Number",
      "Exporter",
      "Consignee",
      "Destination Country",
      "Incoterms",
      "Total Value",
      "Package Count",
      "Gross Weight",
      "HS Codes",
      "Countries Of Origin",
      "Preference Origin",
      "Readiness",
      "MRN Ready",
      "Country OK",
      "HS OK",
      "COO OK",
      "Gross Wt OK",
      "Package OK",
      "Pref Origin OK",
      "EUR.1 OK",
      "MRN OK",
      "Potential Issues",
    ],
  ];

  for (const row of rows) {
    mainAoA.push([
      row.filename,
      row.invoiceNumber,
      row.exporter,
      row.consignee,
      row.destinationCountry,
      row.incoterms,
      row.totalValue,
      row.packageCount,
      row.grossWeight,
      row.hsCodesDetected,
      row.countriesOfOrigin,
      row.preferenceOriginStatus,
      row.readinessStatus,
      row.mrnExportReady,
      row.quality.countryDetected,
      row.quality.hsCodesDetected,
      row.quality.countriesOfOriginDetected,
      row.quality.grossWeightDetected,
      row.quality.packageCountDetected,
      row.quality.preferenceOriginDetected,
      row.quality.eur1LogicDetected,
      row.quality.mrnSummaryGenerated,
      row.potentialIssues.join("; "),
    ]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mainAoA), "Validation");
  XLSX.writeFile(wb, mainPath);

  const failureRows = rows.filter((r) => r.potentialIssues.length > 0 || r.error);
  const failAoA: (string | number)[][] = [
    ["Potential Issues — Failure Analysis"],
    [],
    ["Filename", "Invoice Number", "Readiness", "Score %", "Issues", "Error"],
  ];
  for (const row of failureRows) {
    failAoA.push([
      row.filename,
      row.invoiceNumber,
      row.readinessStatus,
      Math.round(scoreRow(row) * 100),
      row.potentialIssues.join("; "),
      row.error ?? "",
    ]);
  }
  const failWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(failWb, XLSX.utils.aoa_to_sheet(failAoA), "Failures");
  XLSX.writeFile(failWb, failurePath);

  const summarySheet: (string | number)[][] = [
    ["Metric", "Value"],
    ["Total Invoices", summary.totalInvoices as number],
    ["Processed OK", summary.processedOk as number],
    ["Failed Pipeline", summary.failedPipeline as number],
    ["Success Rate %", summary.successRatePct as number],
    ["Avg Quality Score %", summary.avgQualityScorePct as number],
    ["MRN Ready Count", summary.mrnReadyCount as number],
    ["HS Detected Count", summary.hsDetectedCount as number],
    ["Missing Gross Weight", summary.missingGrossWeight as number],
    ["Missing Package Count", summary.missingPackageCount as number],
    ["No HS Codes", summary.noHsCodes as number],
  ];
  const sumWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(sumWb, XLSX.utils.aoa_to_sheet(summarySheet), "Summary");
  // append summary as second sheet in main workbook too
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summarySheet), "Summary");
  XLSX.writeFile(wb, mainPath);
}

function aggregateFailures(rows: InvoiceValidationRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const issue of row.potentialIssues) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
    if (row.error) counts.set("Pipeline processing failed", (counts.get("Pipeline processing failed") ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  if (!fs.existsSync(TEST_FOLDER)) {
    console.error(`Test folder not found: ${TEST_FOLDER}`);
    process.exit(1);
  }

  const pdfs = fs
    .readdirSync(TEST_FOLDER)
    .filter((f) => /\.pdf$/i.test(f))
    .map((f) => path.join(TEST_FOLDER, f))
    .sort();

  if (pdfs.length === 0) {
    console.error("No PDF files found.");
    process.exit(1);
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  console.log(`Processing ${pdfs.length} invoices from ${TEST_FOLDER}`);
  console.log(`API: ${BASE_URL}\n`);

  const rows: InvoiceValidationRow[] = [];
  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    console.log(`[${i + 1}/${pdfs.length}] ${path.basename(pdf)}`);
    const row = await processInvoice(pdf);
    rows.push(row);
    console.log(
      `  → ${row.invoiceNumber} | ${row.destinationCountry} | HS:${row.hsCodesDetected.split(",").filter((x) => x.trim() && x !== "—").length} | MRN:${row.mrnExportReady ? "ready" : "no"} | issues:${row.potentialIssues.length}`
    );
    if (row.error) console.log(`  ERROR: ${row.error.slice(0, 120)}`);
  }

  const processedOk = rows.filter((r) => !r.error).length;
  const scores = rows.map(scoreRow);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const successRate = rows.filter((r) => scoreRow(r) >= 0.67 && !r.error).length / rows.length;

  const summary = {
    generatedAt: new Date().toISOString(),
    testFolder: TEST_FOLDER,
    apiBaseUrl: BASE_URL,
    totalInvoices: rows.length,
    processedOk,
    failedPipeline: rows.length - processedOk,
    successRatePct: Math.round(successRate * 1000) / 10,
    avgQualityScorePct: Math.round(avgScore * 1000) / 10,
    mrnReadyCount: rows.filter((r) => r.mrnExportReady).length,
    hsDetectedCount: rows.filter((r) => r.quality.hsCodesDetected).length,
    missingGrossWeight: rows.filter((r) => !r.quality.grossWeightDetected).length,
    missingPackageCount: rows.filter((r) => !r.quality.packageCountDetected).length,
    noHsCodes: rows.filter((r) => !r.quality.hsCodesDetected).length,
    commonFailures: aggregateFailures(rows),
    invoices: rows,
    recommendedFixes: [] as string[],
  };

  summary.recommendedFixes = buildRecommendedFixes(summary.commonFailures, rows);

  const csvPath = path.join(REPORTS_DIR, "test_invoice_v1_report.csv");
  const xlsxPath = path.join(REPORTS_DIR, "test_invoice_v1_report.xlsx");
  const jsonPath = path.join(REPORTS_DIR, "test_invoice_v1_summary.json");
  const failPath = path.join(REPORTS_DIR, "test_invoice_v1_failure_analysis.xlsx");

  writeCsv(rows, csvPath);
  await writeExcel(rows, xlsxPath, failPath, summary);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n=== VALIDATION COMPLETE ===");
  console.log(`Total: ${summary.totalInvoices} | Success rate: ${summary.successRatePct}%`);
  console.log(`Reports: ${REPORTS_DIR}`);
  console.log("\nMost common failures:");
  for (const [issue, count] of summary.commonFailures.slice(0, 5)) {
    console.log(`  ${count}x ${issue}`);
  }
}

function buildRecommendedFixes(
  commonFailures: [string, number][],
  rows: InvoiceValidationRow[]
): string[] {
  const fixes: string[] = [];
  const top = new Set(commonFailures.slice(0, 8).map(([k]) => k));

  if (top.has("No HS codes detected") || rows.filter((r) => !r.quality.hsCodesDetected).length > rows.length * 0.3) {
    fixes.push("Improve OCR line-item HS/tariff extraction and disposition tariff_codes fallback");
  }
  if (top.has("Missing gross weight") || top.has("Missing package count")) {
    fixes.push("Expand shipment-summary pattern library for multilingual labels (DE/SL/EN invoice layouts)");
  }
  if (top.has("Destination country appears incorrect (consignee vs destination mismatch)") || top.has("Destination country missing or unclear")) {
    fixes.push("Harden consignee postal-prefix destination rule and OCR country field prompts");
  }
  if (top.has("No country of origin detected")) {
    fixes.push("Require country_of_origin on line items in OCR schema with validation warnings");
  }
  if (top.has("Preference origin unclear") || top.has("EUR.1 / preference text present but not parsed")) {
    fixes.push("Add Slovenian/Croatian EUR.1 declaration patterns to preferential-origin engine");
  }
  if (top.has("MRN summary incomplete")) {
    fixes.push("Ensure line items include hs_code and net_weight for aggregation on multi-page invoices");
  }
  if (rows.some((r) => r.error)) {
    fixes.push("Add OCR timeout/retry and file-size validation for large scanned PDFs");
  }
  fixes.push("Run golden-file regression on test_invoice_v1 after each OCR schema change");
  fixes.push("Surface extraction confidence scores per field in Enterprise validation UI");
  fixes.push("Add proforma/non-commercial invoice detection to exclude from MRN export");

  return [...new Set(fixes)].slice(0, 10);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
