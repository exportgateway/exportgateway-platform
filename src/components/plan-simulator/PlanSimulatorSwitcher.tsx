"use client";

import { cn } from "@/lib/utils";
import {
  PLAN_TIER_LABELS,
  type PlanTier,
} from "@/config/plan-access-matrix";
import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";

const SIMULATOR_PLANS: PlanTier[] = ["ADMIN", "FREE", "PRO", "ENTERPRISE"];

export function PlanSimulatorSwitcher() {
  const { simulatorEnabled, simulatedPlan, effectivePlan, setSimulatedPlan } = usePlanAccess();

  if (!simulatorEnabled) return null;

  const active = simulatedPlan ?? effectivePlan;

  return (
    <div
      className="fixed top-4 right-4 z-[100] rounded-xl border border-violet-200 bg-violet-50/95 px-3 py-2 shadow-lg backdrop-blur-sm"
      role="region"
      aria-label="Plan simulator (development only)"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
        Current View
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {SIMULATOR_PLANS.map((plan) => (
          <button
            key={plan}
            type="button"
            onClick={() => setSimulatedPlan(plan)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold transition-colors",
              active === plan
                ? "bg-violet-700 text-white"
                : "bg-white text-violet-800 hover:bg-violet-100"
            )}
            aria-pressed={active === plan}
          >
            {PLAN_TIER_LABELS[plan]}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[9px] text-violet-600">all platform tools</p>
    </div>
  );
}
