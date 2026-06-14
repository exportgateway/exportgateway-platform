import {
  runFullExportAuditAction,
} from "@/lib/export-auditor/server-actions";
import type {
  AuditProgressStep,
  ExportAuditReport,
  ExportAuditorApiError,
} from "@/lib/export-auditor/types";
import { AUDIT_PROGRESS_STEPS } from "@/lib/export-auditor/types";

export type ProgressCallback = (steps: AuditProgressStep[]) => void;
export type TimelineIndexCallback = (index: number) => void;

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

/**
 * Export auditor pipeline — single server action keeps enriched invoice on server
 * through mapping (no client round-trip of NormalizedInvoice).
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

    steps = advanceStep(steps, "ocr", "analysis");
    onProgress?.(steps);
    onTimelineIndex?.(2);

    const result = await runFullExportAuditAction(formData);

    steps = advanceStep(steps, "analysis", "report");
    onProgress?.(steps);
    onTimelineIndex?.(4);

    if (!result.ok) {
      throw result.error;
    }

    console.log("[EXPORT-AUDITOR-RUNTIME] client received report", {
      authorisedExporterDetected: result.report.preferenceOrigin.authorisedExporterDetected,
      originDeclarationFound: result.report.preferenceOrigin.originDeclarationFound,
      shipmentSummary: result.report.shipmentSummary,
    });

    steps = advanceStep(steps, "report", "complete");
    steps = setStepStatus(steps, "complete", "complete");
    onProgress?.(steps);
    onTimelineIndex?.(5);

    return result.report;
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
