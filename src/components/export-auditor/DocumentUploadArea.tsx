"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPTED_EXTENSIONS } from "@/lib/export-auditor/types";

interface DocumentUploadAreaProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  collapsed?: boolean;
}

const acceptAttr = ACCEPTED_EXTENSIONS.join(",");

export function DocumentUploadArea({
  onFileSelect,
  disabled,
  collapsed = false,
}: DocumentUploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  if (collapsed) {
    return (
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-brand-500 bg-brand-50/60"
            : "border-surface-border bg-slate-50/50 hover:border-brand-300 hover:bg-brand-50/30",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
          <Upload className="h-7 w-7" aria-hidden />
        </div>
        <p className="mt-4 text-base font-semibold text-slate-900">Drag &amp; drop your document</p>
        <p className="mt-1 text-sm text-slate-500">or click to browse</p>
        <p className="mt-3 text-xs text-slate-400">PDF · PNG · JPG · JPEG · max 15 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Supported documents
        </p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>Commercial Invoice</li>
          <li>Proforma Invoice</li>
          <li>Export Invoice</li>
          <li>Scanned Customs Documents</li>
        </ul>
      </div>
    </div>
  );
}

/** Hidden file input for collapsed upload — use with ref trigger */
export function HiddenFileInput({
  onFileSelect,
  disabled,
  inputRef,
}: {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={acceptAttr}
      className="sr-only"
      disabled={disabled}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
        e.target.value = "";
      }}
    />
  );
}
