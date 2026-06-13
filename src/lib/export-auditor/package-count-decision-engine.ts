/**
 * Package Count Decision Engine — declaration package count/type from Colli and Pallets.
 * When both exist, pallet count is used for declaration; Colli preserved as supporting data.
 */

export type DeclarationPackageType = "PAL" | "COLLI" | "CT";

export const MANUAL_REVIEW_REQUIRED = "MANUAL REVIEW REQUIRED";

export const PACKAGE_HIERARCHY_VERIFICATION_NOTE =
  "Both Colli and Pallets detected. Pallet count used for customs declaration package count. Colli shown as supporting information — verify package hierarchy manually.";

export type DeclarationPackageCount = number | typeof MANUAL_REVIEW_REQUIRED;

export interface PackageCountDecisionInput {
  colliCount: number | null;
  palletCount: number | null;
  /** Shipment package type from extraction — CT (cartons) uses carton count for declaration even with pallets. */
  packageType?: string | null;
}

export interface PackageCountDecision {
  colliCount: number | null;
  palletCount: number | null;
  declarationPackageCount: DeclarationPackageCount | null;
  declarationPackageType: DeclarationPackageType | null;
  requiresManualReview: boolean;
  packageVerificationNote: string | null;
}

/** Evaluate customs declaration package count and type from shipment footer metrics. */
export function evaluatePackageCountDecision(
  input: PackageCountDecisionInput
): PackageCountDecision {
  const colliCount =
    input.colliCount != null && input.colliCount >= 0 ? input.colliCount : null;
  const palletCount =
    input.palletCount != null && input.palletCount >= 0 ? input.palletCount : null;

  const hasColli = colliCount != null && colliCount > 0;
  const hasPallets = palletCount != null && palletCount > 0;

  const packageType = input.packageType?.trim().toUpperCase() ?? null;

  if (hasColli && hasPallets) {
    if (packageType === "CT") {
      return {
        colliCount,
        palletCount,
        declarationPackageCount: colliCount,
        declarationPackageType: "CT",
        requiresManualReview: false,
        packageVerificationNote: `${colliCount} cartons on ${palletCount} pallet(s)`,
      };
    }
    return {
      colliCount,
      palletCount,
      declarationPackageCount: palletCount,
      declarationPackageType: "PAL",
      requiresManualReview: true,
      packageVerificationNote: PACKAGE_HIERARCHY_VERIFICATION_NOTE,
    };
  }

  if (hasPallets) {
    return {
      colliCount: null,
      palletCount,
      declarationPackageCount: palletCount,
      declarationPackageType: "PAL",
      requiresManualReview: false,
      packageVerificationNote: null,
    };
  }

  if (hasColli) {
    const declarationType: DeclarationPackageType =
      packageType === "CT" ? "CT" : "COLLI";
    return {
      colliCount,
      palletCount,
      declarationPackageCount: colliCount,
      declarationPackageType: declarationType,
      requiresManualReview: false,
      packageVerificationNote: null,
    };
  }

  return {
    colliCount: null,
    palletCount: null,
    declarationPackageCount: null,
    declarationPackageType: null,
    requiresManualReview: false,
    packageVerificationNote: null,
  };
}

export function formatDeclarationPackageCount(
  count: DeclarationPackageCount | null | undefined
): string {
  if (count == null) return "—";
  if (count === MANUAL_REVIEW_REQUIRED) return MANUAL_REVIEW_REQUIRED;
  return String(count);
}
