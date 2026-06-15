"use client";

import { ClassificationWizard } from "@/components/platform/classification/ClassificationWizard";
import { PlanFeatureGate } from "@/components/plan-simulator/PlanProvider";
import { PlanUpgradeNotice } from "@/components/plan-simulator/PlanUpgradeNotice";

export function PlatformWizardTool() {
  return (
    <PlanFeatureGate
      feature="customsWizard"
      fallback={<PlanUpgradeNotice feature="customsWizard" requiredPlan="PRO" />}
    >
      <div
        className="rounded-2xl border border-surface-border bg-white p-4 shadow-sm sm:p-6 lg:p-8"
        data-screenshot="customs-wizard"
        data-wizard-mode="native"
      >
        <ClassificationWizard />
      </div>
    </PlanFeatureGate>
  );
}
