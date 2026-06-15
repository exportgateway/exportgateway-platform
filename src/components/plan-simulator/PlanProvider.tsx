"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  hasPlanFeature,
  PRODUCTION_DEFAULT_PLAN,
  type PlanFeature,
  type PlanTier,
} from "@/config/plan-access-matrix";
import {
  isPlanSimulatorEnabled,
  readSimulatedPlanFromStorage,
  resolveEffectivePlan,
  writeSimulatedPlanToStorage,
} from "@/config/plan-simulator";

interface PlanContextValue {
  simulatorEnabled: boolean;
  simulatedPlan: PlanTier | null;
  effectivePlan: PlanTier;
  setSimulatedPlan: (plan: PlanTier) => void;
  hasFeature: (feature: PlanFeature) => boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const simulatorEnabled = isPlanSimulatorEnabled();
  const [simulatedPlan, setSimulatedPlanState] = useState<PlanTier | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (simulatorEnabled) {
      setSimulatedPlanState(readSimulatedPlanFromStorage());
    }
    setHydrated(true);
  }, [simulatorEnabled]);

  const setSimulatedPlan = useCallback(
    (plan: PlanTier) => {
      if (!simulatorEnabled) return;
      writeSimulatedPlanToStorage(plan);
      setSimulatedPlanState(plan);
    },
    [simulatorEnabled]
  );

  const effectivePlan = useMemo(() => {
    if (!hydrated) return PRODUCTION_DEFAULT_PLAN;
    return resolveEffectivePlan(simulatedPlan);
  }, [hydrated, simulatedPlan]);

  const hasFeature = useCallback(
    (feature: PlanFeature) => hasPlanFeature(effectivePlan, feature),
    [effectivePlan]
  );

  const value = useMemo<PlanContextValue>(
    () => ({
      simulatorEnabled,
      simulatedPlan,
      effectivePlan,
      setSimulatedPlan,
      hasFeature,
    }),
    [simulatorEnabled, simulatedPlan, effectivePlan, setSimulatedPlan, hasFeature]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlanAccess(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    return {
      simulatorEnabled: false,
      simulatedPlan: null,
      effectivePlan: PRODUCTION_DEFAULT_PLAN,
      setSimulatedPlan: () => undefined,
      hasFeature: (feature) => hasPlanFeature(PRODUCTION_DEFAULT_PLAN, feature),
    };
  }
  return ctx;
}

export function PlanFeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: PlanFeature;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasFeature } = usePlanAccess();
  if (!hasFeature(feature)) return <>{fallback}</>;
  return <>{children}</>;
}
