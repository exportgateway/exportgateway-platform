"use client";

import type { ReactNode } from "react";
import { PlanFeatureGate } from "@/components/plan-simulator/PlanProvider";
import { PlanUpgradeNotice } from "@/components/plan-simulator/PlanUpgradeNotice";
import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";
import { PLAN_TIER_LABELS } from "@/config/plan-access-matrix";

export function IntrastatPlanAccess() {
  const { hasFeature, effectivePlan, simulatorEnabled } = usePlanAccess();

  if (!simulatorEnabled) return null;

  if (hasFeature("intrastatTools")) {
    return (
      <p className="mb-6 text-center text-xs font-medium text-emerald-700">
        Plan simulator: {PLAN_TIER_LABELS[effectivePlan]} — Intrastat AI Auditor included
      </p>
    );
  }

  return (
    <div className="mb-8 max-w-lg mx-auto">
      <PlanUpgradeNotice feature="intrastatTools" requiredPlan="ENTERPRISE" />
    </div>
  );
}

/** Gates future Intrastat tool UI when embedded on platform. */
export function IntrastatToolGate({ children }: { children: React.ReactNode }) {
  return (
    <PlanFeatureGate
      feature="intrastatTools"
      fallback={<PlanUpgradeNotice feature="intrastatTools" requiredPlan="ENTERPRISE" />}
    >
      {children}
    </PlanFeatureGate>
  );
}
