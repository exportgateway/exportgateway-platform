import type { UsageResponse } from "@/lib/wizard-types";

interface UsageBarProps {
  usage: UsageResponse | null;
}

/** Plan usage — professional, non-marketing snapshot. */
export function UsageBar({ usage }: UsageBarProps) {
  if (!usage) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-surface-border bg-white px-4 py-3 text-sm shadow-sm"
      role="status"
      data-testid="classification-usage-bar"
    >
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan</span>
        <p className="font-semibold text-slate-900">{usage.plan}</p>
      </div>
      <div className="h-8 w-px bg-surface-border hidden sm:block" aria-hidden />
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Classifications</span>
        <p className="font-medium text-slate-800">
          <span className="font-semibold text-slate-900">{usage.classifications_remaining}</span>
          <span className="text-slate-500"> remaining</span>
          <span className="hidden text-slate-400 sm:inline">
            {" "}
            · {usage.classifications_used}/{usage.classifications_limit} used
          </span>
        </p>
      </div>
      <div className="h-8 w-px bg-surface-border hidden sm:block" aria-hidden />
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Research credits
        </span>
        <p className="font-medium text-slate-800">
          <span className="font-semibold text-slate-900">{usage.research_remaining}</span>
          <span className="text-slate-500"> remaining</span>
        </p>
      </div>
    </div>
  );
}
