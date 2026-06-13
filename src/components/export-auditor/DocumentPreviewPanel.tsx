"use client";

import { FileImage, FileText } from "lucide-react";

interface DocumentPreviewPanelProps {
  fileName: string | null;
  fileType?: string;
  pageCount?: number;
}

/** Phase 2 placeholder — reserved for OCR overlay / page preview */
export function DocumentPreviewPanel({
  fileName,
  fileType,
  pageCount = 1,
}: DocumentPreviewPanelProps) {
  const isPdf = fileName?.toLowerCase().endsWith(".pdf") || fileType === "application/pdf";
  const Icon = isPdf ? FileText : FileImage;

  return (
    <div
      className="flex min-h-[280px] flex-col rounded-2xl border border-surface-border bg-slate-50/80"
      aria-label="Document preview panel"
      data-preview-slot="export-auditor-document"
    >
      <div className="border-b border-surface-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Document Preview
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-slate-700">
          {fileName ?? "No document selected"}
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        {fileName ? (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
              <Icon className="h-8 w-8" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-600">
              Preview with OCR highlighting
            </p>
            <p className="mt-1 max-w-xs text-xs text-slate-400 leading-relaxed">
              Phase 2 — document pages and field highlights will render here.
              {pageCount > 1 ? ` ${pageCount} pages detected.` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">Upload a document to reserve preview space.</p>
        )}
      </div>
    </div>
  );
}
