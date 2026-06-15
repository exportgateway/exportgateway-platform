import { Check, Minus, X } from "lucide-react";
import type { SourceBreakdown } from "@/lib/wizard-types";
import { cn } from "@/lib/utils";

interface SourcesCardProps {
  breakdown: SourceBreakdown | null;
}

export function SourcesCard({ breakdown }: SourcesCardProps) {
  if (!breakdown) {
    return (
      <article
        className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        data-testid="sources-card"
      >
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Classification Sources
        </h2>
        <p className="mt-3 text-sm text-slate-500">—</p>
      </article>
    );
  }

  const rows: Array<{ label: string; used: boolean; notRequired: boolean }> = [
    { label: "AES Historical Database", used: breakdown.aes_historical, notRequired: false },
    { label: "Knowledge Base", used: breakdown.knowledge_base, notRequired: false },
    { label: "AI Analysis", used: breakdown.ai_classification, notRequired: false },
    {
      label: "Web Research",
      used: breakdown.web_research,
      notRequired: !breakdown.web_research_required,
    },
  ];

  return (
    <article
      className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
      data-testid="sources-card"
    >
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Classification Sources
      </h2>
      <ul className="mt-4 space-y-2.5">
        {rows.map(({ label, used, notRequired }) => (
          <li
            key={label}
            className={cn(
              "flex items-start gap-2.5 text-sm",
              used ? "font-medium text-emerald-800" : notRequired ? "text-slate-400" : "text-slate-500"
            )}
          >
            {used ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            ) : notRequired ? (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            ) : (
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
            )}
            <span>
              {label}
              {!used && notRequired ? (
                <span className="ml-1 font-normal text-slate-400">Not required</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
