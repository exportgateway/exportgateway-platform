import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  "Checking AES history…",
  "Checking knowledge base…",
  "Analyzing description…",
  "Researching product…",
] as const;

interface ClassificationLoadingStagesProps {
  activeStage: number;
  isPending: boolean;
  showWebStage: boolean;
}

export function ClassificationLoadingStages({
  activeStage,
  isPending,
  showWebStage,
}: ClassificationLoadingStagesProps) {
  return (
    <section
      className="mt-4 rounded-2xl border border-surface-border bg-white p-5 sm:p-6"
      aria-live="polite"
      aria-busy="true"
      data-testid="classification-loading"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Classification in progress</p>
      <ul className="mt-4 space-y-3">
        {STAGES.map((label, index) => {
          if (index === 3 && !showWebStage && activeStage < 3) return null;
          const done = index < activeStage || (index === activeStage && !isPending);
          const active = index === activeStage && isPending;

          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              ) : active ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" aria-hidden />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
              )}
              <span
                className={cn(
                  done && "font-medium text-emerald-800",
                  active && "font-semibold text-brand-800",
                  !done && !active && "text-slate-400"
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
