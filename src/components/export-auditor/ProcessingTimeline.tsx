"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcessingTimelineStep } from "@/lib/export-auditor/types";

interface ProcessingTimelineProps {
  steps: ProcessingTimelineStep[];
  compact?: boolean;
}

function StepIcon({ status }: { status: ProcessingTimelineStep["status"] }) {
  if (status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />;
  }
  if (status === "active") {
    return <Loader2 className="h-4 w-4 animate-spin text-brand-600 shrink-0" aria-hidden />;
  }
  return <Circle className="h-4 w-4 text-slate-300 shrink-0" aria-hidden />;
}

export function ProcessingTimeline({ steps, compact }: ProcessingTimelineProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-surface-border bg-white",
        compact ? "p-4" : "p-4"
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Audit workflow
      </p>
      <ol className={cn("mt-3 space-y-2", compact && "sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-2 sm:space-y-0")}>
        {steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              "flex items-center gap-2 text-sm",
              step.status === "active" && "font-medium text-brand-700",
              step.status === "complete" && "text-slate-600",
              step.status === "pending" && "text-slate-400"
            )}
          >
            <StepIcon status={step.status} />
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function buildProcessingTimeline(
  phase: "idle" | "processing" | "complete",
  activeIndex = 0
): ProcessingTimelineStep[] {
  const labels = [
    "OCR Extraction",
    "Invoice Parsing",
    "HS Classification Detection",
    "Origin Analysis",
    "Compliance Review",
  ] as const;

  return labels.map((label, i) => {
    if (phase === "complete") {
      return { label, status: "complete" as const };
    }
    if (phase === "idle") {
      return { label, status: "pending" as const };
    }
    if (i < activeIndex) return { label, status: "complete" as const };
    if (i === activeIndex) return { label, status: "active" as const };
    return { label, status: "pending" as const };
  });
}

/** Map upload progress step id to timeline active index */
export function timelineIndexFromProgress(stepId: string): number {
  switch (stepId) {
    case "upload":
    case "ocr":
      return 0;
    case "analysis":
      return 2;
    case "report":
      return 4;
    case "complete":
      return 5;
    default:
      return 0;
  }
}
