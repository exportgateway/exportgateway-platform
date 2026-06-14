"use server";

import { getExportAuditorApiUrl } from "@/lib/api-config";
import type {
  AuditReportResponse,
  DispositionResponse,
  NormalizedInvoice,
  PreferenceOriginResponse,
  ReadinessResponse,
} from "@/lib/export-auditor/api-types";
import { sanitizeInvoiceForBackendApi } from "@/lib/export-auditor/backend-invoice-sanitize";
import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "@/lib/export-auditor/document-enrichment";
import { extractPdfPageCount, extractPdfText } from "@/lib/export-auditor/pdf-text-extract";
import {
  enableForensicTraceForInvoice,
  logBeforeMap,
} from "@/lib/export-auditor/as2026-forensic-trace";
import { attachRawOcrShipmentMetadata } from "@/lib/export-auditor/shipment-extraction-diagnostics";
import { mapAuditReportToExportReport } from "@/lib/export-auditor/map-api-response";
import type { ExportAuditorApiError, ExportAuditReport } from "@/lib/export-auditor/types";

function getExportAuditorBaseUrl(): string {
  return getExportAuditorApiUrl();
}

const EXPORT_AUDITOR_TIMEOUT_MS = {
  ocr: 120_000,
  json: 90_000,
} as const;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Export auditor request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((d: { msg?: string; loc?: (string | number)[] }) => {
          const path = Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : "";
          const msg = d.msg || JSON.stringify(d);
          return path ? `${path}: ${msg}` : msg;
        })
        .join("; ");
    }
    if (typeof data.message === "string") return data.message;
    return `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function apiError(
  code: ExportAuditorApiError["code"],
  message: string
): { ok: false; error: ExportAuditorApiError } {
  return { ok: false, error: { code, message } };
}

async function postExportAuditorJson<T>(
  path: string,
  invoice: NormalizedInvoice
): Promise<{ ok: true; data: T } | { ok: false; error: ExportAuditorApiError }> {
  const url = `${getExportAuditorBaseUrl()}${path}`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizeInvoiceForBackendApi(invoice)),
        cache: "no-store",
      },
      EXPORT_AUDITOR_TIMEOUT_MS.json
    );

    if (!res.ok) {
      const code =
        path.includes("audit-report")
          ? "AUDIT_REPORT_FAILED"
          : path.includes("disposition")
            ? "AUDIT_FAILED"
            : path.includes("readiness")
              ? "AUDIT_FAILED"
              : path.includes("preference-origin")
                ? "AUDIT_FAILED"
                : "AUDIT_FAILED";
      return apiError(code, await parseApiError(res));
    }

    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return apiError(
      "AUDIT_FAILED",
      err instanceof Error ? err.message : "Could not reach the export-auditor API."
    );
  }
}

export type OcrActionResult =
  | { ok: true; invoice: NormalizedInvoice; fileName: string }
  | { ok: false; error: ExportAuditorApiError };

export type AuditReportActionResult =
  | { ok: true; auditReport: AuditReportResponse }
  | { ok: false; error: ExportAuditorApiError };

export type JsonEndpointResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExportAuditorApiError };

export type FullAuditActionResult =
  | { ok: true; report: ExportAuditReport }
  | { ok: false; error: ExportAuditorApiError };

function logEnrichmentCheckpoint(label: string, invoice: NormalizedInvoice, extra?: object) {
  console.log(`[EXPORT-AUDITOR-RUNTIME] ${label}`, {
    authorised_exporter_number: invoice.authorised_exporter_number ?? null,
    origin_declaration_text_len: invoice.origin_declaration_text?.length ?? 0,
    shipment_summary: invoice.shipment_summary ?? null,
    ocr_text_len: invoice.ocr_text?.length ?? 0,
    ...extra,
  });
}

/** Server-side OCR proxy — dedicated Export Auditor service only. */
export async function postExportAuditorOcrAction(
  formData: FormData
): Promise<OcrActionResult> {
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof Blob)) {
    return apiError("INVALID_FILE", "No file provided for OCR.");
  }

  const fileName =
    fileEntry instanceof File && fileEntry.name ? fileEntry.name : "document.pdf";
  const pdfBuffer = Buffer.from(await fileEntry.arrayBuffer());
  const pdfText = await extractPdfText(pdfBuffer);
  const pageCount = await extractPdfPageCount(pdfBuffer, fileName);
  const url = `${getExportAuditorBaseUrl()}/export-auditor/ocr`;
  const upstream = new FormData();
  upstream.append("file", new Blob([pdfBuffer], { type: fileEntry.type || "application/pdf" }), fileName);

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        body: upstream,
        cache: "no-store",
      },
      EXPORT_AUDITOR_TIMEOUT_MS.ocr
    );

    if (!res.ok) {
      return apiError("OCR_FAILED", await parseApiError(res));
    }

    const rawInvoice = (await res.json()) as NormalizedInvoice;
    if (enableForensicTraceForInvoice(rawInvoice)) {
      const captureDir = path.join(process.cwd(), "scripts/fixtures/as2026-live-capture");
      fs.mkdirSync(captureDir, { recursive: true });
      fs.writeFileSync(path.join(captureDir, "raw-ocr.json"), JSON.stringify(rawInvoice, null, 2));
      fs.writeFileSync(path.join(captureDir, "pdfText.txt"), pdfText);
      console.log("[AS2026-FORENSIC] captured raw OCR + pdfText to scripts/fixtures/as2026-live-capture/");
    }
    logEnrichmentCheckpoint("BEFORE enrichInvoiceDocument", rawInvoice, {
      pdfTextLength: pdfText.length,
      pageCount,
    });
    const invoice = enrichInvoiceDocument(
      attachRawOcrShipmentMetadata(
        {
          ...rawInvoice,
          ocr_metadata: {
            ...rawInvoice.ocr_metadata,
            page_count: pageCount,
            extracted_pdf_text: pdfText || undefined,
          },
        },
        pdfText.length
      ),
      pdfText
    );
    logEnrichmentCheckpoint("postExportAuditorOcrAction return", invoice);
    return { ok: true, invoice, fileName };
  } catch (err) {
    return apiError(
      "OCR_FAILED",
      err instanceof Error ? err.message : "Could not reach the export-auditor API."
    );
  }
}

export async function postExportAuditorReadinessAction(
  invoice: NormalizedInvoice
): Promise<JsonEndpointResult<ReadinessResponse>> {
  return postExportAuditorJson<ReadinessResponse>("/export-auditor/readiness", invoice);
}

export async function postExportAuditorDispositionAction(
  invoice: NormalizedInvoice
): Promise<JsonEndpointResult<DispositionResponse>> {
  return postExportAuditorJson<DispositionResponse>("/export-auditor/disposition", invoice);
}

export async function postExportAuditorPreferenceOriginAction(
  invoice: NormalizedInvoice
): Promise<JsonEndpointResult<PreferenceOriginResponse>> {
  return postExportAuditorJson<PreferenceOriginResponse>(
    "/export-auditor/preference-origin",
    invoice
  );
}

export async function postExportAuditorAuditReportAction(
  invoice: NormalizedInvoice
): Promise<AuditReportActionResult> {
  const result = await postExportAuditorJson<AuditReportResponse>(
    "/export-auditor/audit-report",
    invoice
  );
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, auditReport: result.data };
}

/**
 * Analysis + mapping on the server — keeps enriched invoice on server through mapping.
 * Called after OCR so the client can advance progress between pipeline stages.
 */
export async function runExportAuditAnalysisAction(
  invoice: NormalizedInvoice,
  fileName: string
): Promise<FullAuditActionResult> {
  // Re-enrich after client round-trip — OCR action enriches on server but analysis
  // receives invoice serialized through the browser; recovery fields may be stale.
  const cachedPdfText =
    typeof invoice.ocr_metadata?.extracted_pdf_text === "string"
      ? invoice.ocr_metadata.extracted_pdf_text
      : null;
  invoice = enrichInvoiceDocument(invoice, cachedPdfText);

  const [readinessResult, dispositionResult, preferenceOriginResult, auditReportResult] =
    await Promise.all([
      postExportAuditorReadinessAction(invoice),
      postExportAuditorDispositionAction(invoice),
      postExportAuditorPreferenceOriginAction(invoice),
      postExportAuditorAuditReportAction(invoice),
    ]);

  if (!auditReportResult.ok) {
    return auditReportResult;
  }
  if (!readinessResult.ok) {
    return readinessResult;
  }
  if (!dispositionResult.ok) {
    return dispositionResult;
  }
  if (!preferenceOriginResult.ok) {
    return preferenceOriginResult;
  }

  logEnrichmentCheckpoint("before mapAuditReportToExportReport", invoice);
  logBeforeMap(invoice);

  const report = mapAuditReportToExportReport(invoice, auditReportResult.auditReport, fileName, {
    readiness: readinessResult.data,
    disposition: dispositionResult.data,
    preferenceOrigin: preferenceOriginResult.data,
    pageCount: invoice.ocr_metadata?.page_count,
  });

  console.log("[EXPORT-AUDITOR-RUNTIME] mapAuditReportToExportReport UI snapshot", {
    authorisedExporterDetected: report.preferenceOrigin.authorisedExporterDetected,
    authorisedExporterNumber: report.preferenceOrigin.authorisedExporterNumber,
    originDeclarationFound: report.preferenceOrigin.originDeclarationFound,
    shipmentSummary: report.shipmentSummary,
    netWeight: report.hsAggregationReport.mrnSummary.totalNetWeight,
    grossWeight: report.hsAggregationReport.mrnSummary.totalGrossWeight,
    linePrefs: report.preferenceOrigin.lineItems.map((l) => l.preferential_origin),
    invoiceValue: report.invoiceSummary.invoiceValue,
    invoiceRecoveryVersion: "discount-vat-v2",
    mrnExportReady: report.mrnExportReady,
  });

  return { ok: true, report };
}

/**
 * Full export audit on the server — keeps enriched invoice on server through mapping.
 * Fixes live UI when client-side mapAuditReportToExportReport received a stripped invoice.
 */
export async function runFullExportAuditAction(
  formData: FormData
): Promise<FullAuditActionResult> {
  const ocrResult = await postExportAuditorOcrAction(formData);
  if (!ocrResult.ok) {
    return ocrResult;
  }

  return runExportAuditAnalysisAction(ocrResult.invoice, ocrResult.fileName);
}
