"use client";

import type { ReactNode } from "react";
import { PlanProvider } from "@/components/plan-simulator/PlanProvider";
import { PlanSimulatorSwitcher } from "@/components/plan-simulator/PlanSimulatorSwitcher";

/** Wraps platform tools with shared plan context + localhost plan switcher. */
export function PlatformPlanShell({ children }: { children: ReactNode }) {
  return (
    <PlanProvider>
      <PlanSimulatorSwitcher />
      {children}
    </PlanProvider>
  );
}
