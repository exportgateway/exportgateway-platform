"use client";

import { cn } from "@/lib/utils";
import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";
import type { PlanFeature } from "@/config/plan-access-matrix";

export type AuditorResultTab =
  | "summary"
  | "declaration"
  | "origin"
  | "document"
  | "forensic";

const TAB_DEFINITIONS: { id: AuditorResultTab; label: string; feature: PlanFeature }[] = [
  { id: "summary", label: "Summary", feature: "executiveSummary" },
  { id: "declaration", label: "Declaration", feature: "declarationPreparation" },
  { id: "origin", label: "Origin", feature: "originAnalysis" },
  { id: "document", label: "Document", feature: "documentSummary" },
  { id: "forensic", label: "Forensic", feature: "forensicTab" },
];

export function getVisibleAuditorTabs(
  hasFeature: (feature: PlanFeature) => boolean
): AuditorResultTab[] {
  return TAB_DEFINITIONS.filter((tab) => hasFeature(tab.feature)).map((tab) => tab.id);
}

export function isAuditorTabVisible(
  tab: AuditorResultTab,
  hasFeature: (feature: PlanFeature) => boolean
): boolean {
  const definition = TAB_DEFINITIONS.find((entry) => entry.id === tab);
  return definition ? hasFeature(definition.feature) : false;
}

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
  const { hasFeature } = usePlanAccess();
  const tabs = TAB_DEFINITIONS.filter((tab) => hasFeature(tab.feature));

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-surface-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Audit results">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              active === tab.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            )}
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
            {tab.id === "summary" && issueCount > 0 && (
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
