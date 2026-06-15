/**
 * Localhost / development plan simulator — NEVER enabled on Vercel production.
 */

import {
  PLAN_SIMULATOR_STORAGE_KEY,
  PRODUCTION_DEFAULT_PLAN,
  type PlanTier,
} from "@/config/plan-access-matrix";

const VALID_PLANS: PlanTier[] = ["FREE", "PRO", "ENTERPRISE", "ADMIN"];

function isVercelDeployment(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * Plan switcher is available only in local development (never on Vercel).
 * NEXT_PUBLIC_ADMIN_MODE alone does not enable the switcher on hosted builds.
 */
export function isPlanSimulatorEnabled(): boolean {
  if (isVercelDeployment()) return false;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NODE_ENV === "development";
}

/** Effective plan for feature gating — replace body with subscription lookup when billing ships. */
export function resolveEffectivePlan(simulatedPlan: PlanTier | null): PlanTier {
  if (isPlanSimulatorEnabled() && simulatedPlan && VALID_PLANS.includes(simulatedPlan)) {
    return simulatedPlan;
  }
  // Future: return user.subscription.plan ?? PRODUCTION_DEFAULT_PLAN;
  return PRODUCTION_DEFAULT_PLAN;
}

export function readSimulatedPlanFromStorage(): PlanTier | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAN_SIMULATOR_STORAGE_KEY);
    if (raw && VALID_PLANS.includes(raw as PlanTier)) {
      return raw as PlanTier;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeSimulatedPlanToStorage(plan: PlanTier): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAN_SIMULATOR_STORAGE_KEY, plan);
  } catch {
    /* ignore */
  }
}

export function clearSimulatedPlanStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLAN_SIMULATOR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
