/**
 * Plan access matrix — single source of truth for feature visibility by subscription tier.
 * Replace `getEffectivePlan()` subscription stub with `user.subscription.plan` when billing ships.
 */

export type PlanTier = "FREE" | "PRO" | "ENTERPRISE" | "ADMIN";

export type PlanFeature =
  | "executiveSummary"
  | "customsReadiness"
  | "declarationPreparation"
  | "hsOriginSummary"
  | "findings"
  | "documentSummary"
  | "exportDeclarationExcel"
  | "exportDeclarationCsv"
  | "exportMrnDraft"
  | "originAnalysis"
  | "hsVerification"
  | "hsAggregation"
  | "hsAggregationTraceability"
  | "positionReconciliation"
  | "positionLock"
  | "ocrDiagnostics"
  | "extractionSources"
  | "confidenceEngine"
  | "recoveryDiagnostics"
  | "auditTraceability"
  | "integrityValidation"
  | "forensicTables"
  | "positionTraceability"
  | "ocrRecoveryDetails"
  | "forensicTab"
  | "validationPdf"
  | "launchReadiness"
  | "internalMetrics"
  | "batchProcessing"
  | "shipmentTools"
  | "freightCalculator"
  | "intrastatTools"
  | "enterpriseTools"
  | "auditReportPdf"
  | "quickActions"
  | "declarationReadiness"
  | "uploadLimitSimulation"
  | "customsWizard";

const ALL_FALSE = Object.fromEntries(
  (
    [
      "executiveSummary",
      "customsReadiness",
      "declarationPreparation",
      "hsOriginSummary",
      "findings",
      "documentSummary",
      "exportDeclarationExcel",
      "exportDeclarationCsv",
      "exportMrnDraft",
      "originAnalysis",
      "hsVerification",
      "hsAggregation",
      "hsAggregationTraceability",
      "positionReconciliation",
      "positionLock",
      "ocrDiagnostics",
      "extractionSources",
      "confidenceEngine",
      "recoveryDiagnostics",
      "auditTraceability",
      "integrityValidation",
      "forensicTables",
      "positionTraceability",
      "ocrRecoveryDetails",
      "forensicTab",
      "validationPdf",
      "launchReadiness",
      "internalMetrics",
      "batchProcessing",
      "shipmentTools",
      "freightCalculator",
      "intrastatTools",
      "enterpriseTools",
      "auditReportPdf",
      "quickActions",
      "declarationReadiness",
      "uploadLimitSimulation",
      "customsWizard",
    ] as PlanFeature[]
  ).map((key) => [key, false])
) as Record<PlanFeature, boolean>;

function tier(features: Partial<Record<PlanFeature, boolean>>): Record<PlanFeature, boolean> {
  return { ...ALL_FALSE, ...features };
}

/** Feature visibility by plan — billing-ready; UI reads via `hasPlanFeature()`. */
export const PLAN_ACCESS_MATRIX: Record<PlanTier, Record<PlanFeature, boolean>> = {
  FREE: tier({
    executiveSummary: true,
    customsReadiness: true,
    findings: true,
    documentSummary: true,
    uploadLimitSimulation: true,
    customsWizard: true,
    freightCalculator: true,
  }),

  PRO: tier({
    executiveSummary: true,
    customsReadiness: true,
    declarationPreparation: true,
    hsOriginSummary: true,
    findings: true,
    documentSummary: true,
    exportDeclarationExcel: true,
    exportDeclarationCsv: true,
    originAnalysis: true,
    declarationReadiness: true,
    hsAggregation: true,
    customsWizard: true,
    freightCalculator: true,
    batchProcessing: true,
  }),

  ENTERPRISE: tier({
    executiveSummary: true,
    customsReadiness: true,
    declarationPreparation: true,
    hsOriginSummary: true,
    findings: true,
    documentSummary: true,
    exportDeclarationExcel: true,
    exportDeclarationCsv: true,
    exportMrnDraft: true,
    originAnalysis: true,
    declarationReadiness: true,
    hsAggregation: true,
    hsVerification: true,
    batchProcessing: true,
    shipmentTools: true,
    freightCalculator: true,
    intrastatTools: true,
    enterpriseTools: true,
    customsWizard: true,
  }),

  ADMIN: tier({
    executiveSummary: true,
    customsReadiness: true,
    declarationPreparation: true,
    hsOriginSummary: true,
    findings: true,
    documentSummary: true,
    exportDeclarationExcel: true,
    exportDeclarationCsv: true,
    exportMrnDraft: true,
    originAnalysis: true,
    declarationReadiness: true,
    hsAggregation: true,
    hsVerification: true,
    hsAggregationTraceability: true,
    positionReconciliation: true,
    positionLock: true,
    ocrDiagnostics: true,
    extractionSources: true,
    confidenceEngine: true,
    recoveryDiagnostics: true,
    auditTraceability: true,
    integrityValidation: true,
    forensicTables: true,
    positionTraceability: true,
    ocrRecoveryDetails: true,
    forensicTab: true,
    validationPdf: true,
    launchReadiness: true,
    internalMetrics: true,
    batchProcessing: true,
    shipmentTools: true,
    freightCalculator: true,
    intrastatTools: true,
    enterpriseTools: true,
    auditReportPdf: true,
    quickActions: true,
    customsWizard: true,
  }),
};

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  FREE: "Free",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
  ADMIN: "Admin",
};

export const PLAN_SIMULATOR_STORAGE_KEY = "exportgateway_plan_simulator";

/** Production default — matches current broker prelaunch behaviour (enterprise minus admin). */
export const PRODUCTION_DEFAULT_PLAN: PlanTier = "ENTERPRISE";

export function hasPlanFeature(plan: PlanTier, feature: PlanFeature): boolean {
  return PLAN_ACCESS_MATRIX[plan][feature] === true;
}
