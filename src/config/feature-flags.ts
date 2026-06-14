/**
 * Admin / developer tooling flags — driven solely by NEXT_PUBLIC_ADMIN_MODE.
 * Independent of NEXT_PUBLIC_PRELAUNCH (prelaunch only affects SEO/robots).
 */
export const FEATURE_FLAGS = {
  adminMode: process.env.NEXT_PUBLIC_ADMIN_MODE === "true",

  validationPdfExport: process.env.NEXT_PUBLIC_ADMIN_MODE === "true",

  goldenDatasetTools: process.env.NEXT_PUBLIC_ADMIN_MODE === "true",

  forensicDiagnostics: process.env.NEXT_PUBLIC_ADMIN_MODE === "true",

  ocrDebugPanels: process.env.NEXT_PUBLIC_ADMIN_MODE === "true",

  extractionTraceLogs: process.env.NEXT_PUBLIC_ADMIN_MODE === "true",

  testUtilities: process.env.NEXT_PUBLIC_ADMIN_MODE === "true",
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isAdminMode(): boolean {
  return FEATURE_FLAGS.adminMode;
}

export function formatFeatureFlagState(enabled: boolean): "ENABLED" | "DISABLED" {
  return enabled ? "ENABLED" : "DISABLED";
}
