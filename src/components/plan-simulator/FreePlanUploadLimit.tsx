"use client";

import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";

const FREE_DAILY_UPLOAD_LIMIT = 3;
const UPLOAD_COUNT_KEY = "exportgateway_free_upload_count";
const UPLOAD_DAY_KEY = "exportgateway_free_upload_day";

function readUploadCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const storedDay = window.localStorage.getItem(UPLOAD_DAY_KEY);
    if (storedDay !== today) return 0;
    return Number(window.localStorage.getItem(UPLOAD_COUNT_KEY) ?? "0");
  } catch {
    return 0;
  }
}

/** UI-only upload limit simulation for Free plan (localhost dev). */
export function recordFreePlanUploadSimulation(): void {
  if (typeof window === "undefined") return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const storedDay = window.localStorage.getItem(UPLOAD_DAY_KEY);
    const count =
      storedDay === today ? Number(window.localStorage.getItem(UPLOAD_COUNT_KEY) ?? "0") : 0;
    window.localStorage.setItem(UPLOAD_DAY_KEY, today);
    window.localStorage.setItem(UPLOAD_COUNT_KEY, String(count + 1));
  } catch {
    /* ignore */
  }
}

export function isFreePlanUploadBlocked(): boolean {
  return readUploadCount() >= FREE_DAILY_UPLOAD_LIMIT;
}

export function FreePlanUploadLimitNotice() {
  const { hasFeature, effectivePlan } = usePlanAccess();
  if (!hasFeature("uploadLimitSimulation") || effectivePlan !== "FREE") return null;

  const used = readUploadCount();
  const remaining = Math.max(0, FREE_DAILY_UPLOAD_LIMIT - used);

  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Free plan simulation: {remaining} of {FREE_DAILY_UPLOAD_LIMIT} uploads remaining today
      (UI only — not enforced on production).
    </p>
  );
}
