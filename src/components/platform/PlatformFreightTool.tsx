"use client";

import { FreightCalculatorForm } from "@/components/platform/FreightCalculatorForm";
import { PlanFeatureGate } from "@/components/plan-simulator/PlanProvider";
import { PlanUpgradeNotice } from "@/components/plan-simulator/PlanUpgradeNotice";

export function PlatformFreightTool() {
  return (
    <PlanFeatureGate
      feature="freightCalculator"
      fallback={<PlanUpgradeNotice feature="freightCalculator" requiredPlan="PRO" />}
    >
      <FreightCalculatorForm />
    </PlanFeatureGate>
  );
}
