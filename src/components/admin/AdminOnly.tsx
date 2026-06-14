import type { ReactNode } from "react";
import { FEATURE_FLAGS } from "@/config/feature-flags";

interface AdminOnlyProps {
  children: ReactNode;
  /** Optional flag key — defaults to adminMode. */
  flag?: keyof typeof FEATURE_FLAGS;
}

export function AdminOnly({ children, flag = "adminMode" }: AdminOnlyProps) {
  if (!FEATURE_FLAGS[flag]) {
    return null;
  }
  return <>{children}</>;
}
