/**
 * Customs Readiness Score — measures export declaration filing completeness.
 * Never mixed with extraction accuracy.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  getIssuePenalty,
  isCriticalBlocker,
  MISSING_VAT_ARTICLE,
  resolveIssueCode,
} from "@/lib/export-auditor/issue-readiness";
import type {
  CustomsReadinessResult,
  CustomsReadinessScore,
  ExportAuditReport,
  ScoreDimension,
} from "@/lib/export-auditor/types";

const DIMENSION_WEIGHTS = {
  grossWeight: 15,
  packageCount: 15,
  packageType: 10,
  incoterms: 15,
  vatArticle: 10,
  originEvidence: 20,
  exportDeclarationCompleteness: 15,
} as const;

const CUSTOMS_ISSUE_CODES = new Set([
  "MISSING_GROSS_WEIGHT",
  "MISSING_NET_WEIGHT",
  "MISSING_PACKAGE_COUNT",
  "MISSING_INCOTERMS",
  MISSING_VAT_ARTICLE,
  "NO_ORIGIN_DECLARATION",
  "MISSING_COUNTRY_OF_ORIGIN",
  "EU_DESTINATION",
  "MISSING_DESTINATION",
  "MISSING_DESTINATION_COUNTRY",
]);

function isMissingIncoterms(incoterms: string | null | undefined): boolean {
  const value = incoterms?.trim();
  return !value || value === "—";
}

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function weightedAverage(dimensions: ScoreDimension[]): number {
  const totalWeight = dimensions.reduce((sum, dim) => sum + dim.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0);
  return clampScore(weighted / totalWeight);
}

function scoreGrossWeight(report: ExportAuditReport): number {
  const gross = report.shipmentSummary.grossWeightTotal;
  if (gross != null && gross > 0) return 100;
  const hasIssue = report.issues.some((issue) => resolveIssueCode(issue) === "MISSING_GROSS_WEIGHT");
  return hasIssue ? 0 : 40;
}

function scorePackageCount(report: ExportAuditReport): number {
  const { packageCount, declarationPackageCount, palletCount } = report.shipmentSummary;
  const declCount =
    typeof declarationPackageCount === "number"
      ? declarationPackageCount
      : declarationPackageCount != null
        ? Number(declarationPackageCount)
        : null;
  if (declCount != null && Number.isFinite(declCount) && declCount > 0) return 100;
  if (packageCount != null && packageCount > 0) return 90;
  if (palletCount != null && palletCount > 0) return 75;
  const hasIssue = report.issues.some(
    (issue) => resolveIssueCode(issue) === "MISSING_PACKAGE_COUNT"
  );
  return hasIssue ? 0 : 30;
}

function scorePackageType(report: ExportAuditReport): number {
  const type = report.shipmentSummary.declarationPackageType ?? report.shipmentSummary.packageType;
  if (type?.trim()) return 100;
  if (report.shipmentSummary.declarationPackageCount != null) return 60;
  return 35;
}

function scoreIncoterms(report: ExportAuditReport, invoice: NormalizedInvoice): number {
  const incoterms = report.invoiceSummary.incoterms ?? invoice.incoterms;
  if (!isMissingIncoterms(incoterms)) return 100;
  return report.issues.some((issue) => resolveIssueCode(issue) === "MISSING_INCOTERMS") ? 0 : 25;
}

function scoreVatArticle(report: ExportAuditReport, invoice: NormalizedInvoice): number {
  const vat = invoice.vat_article?.trim();
  if (vat) return 100;
  const hasWarning = report.issues.some((issue) => resolveIssueCode(issue) === MISSING_VAT_ARTICLE);
  return hasWarning ? 55 : 70;
}

function scoreOriginEvidence(report: ExportAuditReport): number {
  const po = report.preferenceOrigin;
  if (po.preferentialOriginStatus === "CONFIRMED" || po.evidenceStatus === "DECLARED") return 100;
  if (po.originDeclarationFound || po.authorisedExporterDetected) return 85;
  if (po.evidenceStatus === "UNVERIFIED") return 45;
  if (po.preferentialOriginStatus === "NOT_DECLARED") return 60;
  return 50;
}

function scoreExportDeclarationCompleteness(report: ExportAuditReport): number {
  const readiness = report.declarationReadiness;
  if (!readiness) return 50;
  const total = 10;
  const missing = readiness.missingFields.length;
  const present = Math.max(0, total - missing);
  let score = clampScore((present / total) * 100);
  if (readiness.ready) score = 100;
  if (!report.mrnExportReady) score = Math.min(score, 75);
  return score;
}

function applyCustomsIssuePenalties(baseScore: number, report: ExportAuditReport): number {
  let score = baseScore;
  const penalized = new Set<string>();

  for (const issue of report.issues) {
    const code = resolveIssueCode(issue);
    if (!CUSTOMS_ISSUE_CODES.has(code) && !isCriticalBlocker(issue)) continue;
    if (penalized.has(code)) continue;
    penalized.add(code);
    score -= getIssuePenalty(issue, code);
  }

  if (report.customsReadiness?.status === "CUSTOMS_BLOCKED") {
    score = Math.min(score, 45);
  } else if (report.customsReadiness?.status === "CUSTOMS_REVIEW") {
    score = Math.min(score, 85);
  }

  return clampScore(score);
}

function buildLabel(score: number, status?: CustomsReadinessResult["status"]): string {
  if (status === "CUSTOMS_BLOCKED") return "Not ready for filing";
  if (score >= 90) return "Ready for export declaration";
  if (score >= 75) return "Mostly ready — review gaps";
  if (score >= 55) return "Customs review required";
  return "Significant gaps before filing";
}

function buildMessage(dimensions: ScoreDimension[], readiness?: CustomsReadinessResult): string {
  if (readiness?.reasons.length) {
    return readiness.reasons.slice(0, 2).join(". ") + (readiness.reasons.length > 2 ? "…" : "");
  }
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  if (!weakest || weakest.score >= 90) {
    return "Customs declaration fields are largely complete.";
  }
  return `Review before filing: ${weakest.label} (${weakest.score}/100).`;
}

/** Compute customs readiness score (0–100) — independent of extraction accuracy. */
export function computeCustomsReadinessScore(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): CustomsReadinessScore {
  const dimensions: ScoreDimension[] = [
    {
      id: "grossWeight",
      label: "Gross Weight",
      score: scoreGrossWeight(report),
      weight: DIMENSION_WEIGHTS.grossWeight,
    },
    {
      id: "packageCount",
      label: "Package Count",
      score: scorePackageCount(report),
      weight: DIMENSION_WEIGHTS.packageCount,
    },
    {
      id: "packageType",
      label: "Package Type",
      score: scorePackageType(report),
      weight: DIMENSION_WEIGHTS.packageType,
    },
    {
      id: "incoterms",
      label: "Incoterms",
      score: scoreIncoterms(report, invoice),
      weight: DIMENSION_WEIGHTS.incoterms,
    },
    {
      id: "vatArticle",
      label: "VAT Article",
      score: scoreVatArticle(report, invoice),
      weight: DIMENSION_WEIGHTS.vatArticle,
    },
    {
      id: "originEvidence",
      label: "Origin Evidence",
      score: scoreOriginEvidence(report),
      weight: DIMENSION_WEIGHTS.originEvidence,
    },
    {
      id: "exportDeclarationCompleteness",
      label: "Export Declaration Completeness",
      score: scoreExportDeclarationCompleteness(report),
      weight: DIMENSION_WEIGHTS.exportDeclarationCompleteness,
    },
  ];

  const baseScore = weightedAverage(dimensions);
  const score = applyCustomsIssuePenalties(baseScore, report);

  return {
    score,
    label: buildLabel(score, report.customsReadiness?.status),
    message: buildMessage(dimensions, report.customsReadiness),
    dimensions,
    status: report.customsReadiness?.status ?? "CUSTOMS_REVIEW",
  };
}
