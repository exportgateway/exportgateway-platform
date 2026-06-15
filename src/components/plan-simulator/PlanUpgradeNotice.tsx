"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { PLAN_TIER_LABELS, type PlanFeature } from "@/config/plan-access-matrix";
import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";

const FEATURE_LABELS: Partial<Record<PlanFeature, string>> = {
  customsWizard: "Classification Wizard",
  freightCalculator: "Freight Calculator",
  intrastatTools: "Intrastat AI Auditor",
  exportDeclarationExcel: "Declaration Excel Export",
  exportDeclarationCsv: "Declaration CSV Export",
  exportMrnDraft: "MRN Draft Export",
};

interface PlanUpgradeNoticeProps {
  feature: PlanFeature;
  requiredPlan?: "PRO" | "ENTERPRISE";
}

export function PlanUpgradeNotice({ feature, requiredPlan = "PRO" }: PlanUpgradeNoticeProps) {
  const { effectivePlan } = usePlanAccess();
  const label = FEATURE_LABELS[feature] ?? feature;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
      <Lock className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
      <p className="mt-3 text-base font-semibold text-slate-900">{label} not included</p>
      <p className="mt-2 text-sm text-slate-600">
        Your simulated plan ({PLAN_TIER_LABELS[effectivePlan]}) does not include this feature.
        Upgrade to {PLAN_TIER_LABELS[requiredPlan]} or higher on the pricing page.
      </p>
      <Link
        href="/pricing"
        className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline"
      >
        View pricing plans
      </Link>
    </div>
  );
}
