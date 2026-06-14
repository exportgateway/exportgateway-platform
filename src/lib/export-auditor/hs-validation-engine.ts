/**
 * HS validation engine — format check, OCR repair, nomenclature existence, confidence.
 */

import {
  normalizeAndValidateHsToken,
  stripHsSeparators,
  type HsNormalizationResult,
} from "@/lib/export-auditor/hs-code-normalize";
import {
  isKnownHsNomenclatureCode,
  lookupHsInNomenclature,
  type NomenclatureMatchLevel,
} from "@/lib/export-auditor/hs-nomenclature-dataset";
import type { HsStatus } from "@/lib/export-auditor/types";

export const INVALID_HS_FORMAT = "INVALID_HS_FORMAT";
export const UNKNOWN_HS_CODE = "UNKNOWN_HS_CODE";

export const INVALID_HS_FORMAT_MESSAGE =
  "HS code format is invalid and could not be repaired from OCR";

export const UNKNOWN_HS_CODE_MESSAGE =
  "HS code format is valid but was not found in the local nomenclature index";

export type HsValidationSource =
  | "local_nomenclature"
  | "ocr_repair"
  | "format_check"
  | "none";

export interface HsValidationResult {
  invoiceHs: string | null;
  normalizedHs: string | null;
  hsStatus: HsStatus;
  repairApplied: boolean;
  validationSource: HsValidationSource;
  hsConfidence: number;
  nomenclatureMatch: NomenclatureMatchLevel;
}

export const HS_STATUS_CONFIDENCE: Record<HsStatus, number> = {
  VALID: 100,
  REPAIRED: 95,
  UNKNOWN_HS: 60,
  INVALID_FORMAT: 0,
  MISSING: 0,
};

const STATUS_RANK: Record<HsStatus, number> = {
  INVALID_FORMAT: 5,
  UNKNOWN_HS: 4,
  MISSING: 3,
  REPAIRED: 2,
  VALID: 1,
};

export function compareHsStatusSeverity(a: HsStatus, b: HsStatus): number {
  return STATUS_RANK[b] - STATUS_RANK[a];
}

export function worstHsStatus(statuses: HsStatus[]): HsStatus {
  if (statuses.length === 0) return "MISSING";
  return statuses.reduce((worst, status) =>
    compareHsStatusSeverity(status, worst) > 0 ? status : worst
  );
}

export function hsConfidenceForStatus(status: HsStatus): number {
  return HS_STATUS_CONFIDENCE[status];
}

function resolveValidationSource(
  normalization: HsNormalizationResult,
  known: boolean
): HsValidationSource {
  if (known) return "local_nomenclature";
  if (normalization.repaired) return "ocr_repair";
  if (normalization.normalized) return "format_check";
  return "none";
}

/** Full HS validation pipeline for a raw invoice token. */
export function validateHsCode(raw: string | null | undefined): HsValidationResult {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return {
      invoiceHs: null,
      normalizedHs: null,
      hsStatus: "MISSING",
      repairApplied: false,
      validationSource: "none",
      hsConfidence: 0,
      nomenclatureMatch: "none",
    };
  }

  const normalization = normalizeAndValidateHsToken(trimmed);
  if (normalization.invalid) {
    return {
      invoiceHs: trimmed,
      normalizedHs: null,
      hsStatus: "INVALID_FORMAT",
      repairApplied: false,
      validationSource: "format_check",
      hsConfidence: 0,
      nomenclatureMatch: "none",
    };
  }

  if (!normalization.normalized) {
    return {
      invoiceHs: trimmed,
      normalizedHs: null,
      hsStatus: "MISSING",
      repairApplied: false,
      validationSource: "none",
      hsConfidence: 0,
      nomenclatureMatch: "none",
    };
  }

  const nomenclature = lookupHsInNomenclature(normalization.normalized);
  if (!nomenclature.known) {
    return {
      invoiceHs: trimmed,
      normalizedHs: normalization.normalized,
      hsStatus: "UNKNOWN_HS",
      repairApplied: normalization.repaired,
      validationSource: resolveValidationSource(normalization, false),
      hsConfidence: HS_STATUS_CONFIDENCE.UNKNOWN_HS,
      nomenclatureMatch: "none",
    };
  }

  const hsStatus: HsStatus = normalization.repaired ? "REPAIRED" : "VALID";
  return {
    invoiceHs: trimmed,
    normalizedHs: normalization.normalized,
    hsStatus,
    repairApplied: normalization.repaired,
    validationSource: "local_nomenclature",
    hsConfidence: HS_STATUS_CONFIDENCE[hsStatus],
    nomenclatureMatch: nomenclature.matchLevel,
  };
}

/** True when the normalized code can be used for aggregation (excludes invalid/missing). */
export function isAggregationEligibleHsStatus(status: HsStatus): boolean {
  return status === "VALID" || status === "REPAIRED" || status === "UNKNOWN_HS";
}

export function isInvalidHsFormatStatus(status: HsStatus): boolean {
  return status === "INVALID_FORMAT";
}

export function isUnknownHsStatus(status: HsStatus): boolean {
  return status === "UNKNOWN_HS";
}

/** Quick format + nomenclature check on an already-normalized code. */
export function validateNormalizedHsCode(code: string): HsValidationResult {
  return validateHsCode(code);
}

export function formatHsValidationSource(source: HsValidationSource): string {
  switch (source) {
    case "local_nomenclature":
      return "Local nomenclature";
    case "ocr_repair":
      return "OCR repair";
    case "format_check":
      return "Format check";
    default:
      return "—";
  }
}

/** @deprecated Use validateHsCode — retained for callers expecting normalize-only behaviour. */
export function isKnownHsAfterNormalization(code: string | null | undefined): boolean {
  const normalized = normalizeAndValidateHsToken(code).normalized;
  return normalized != null && isKnownHsNomenclatureCode(normalized);
}

export { stripHsSeparators };
