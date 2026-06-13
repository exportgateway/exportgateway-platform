/**
 * FA26022525 live runtime trace — mirrors postExportAuditorOcrAction + runFullExportAudit.
 * Run: npx tsx scripts/trace-fa26022525-live-runtime.ts
 */
import fs from "fs";
import path from "path";
import { getExportAuditorApiUrl } from "../src/lib/api-config";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import type {
  AuditReportResponse,
  DispositionResponse,
  NormalizedInvoice,
  PreferenceOriginResponse,
  ReadinessResponse,
} from "../src/lib/export-auditor/api-types";

const PDF =
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\650330_FA26022525_CR0698891.PDF";

function pickEnrichmentFields(invoice: NormalizedInvoice) {
  return {
    invoice_number: invoice.invoice_number,
    ocr_text_len: invoice.ocr_text?.length ?? 0,
    shipment_summary: invoice.shipment_summary ?? null,
    origin_declaration_text_len: invoice.origin_declaration_text?.length ?? 0,
    origin_declaration_text_preview: invoice.origin_declaration_text?.slice(0, 120) ?? null,
    authorised_exporter_number: invoice.authorised_exporter_number ?? null,
  };
}

/** Same as pdf-text-extract.ts but surfaces errors instead of swallowing them. */
async function extractPdfTextWithDiagnostics(buffer: Buffer): Promise<{
  text: string;
  executed: boolean;
  error: string | null;
}> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return {
      executed: true,
      text: result.text?.trim() ?? "",
      error: null,
    };
  } catch (err) {
    return {
      executed: true,
      text: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function simulateServerActionReturn(invoice: NormalizedInvoice): NormalizedInvoice {
  return JSON.parse(JSON.stringify(invoice)) as NormalizedInvoice;
}

async function postExportAuditorJson<T>(endpoint: string, invoice: NormalizedInvoice): Promise<T> {
  const res = await fetch(`${getExportAuditorApiUrl()}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  console.log("FA26022525_CR0698891 — LIVE RUNTIME TRACE\n");
  console.log(`PDF: ${PDF}\n`);

  if (!fs.existsSync(PDF)) {
    console.error("PDF not found");
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(PDF);
  const fileName = path.basename(PDF);

  // --- Step 1: extractPdfText (postExportAuditorOcrAction line 102) ---
  console.log("=== 1. extractPdfText() ===");
  const pdfDiag = await extractPdfTextWithDiagnostics(pdfBuffer);
  console.log("executed:", pdfDiag.executed);
  console.log("pdfText.length:", pdfDiag.text.length);
  console.log("pdfText.error:", pdfDiag.error);
  console.log("pdfText first 500 chars:\n", pdfDiag.text.slice(0, 500));
  console.log("");

  // --- Step 2: Remote OCR (postExportAuditorOcrAction line 118) ---
  console.log("=== 2. Remote OCR API ===");
  const form = new FormData();
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), fileName);
  const ocrRes = await fetch(`${getExportAuditorApiUrl()}/export-auditor/ocr`, {
    method: "POST",
    body: form,
  });
  const rawInvoice = (await ocrRes.json()) as NormalizedInvoice;
  console.log("BEFORE enrichInvoiceDocument():");
  console.log(JSON.stringify(pickEnrichmentFields(rawInvoice), null, 2));
  console.log("");

  // --- Step 3: enrichInvoiceDocument (line 119) ---
  console.log("=== 3. enrichInvoiceDocument() called: YES ===");
  const enriched = enrichInvoiceDocument(rawInvoice, pdfDiag.text);
  console.log("AFTER enrichInvoiceDocument():");
  console.log(JSON.stringify(pickEnrichmentFields(enriched), null, 2));
  console.log("shipment_summary:", JSON.stringify(enriched.shipment_summary, null, 2));
  console.log("origin_declaration_text:", enriched.origin_declaration_text ?? null);
  console.log("authorised_exporter_number:", enriched.authorised_exporter_number ?? null);
  console.log("");

  // --- Step 4: postExportAuditorOcrAction return (line 120) ---
  const ocrActionReturn = { ok: true as const, invoice: enriched, fileName };
  console.log("=== 4. postExportAuditorOcrAction() return invoice ===");
  console.log(JSON.stringify(pickEnrichmentFields(ocrActionReturn.invoice), null, 2));
  console.log("full invoice keys:", Object.keys(ocrActionReturn.invoice));
  console.log("");

  // --- Step 5: Server Action JSON round-trip (client receives this) ---
  const invoiceFromServerAction = simulateServerActionReturn(ocrActionReturn.invoice);
  console.log("=== 5. After Server Action JSON round-trip (client-side invoice) ===");
  console.log(JSON.stringify(pickEnrichmentFields(invoiceFromServerAction), null, 2));
  const roundTripLost =
    JSON.stringify(pickEnrichmentFields(enriched)) !==
    JSON.stringify(pickEnrichmentFields(invoiceFromServerAction));
  console.log("roundTripLost:", roundTripLost);
  console.log("");

  // --- Step 6: runExportAuditorAnalysis (api-client) ---
  const invoiceForAnalysis = invoiceFromServerAction;
  const [readiness, disposition, preferenceOrigin, auditReport] = await Promise.all([
    postExportAuditorJson<ReadinessResponse>("/export-auditor/readiness", invoiceForAnalysis),
    postExportAuditorJson<DispositionResponse>("/export-auditor/disposition", invoiceForAnalysis),
    postExportAuditorJson<PreferenceOriginResponse>(
      "/export-auditor/preference-origin",
      invoiceForAnalysis
    ),
    postExportAuditorJson<AuditReportResponse>("/export-auditor/audit-report", invoiceForAnalysis),
  ]);
  console.log("=== 6. After upstream API calls (invoice unchanged locally) ===");
  console.log(JSON.stringify(pickEnrichmentFields(invoiceForAnalysis), null, 2));
  console.log("audit.shipment_summary:", auditReport.shipment_summary ?? null);
  console.log("");

  // --- Step 7: mapAuditReportToExportReport input (api-client line 132) ---
  console.log("=== 7. Invoice received by mapAuditReportToExportReport() ===");
  console.log(JSON.stringify(pickEnrichmentFields(invoiceForAnalysis), null, 2));
  console.log("full enrichment snapshot:");
  console.log(
    JSON.stringify(
      {
        shipment_summary: invoiceForAnalysis.shipment_summary,
        origin_declaration_text: invoiceForAnalysis.origin_declaration_text,
        authorised_exporter_number: invoiceForAnalysis.authorised_exporter_number,
        ocr_text_len: invoiceForAnalysis.ocr_text?.length,
      },
      null,
      2
    )
  );
  console.log("");

  const report = mapAuditReportToExportReport(invoiceForAnalysis, auditReport, fileName, {
    readiness,
    disposition,
    preferenceOrigin,
  });

  console.log("=== 8. mapAuditReportToExportReport() UI output ===");
  console.log(
    JSON.stringify(
      {
        shipmentSummary: report.shipmentSummary,
        authorisedExporterDetected: report.preferenceOrigin.authorisedExporterDetected,
        originDeclarationFound: report.preferenceOrigin.originDeclarationFound,
        linePrefs: report.preferenceOrigin.lineItems.map((l) => l.preferential_origin),
        mrnExportReady: report.mrnExportReady,
      },
      null,
      2
    )
  );

  console.log("\n=== FIRST FAILURE POINT ===");
  if (!pdfDiag.executed) {
    console.log("FAIL: extractPdfText never executed");
  } else if (pdfDiag.error) {
    console.log(`FAIL @ extractPdfText: ${pdfDiag.error}`);
  } else if (pdfDiag.text.length === 0) {
    console.log("FAIL @ extractPdfText: pdfText.length === 0");
  } else if (!enriched.shipment_summary?.package_count) {
    console.log("FAIL @ enrichInvoiceDocument: shipment_summary not populated despite pdfText");
  } else if (roundTripLost) {
    console.log("FAIL @ Server Action JSON round-trip: enriched fields lost on serialize");
  } else if (!report.preferenceOrigin.authorisedExporterDetected) {
    console.log("FAIL @ mapAuditReportToExportReport: engine/mapping did not detect auth exporter");
  } else if (report.shipmentSummary.packageCount == null) {
    console.log("FAIL @ mapShipmentSummary: audit empty object overrides invoice");
  } else {
    console.log("PASS: Live path trace — all enrichment fields survive to UI object.");
    console.log("(If UI still broken, Next.js server bundle may differ from this Node/tsx runtime.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
