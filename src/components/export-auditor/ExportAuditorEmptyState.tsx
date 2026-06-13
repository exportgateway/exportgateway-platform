import { FileSearch } from "lucide-react";

export function ExportAuditorEmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-surface-border bg-slate-50/40 px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <FileSearch className="h-7 w-7" aria-hidden />
      </div>
      <p className="mt-6 max-w-sm text-base font-medium text-slate-600">
        Upload a document to start export compliance analysis.
      </p>
      <p className="mt-2 max-w-xs text-sm text-slate-400">
        Results will appear here after OCR extraction and audit analysis complete.
      </p>
    </div>
  );
}
