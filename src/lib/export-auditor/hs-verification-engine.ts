/**
 * HS Verification Engine — compares invoice HS codes against Wizard classification.
 * Verification and risk detection only — never modifies invoice or final HS codes.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { filterGoodsLines, normalizeAggregationItems } from "@/lib/export-auditor/hs-aggregation-engine";
import { resolveInvoiceHsCodeForItem } from "@/lib/export-auditor/hs-classification-workflow";
import { normalizeHsToken } from "@/lib/export-auditor/hs-code-normalize";
import {
  HS_VERIFICATION_CONFIDENCE_THRESHOLD,
  HS_VERIFICATION_SIMILARITY_THRESHOLD,
} from "@/lib/export-auditor/hs-verification-config";
import type {
  HsAggregationRow,
  HsVerificationResult,
  HsVerificationStatus,
  HsVerificationSummary,
  PositionTraceabilityLine,
} from "@/lib/export-auditor/types";

function resolvePositionNumber(item: ApiInvoiceItem, index: number): number {
  const extended = item as ApiInvoiceItem & { position_number?: number | null };
  return typeof extended.position_number === "number" && extended.position_number > 0
    ? extended.position_number
    : index + 1;
}

function resolveWizardHsCode(item: ApiInvoiceItem): string | null {
  const extended = item as ApiInvoiceItem & { wizard_hs_code?: string | null };
  return normalizeHsToken(extended.wizard_hs_code);
}

function resolveWizardConfidence(item: ApiInvoiceItem): number | null {
  const extended = item as ApiInvoiceItem & { wizard_confidence?: number | null };
  const value = extended.wizard_confidence;
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function resolveSimilarityScore(item: ApiInvoiceItem): number | null {
  const extended = item as ApiInvoiceItem & { similarity_score?: number | null };
  const value = extended.similarity_score;
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

/** Prefix-based HS similarity when wizard does not supply a score. */
export function computeHsSimilarity(invoiceHs: string, wizardHs: string): number {
  if (invoiceHs === wizardHs) return 100;
  let match = 0;
  const len = Math.min(invoiceHs.length, wizardHs.length);
  for (let i = 0; i < len; i++) {
    if (invoiceHs[i] === wizardHs[i]) match++;
    else break;
  }
  return Math.round((match / Math.max(invoiceHs.length, wizardHs.length, 1)) * 100);
}

function hsChapter(code: string): string {
  return code.slice(0, 2);
}

function hsSubheading(code: string): string {
  return code.slice(0, Math.min(6, code.length));
}

function sameChapterOrSubheading(a: string, b: string): boolean {
  return hsChapter(a) === hsChapter(b) || hsSubheading(a) === hsSubheading(b);
}

export function evaluateLineHsVerification(
  item: ApiInvoiceItem,
  positionNumber: number,
  options?: {
    confidenceThreshold?: number;
    similarityThreshold?: number;
  }
): HsVerificationResult {
  const confidenceThreshold = options?.confidenceThreshold ?? HS_VERIFICATION_CONFIDENCE_THRESHOLD;
  const similarityThreshold = options?.similarityThreshold ?? HS_VERIFICATION_SIMILARITY_THRESHOLD;

  const invoiceHsCode = resolveInvoiceHsCodeForItem(item);
  const wizardHsCode = resolveWizardHsCode(item);
  const wizardConfidence = resolveWizardConfidence(item);
  const explicitSimilarity = resolveSimilarityScore(item);

  const base = {
    positionNumber,
    invoiceHsCode,
    wizardHsCode,
    wizardConfidence,
    similarityScore: explicitSimilarity,
  };

  if (!invoiceHsCode && !wizardHsCode) {
    return {
      ...base,
      verificationStatus: "MISSING",
      verificationReason: "No invoice HS and wizard classification not available.",
    };
  }

  if (!invoiceHsCode && wizardHsCode) {
    const confidenceLabel =
      wizardConfidence != null ? `${wizardConfidence}% wizard confidence` : "wizard classification available";
    return {
      ...base,
      verificationStatus: "GENERATED",
      verificationReason: `Invoice HS missing; wizard suggests ${wizardHsCode} (${confidenceLabel}).`,
    };
  }

  if (invoiceHsCode && !wizardHsCode) {
    return {
      ...base,
      verificationStatus: "VERIFIED",
      verificationReason: "Invoice HS present; wizard classification not available for comparison.",
    };
  }

  const invoiceHs = invoiceHsCode!;
  const wizardHs = wizardHsCode!;
  const similarityScore = explicitSimilarity ?? computeHsSimilarity(invoiceHs, wizardHs);

  if (invoiceHs === wizardHs) {
    return {
      ...base,
      similarityScore,
      verificationStatus: "VERIFIED",
      verificationReason: "Invoice HS matches wizard classification.",
    };
  }

  if (
    sameChapterOrSubheading(invoiceHs, wizardHs) &&
    similarityScore >= similarityThreshold
  ) {
    return {
      ...base,
      similarityScore,
      verificationStatus: "VERIFIED",
      verificationReason: `Invoice HS ${invoiceHs} aligns with wizard HS ${wizardHs} (same chapter/subheading, similarity ${similarityScore}%).`,
    };
  }

  if (wizardConfidence != null && wizardConfidence >= confidenceThreshold) {
    return {
      ...base,
      similarityScore,
      verificationStatus: "REVIEW_REQUIRED",
      verificationReason: `Invoice HS ${invoiceHs} differs from wizard classification ${wizardHs} (${wizardConfidence}% confidence).`,
    };
  }

  return {
    ...base,
    similarityScore,
    verificationStatus: "REVIEW_REQUIRED_LOW_CONFIDENCE",
    verificationReason: `Invoice HS ${invoiceHs} differs from wizard ${wizardHs}; wizard confidence below ${confidenceThreshold}% threshold.`,
  };
}

export function buildLineHsVerificationResults(invoice: NormalizedInvoice): HsVerificationResult[] {
  const goodsItems = filterGoodsLines(normalizeAggregationItems(invoice));
  const rawItems = invoice.items ?? [];

  return goodsItems.map((goodsLine) => {
    const rawItem =
      rawItems.find((item, index) => resolvePositionNumber(item, index) === goodsLine.position_number) ??
      rawItems[goodsLine.position_number - 1];
    return evaluateLineHsVerification(rawItem ?? { hs_code: goodsLine.hs_code }, goodsLine.position_number);
  });
}

export function buildHsVerificationSummary(invoice: NormalizedInvoice): HsVerificationSummary {
  const lineResults = buildLineHsVerificationResults(invoice);

  const linesVerified = lineResults.filter((r) => r.verificationStatus === "VERIFIED").length;
  const linesReviewRequired = lineResults.filter(
    (r) =>
      r.verificationStatus === "REVIEW_REQUIRED" ||
      r.verificationStatus === "REVIEW_REQUIRED_LOW_CONFIDENCE"
  ).length;
  const linesGenerated = lineResults.filter((r) => r.verificationStatus === "GENERATED").length;
  const linesMissing = lineResults.filter((r) => r.verificationStatus === "MISSING").length;

  const documentHasHighConfidenceDiscrepancy = lineResults.some(
    (r) => r.verificationStatus === "REVIEW_REQUIRED"
  );

  return {
    lineResults,
    documentHasHighConfidenceDiscrepancy,
    linesVerified,
    linesReviewRequired,
    linesGenerated,
    linesMissing,
  };
}

export function hasHighConfidenceHsDiscrepancy(
  summary: Pick<HsVerificationSummary, "documentHasHighConfidenceDiscrepancy"> | null | undefined
): boolean {
  return summary?.documentHasHighConfidenceDiscrepancy === true;
}

export function enrichTraceabilityWithVerification(
  lines: PositionTraceabilityLine[],
  verificationResults: HsVerificationResult[]
): PositionTraceabilityLine[] {
  const byPosition = new Map(verificationResults.map((r) => [r.positionNumber, r]));

  return lines.map((line) => {
    const verification = byPosition.get(line.positionNumber);
    if (!verification) return line;

    return {
      ...line,
      wizardHsCode: verification.wizardHsCode,
      verificationStatus: verification.verificationStatus,
      wizardConfidence: verification.wizardConfidence,
      similarityScore: verification.similarityScore,
      verificationReason: verification.verificationReason,
    };
  });
}

export function deriveAggregationHsVerification(
  row: Pick<HsAggregationRow, "hsCode" | "sourcePositions">,
  verificationResults: HsVerificationResult[]
): Pick<
  HsAggregationRow,
  "wizardHsCode" | "verificationStatus" | "wizardConfidence" | "verificationReason" | "invoiceHsCode"
> {
  const lines = verificationResults.filter((r) => row.sourcePositions.includes(r.positionNumber));

  if (lines.length === 0) {
    return {
      invoiceHsCode: null,
      wizardHsCode: null,
      verificationStatus: "MISSING",
      wizardConfidence: null,
      verificationReason: "No verification data for aggregation row.",
    };
  }

  const invoiceCodes = [...new Set(lines.map((l) => l.invoiceHsCode).filter(Boolean))];
  const wizardCodes = [...new Set(lines.map((l) => l.wizardHsCode).filter(Boolean))];
  const statuses = lines.map((l) => l.verificationStatus);

  let verificationStatus: HsVerificationStatus = "VERIFIED";
  if (statuses.includes("REVIEW_REQUIRED")) {
    verificationStatus = "REVIEW_REQUIRED";
  } else if (statuses.includes("REVIEW_REQUIRED_LOW_CONFIDENCE")) {
    verificationStatus = "REVIEW_REQUIRED_LOW_CONFIDENCE";
  } else if (statuses.includes("MISSING")) {
    verificationStatus = "MISSING";
  } else if (statuses.includes("GENERATED")) {
    verificationStatus = "GENERATED";
  }

  const confidences = lines
    .map((l) => l.wizardConfidence)
    .filter((v): v is number => v != null);
  const wizardConfidence =
    confidences.length > 0 ? Math.max(...confidences) : null;

  const reasons = [...new Set(lines.map((l) => l.verificationReason))];

  return {
    invoiceHsCode: invoiceCodes.length === 1 ? invoiceCodes[0]! : invoiceCodes.join(" / ") || null,
    wizardHsCode: wizardCodes.length === 1 ? wizardCodes[0]! : wizardCodes.join(" / ") || null,
    verificationStatus,
    wizardConfidence,
    verificationReason: reasons.join(" | "),
  };
}

export function formatHsVerificationStatusLabel(status: HsVerificationStatus): string {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "REVIEW_REQUIRED":
      return "Review Required";
    case "REVIEW_REQUIRED_LOW_CONFIDENCE":
      return "Review Required (Low Confidence)";
    case "GENERATED":
      return "Generated";
    case "MISSING":
      return "Missing";
    default:
      return status;
  }
}
