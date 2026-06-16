import {
  postExportAuditorOcrAction,
  runExportAuditAnalysisAction,
} from "@/lib/export-auditor/server-actions";
import type {
  AuditProgressStep,
  ExportAuditReport,
  ExportAuditorApiError,
} from "@/lib/export-auditor/types";
import { AUDIT_PROGRESS_STEPS } from "@/lib/export-auditor/types";

export type ProgressCallback = (steps: AuditProgressStep[]) => void;
export type TimelineIndexCallback = (index: number) => void;

/** Slightly above server-side limits so the server aborts first when possible. */
const CLIENT_TIMEOUT_MS = {
  ocr: 130_000,
  analysis: 100_000,
} as const;

function initialSteps(): AuditProgressStep[] {
  return AUDIT_PROGRESS_STEPS.map((s, i) => ({
    ...s,
    status: i === 0 ? "active" : "pending",
  }));
}

function setStepStatus(
  steps: AuditProgressStep[],
  stepId: AuditProgressStep["id"],
  status: AuditProgressStep["status"]
): AuditProgressStep[] {
  return steps.map((s) => (s.id === stepId ? { ...s, status } : s));
}

function advanceStep(
  steps: AuditProgressStep[],
  completedId: AuditProgressStep["id"],
  nextId?: AuditProgressStep["id"]
): AuditProgressStep[] {
  let updated = setStepStatus(steps, completedId, "complete");
  if (nextId) {
    updated = updated.map((s) =>
      s.id === nextId ? { ...s, status: "active" } : s
    );
  }
  return updated;
}

async function withClientTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject({
            code: "AUDIT_FAILED",
            message,
          } satisfies ExportAuditorApiError);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Export auditor pipeline — OCR and analysis as separate server actions so each
 * gets its own Vercel function budget; analysis re-enriches invoice on the server.
 */
export async function runFullExportAudit(
  file: File,
  onProgress?: ProgressCallback,
  onTimelineIndex?: TimelineIndexCallback
): Promise<ExportAuditReport> {
  let steps = initialSteps();
  onProgress?.(steps);
  onTimelineIndex?.(0);

  try {
    steps = advanceStep(steps, "upload", "ocr");
    onProgress?.(steps);
    onTimelineIndex?.(0);

    const formData = new FormData();
    formData.append("file", file, file.name);

    const ocrResult = await withClientTimeout(
      postExportAuditorOcrAction(formData),
      CLIENT_TIMEOUT_MS.ocr,
      "OCR timed out after 2 minutes. Try a smaller document or retry shortly."
    );

    if (!ocrResult.ok) {
      throw ocrResult.error;
    }

    steps = advanceStep(steps, "ocr", "analysis");
    onProgress?.(steps);
    onTimelineIndex?.(2);

    const analysisResult = await withClientTimeout(
      runExportAuditAnalysisAction(ocrResult.invoice, ocrResult.fileName),
      CLIENT_TIMEOUT_MS.analysis,
      "Export audit analysis timed out after 90 seconds. Please try again."
    );

    steps = advanceStep(steps, "analysis", "report");
    onProgress?.(steps);
    onTimelineIndex?.(4);

    if (!analysisResult.ok) {
      throw analysisResult.error;
    }

    console.log("[EXPORT-AUDITOR-RUNTIME] client received report", {
      authorisedExporterDetected: analysisResult.report.preferenceOrigin.authorisedExporterDetected,
      originDeclarationFound: analysisResult.report.preferenceOrigin.originDeclarationFound,
      shipmentSummary: analysisResult.report.shipmentSummary,
    });

    steps = advanceStep(steps, "report", "complete");
    steps = setStepStatus(steps, "complete", "complete");
    onProgress?.(steps);
    onTimelineIndex?.(5);

    return analysisResult.report;
  } catch (err) {
    const failed = steps.map((s) =>
      s.status === "active" ? { ...s, status: "error" as const } : s
    );
    onProgress?.(failed);

    if (err && typeof err === "object" && "code" in err && "message" in err) {
      throw err;
    }

    throw {
      code: "AUDIT_FAILED",
      message: err instanceof Error ? err.message : "Export audit could not be completed.",
    } satisfies ExportAuditorApiError;
  }
}

export function validateUploadFile(file: File): ExportAuditorApiError | null {
  const ext = file.name.includes(".")
    ? `.${file.name.split(".").pop()?.toLowerCase()}`
    : "";
  const validExt = [".pdf", ".png", ".jpg", ".jpeg"].includes(ext);
  const validMime =
    file.type === "application/pdf" ||
    file.type === "image/png" ||
    file.type === "image/jpeg" ||
    file.type === "";

  if (!validExt && !validMime) {
    return {
      code: "INVALID_FILE_TYPE",
      message: "Supported formats: PDF, PNG, JPG, JPEG.",
    };
  }

  if (file.size > 15 * 1024 * 1024) {
    return {
      code: "FILE_TOO_LARGE",
      message: "Maximum file size is 15 MB.",
    };
  }

  return null;
}
