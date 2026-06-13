import type { RecommendedAction } from "@/lib/export-auditor/types";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface RecommendedActionsSectionProps {
  actions: RecommendedAction[];
}

const priorityStyles = {
  high: "border-red-200 bg-red-50/50",
  medium: "border-amber-200 bg-amber-50/50",
  low: "border-surface-border bg-slate-50/50",
};

export function RecommendedActionsSection({ actions }: RecommendedActionsSectionProps) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        Recommended Actions
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => (
          <div
            key={action.id}
            className={cn(
              "rounded-xl border p-4 card-hover",
              priorityStyles[action.priority]
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{action.title}</p>
              <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {action.priority}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{action.description}</p>
            <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
              Review
              <ArrowRight className="h-3 w-3" aria-hidden />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
