/**
 * Run export-auditor pipeline on a golden invoice source payload.
 */

import type { AuditReportResponse, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { enrichInvoiceDocument } from "@/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "@/lib/export-auditor/map-api-response";
import { extractGoldenCapturedFields } from "@/lib/export-auditor/golden-dataset/extract-actual-results";
import type { GoldenCapturedFields, GoldenExpectedResults } from "@/lib/export-auditor/golden-dataset/types";
import type { ExportAuditReport } from "@/lib/export-auditor/types";

export interface GoldenProcessOptions {
  pdfText?: string | null;
  audit?: AuditReportResponse;
  fileName?: string;
}

function defaultAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 75, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

export interface GoldenProcessResult {
  invoice: NormalizedInvoice;
  report: ExportAuditReport;
  captured: GoldenCapturedFields;
}

export function processGoldenInvoiceSource(
  source: NormalizedInvoice,
  options: GoldenProcessOptions = {}
): GoldenProcessResult {
  const enriched = enrichInvoiceDocument(source, options.pdfText ?? null);
  const fileName =
    options.fileName ??
    (enriched.invoice_number ? `${enriched.invoice_number}.pdf` : "invoice.pdf");
  const report = mapAuditReportToExportReport(
    enriched,
    options.audit ?? defaultAudit(),
    fileName
  );
  const captured = extractGoldenCapturedFields(report, enriched);
  return { invoice: enriched, report, captured };
}

export function buildExpectedResultsFromCapture(
  id: string,
  label: string,
  captured: GoldenCapturedFields,
  sourceFileName = "invoice-source.json"
): GoldenExpectedResults {
  return {
    schemaVersion: 1,
    id,
    label,
    capturedAt: new Date().toISOString().slice(0, 10),
    source: {
      invoicePdf: "invoice.pdf",
      validationReportPdf: "validation-report.pdf",
      invoiceSource: sourceFileName,
    },
    expected: captured,
    allowedAnomalies: [],
  };
}
