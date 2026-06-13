"use client";

import { cn } from "@/lib/utils";

export type AuditorResultTab = "overview" | "issues" | "classification" | "enterprise" | "report";

const TABS: { id: AuditorResultTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "issues", label: "Issues" },
  { id: "classification", label: "Classification" },
  { id: "enterprise", label: "Enterprise" },
  { id: "report", label: "Report" },
];

interface ExportAuditorTabsProps {
  active: AuditorResultTab;
  onChange: (tab: AuditorResultTab) => void;
  issueCount?: number;
}

export function ExportAuditorTabs({
  active,
  onChange,
  issueCount = 0,
}: ExportAuditorTabsProps) {
  return (
    <div className="border-b border-surface-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Audit results">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
              active === tab.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            )}
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
            {tab.id === "issues" && issueCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                {issueCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
