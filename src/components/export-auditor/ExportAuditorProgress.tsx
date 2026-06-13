"use client";

import { cn } from "@/lib/utils";
import type { AuditProgressStep } from "@/lib/export-auditor/types";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

interface ExportAuditorProgressProps {
  steps: AuditProgressStep[];
  className?: string;
}

function StepIcon({ status }: { status: AuditProgressStep["status"] }) {
  if (status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />;
  }
  if (status === "active") {
    return <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />;
  }
  if (status === "error") {
    return <XCircle className="h-4 w-4 text-red-500" aria-hidden />;
  }
  return <Circle className="h-4 w-4 text-slate-300" aria-hidden />;
}

export function ExportAuditorProgress({ steps, className }: ExportAuditorProgressProps) {
  return (
    <ol className={cn("space-y-2", className)} aria-label="Audit progress">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            step.status === "active" && "bg-brand-50/80 text-brand-900",
            step.status === "complete" && "text-slate-600",
            step.status === "error" && "bg-red-50 text-red-800",
            step.status === "pending" && "text-slate-400"
          )}
        >
          <StepIcon status={step.status} />
          <span className="font-medium">
            {index + 1}. {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
