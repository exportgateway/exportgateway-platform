"use client";

import { CheckCircle2, FileText } from "lucide-react";

interface UploadedFileCardProps {
  fileName: string;
  fileSizeBytes: number;
  uploaded?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function UploadedFileCard({
  fileName,
  fileSizeBytes,
  uploaded = true,
}: UploadedFileCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
        {uploaded ? (
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        ) : (
          <FileText className="h-5 w-5" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
          {uploaded ? "Invoice uploaded" : "Selected document"}
        </p>
        <p className="truncate text-sm font-medium text-slate-900">{fileName}</p>
        <p className="text-xs text-slate-500">{formatFileSize(fileSizeBytes)}</p>
      </div>
    </div>
  );
}
