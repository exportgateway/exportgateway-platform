"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, Loader2, ScanLine, Upload } from "lucide-react";
import { DocumentUploadArea, HiddenFileInput } from "@/components/export-auditor/DocumentUploadArea";
import { ExportAuditorPrivacyNotice } from "@/components/export-auditor/ExportAuditorPrivacyNotice";
import { ExportAuditorTrustBadges } from "@/components/export-auditor/ExportAuditorTrustBadges";
import { DocumentPreviewPanel } from "@/components/export-auditor/DocumentPreviewPanel";
import { UploadedFileCard } from "@/components/export-auditor/UploadedFileCard";
import {
  ProcessingTimeline,
  buildProcessingTimeline,
  timelineIndexFromProgress,
} from "@/components/export-auditor/ProcessingTimeline";
import { ExportAuditorEmptyState } from "@/components/export-auditor/ExportAuditorEmptyState";
import { ExportAuditorResultsDashboard } from "@/components/export-auditor/ExportAuditorResultsDashboard";
import {
  runFullExportAudit,
  validateUploadFile,
} from "@/lib/export-auditor/api-client";
import type {
  AuditProgressStep,
  ExportAuditReport,
  ExportAuditorApiError,
} from "@/lib/export-auditor/types";
import { AUDIT_PROGRESS_STEPS } from "@/lib/export-auditor/types";

type WorkspacePhase = "idle" | "processing" | "complete" | "error";

export function ExportAuditorWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<WorkspacePhase>("idle");
  const [progressSteps, setProgressSteps] = useState<AuditProgressStep[]>(
    AUDIT_PROGRESS_STEPS.map((s) => ({ ...s, status: "pending" as const }))
  );
  const [report, setReport] = useState<ExportAuditReport | null>(null);
  const [error, setError] = useState<ExportAuditorApiError | null>(null);

  const hasFile = file !== null;
  const uploadCollapsed = hasFile;
  const isProcessing = phase === "processing";

  const activeTimelineIndex = (() => {
    const active = progressSteps.find((s) => s.status === "active");
    if (!active) {
      return phase === "complete" ? 5 : 0;
    }
    return timelineIndexFromProgress(active.id);
  })();

  const timelineSteps = buildProcessingTimeline(
    phase === "complete" ? "complete" : isProcessing ? "processing" : "idle",
    activeTimelineIndex
  );

  const reset = useCallback(() => {
    setFile(null);
    setPhase("idle");
    setReport(null);
    setError(null);
    setProgressSteps(
      AUDIT_PROGRESS_STEPS.map((s) => ({ ...s, status: "pending" as const }))
    );
  }, []);

  const handleFileSelect = useCallback(
    (f: File) => {
      setFile(f);
      setError(null);
      if (phase === "complete" || phase === "error") {
        setPhase("idle");
        setReport(null);
      }
    },
    [phase]
  );

  const startAudit = useCallback(async () => {
    if (!file) return;

    const validationError = validateUploadFile(file);
    if (validationError) {
      setError(validationError);
      setPhase("error");
      return;
    }

    setError(null);
    setReport(null);
    setPhase("processing");
    setProgressSteps(
      AUDIT_PROGRESS_STEPS.map((s, i) => ({
        ...s,
        status: i === 0 ? "active" : "pending",
      }))
    );

    try {
      const result = await runFullExportAudit(file, setProgressSteps);
      setReport(result);
      setPhase("complete");
    } catch (err) {
      setError(err as ExportAuditorApiError);
      setPhase("error");
    }
  }, [file]);

  return (
    <div className="grid gap-6 xl:grid-cols-12 xl:gap-8">
      {/* Left — preview + upload */}
      <div className="space-y-3 xl:col-span-5">
        <div>
          <h2 className="platform-section-title">Document</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Upload and preview your export invoice.
          </p>
        </div>

        <DocumentPreviewPanel
          fileName={file?.name ?? null}
          fileType={file?.type}
          pageCount={file?.name.toLowerCase().endsWith(".pdf") ? 2 : 1}
        />

        {!uploadCollapsed ? (
          <DocumentUploadArea
            disabled={isProcessing}
            collapsed={false}
            onFileSelect={handleFileSelect}
          />
        ) : (
          <div className="space-y-2">
            <UploadedFileCard
              fileName={file!.name}
              fileSizeBytes={file!.size}
              uploaded={phase === "complete"}
            />

            {phase !== "complete" && (
              <button
                type="button"
                onClick={startAudit}
                disabled={isProcessing}
                className="btn-primary w-full disabled:pointer-events-none disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Analysing…
                  </>
                ) : (
                  <>
                    <ScanLine className="h-4 w-4" aria-hidden />
                    Run Export Audit
                  </>
                )}
              </button>
            )}

            {!isProcessing && (
              <>
                <HiddenFileInput
                  inputRef={fileInputRef}
                  disabled={isProcessing}
                  onFileSelect={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary w-full"
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  Upload New Document
                </button>
              </>
            )}

            {(phase === "complete" || phase === "error") && (
              <button type="button" onClick={reset} className="btn-secondary w-full">
                Start Over
              </button>
            )}
          </div>
        )}

        <ExportAuditorTrustBadges />
        <ExportAuditorPrivacyNotice />

        {(isProcessing || phase === "complete") && (
          <ProcessingTimeline steps={timelineSteps} />
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{error.message}</p>
              {error.code && (
                <p className="mt-0.5 text-xs opacity-80">Code: {error.code}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right — results workspace */}
      <div className="xl:col-span-7">
        <div className="mb-3">
          <h2 className="platform-section-title">Compliance Review</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Readiness score, findings, and customs disposition.
          </p>
        </div>

        {phase === "idle" && !report && <ExportAuditorEmptyState />}

        {isProcessing && !report && (
          <div className="rounded-2xl border border-surface-border bg-white px-6 py-12 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-600" aria-hidden />
            <p className="mt-4 text-sm font-medium text-slate-700">
              Running export compliance analysis…
            </p>
            <p className="mt-1 text-xs text-slate-500">
              OCR, classification, origin analysis, and compliance review in progress.
            </p>
          </div>
        )}

        {report && phase === "complete" && (
          <ExportAuditorResultsDashboard report={report} />
        )}
      </div>
    </div>
  );
}
