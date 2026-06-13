import type { ExportAuditReport, PreferenceOriginAnalysis } from "@/lib/export-auditor/types";
import {
  getIssuePenalty,
  hasOnlyManualHsClassificationReview,
  isCriticalBlocker,
  MISSING_VAT_ARTICLE,
  resolveIssueCode,
} from "@/lib/export-auditor/issue-readiness";
import {
  isDocumentationOnlyWarnings,
  isExportDeclarationReady,
  isPreferentialOriginConfirmed,
  isPreferenceNotDeclared,
} from "@/lib/export-auditor/preferential-export-readiness";
import {
  isManualClassificationPending,
  resolveUnifiedReadiness,
} from "@/lib/export-auditor/unified-readiness";

export interface ReadinessVerdict {
  score: number;
  statusLabel: string;
  statusMessage: string;
  exportStatus: string;
  isReady: boolean;
  auditStatus: ExportAuditReport["auditStatus"];
}

export interface AdjustReadinessOptions {
  hsCodeCount?: number;
  mrnExportReady?: boolean;
  invoiceFoundationComplete?: boolean;
}

const CUSTOMS_COMPLETE_SCORE_FLOOR = 95;

function isCustomsComplete(
  preferenceOrigin: PreferenceOriginAnalysis,
  issues: ExportAuditReport["issues"],
  options: AdjustReadinessOptions
): boolean {
  if (issues.some(isCriticalBlocker)) {
    return false;
  }
  if ((options.hsCodeCount ?? 0) <= 0) {
    return false;
  }
  if (!options.mrnExportReady) {
    return false;
  }
  return isPreferentialOriginConfirmed(preferenceOrigin);
}

/** Apply tiered issue penalties on top of API readiness score. */
export function adjustReadinessScore(
  baseScore: number,
  preferenceOrigin: PreferenceOriginAnalysis,
  issues: ExportAuditReport["issues"],
  options: AdjustReadinessOptions = {}
): number {
  let score = baseScore;
  const penalizedCodes = new Set<string>();

  for (const issue of issues) {
    const code = resolveIssueCode(issue);
    if (penalizedCodes.has(code)) {
      continue;
    }
    penalizedCodes.add(code);
    score -= getIssuePenalty(issue, code);
  }

  if (
    preferenceOrigin.originDeclarationFound &&
    preferenceOrigin.eur1Recommended &&
    !preferenceOrigin.authorisedExporterDetected
  ) {
    score -= 8;
  }

  if (isCustomsComplete(preferenceOrigin, issues, options)) {
    const minorPenaltyTotal = issues
      .filter((issue) => !isCriticalBlocker(issue) && issue.type !== "info")
      .reduce((sum, issue) => {
        const code = resolveIssueCode(issue);
        return sum + getIssuePenalty(issue, code);
      }, 0);
    score = Math.max(score, CUSTOMS_COMPLETE_SCORE_FLOOR - minorPenaltyTotal);
  }

  if (
    options.invoiceFoundationComplete &&
    (options.hsCodeCount ?? 0) === 0 &&
    hasOnlyManualHsClassificationReview(issues)
  ) {
    const infoPenalty = issues
      .filter((issue) => issue.type === "info")
      .reduce((sum, issue) => sum + getIssuePenalty(issue, resolveIssueCode(issue)), 0);
    score = Math.max(score, 90 - infoPenalty);
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Display score — already adjusted during report mapping. */
export function calculateExportReadinessScore(
  report: Pick<ExportAuditReport, "readinessScore">
): number {
  return report.readinessScore;
}

function hasCriticalBlockers(report: ExportAuditReport): boolean {
  return report.issues.some(isCriticalBlocker);
}

function isCustomsExportReady(report: ExportAuditReport): boolean {
  return (
    isExportDeclarationReady(report.preferenceOrigin, report.hsCodesDetected.length) &&
    report.mrnExportReady &&
    !hasCriticalBlockers(report)
  );
}

/** @deprecated Use resolveUnifiedReadiness via getReadinessVerdict */
export function applyHsClassificationStatusCap(
  report: ExportAuditReport,
  tier: Pick<ReadinessVerdict, "exportStatus" | "statusLabel" | "isReady">
): Pick<ReadinessVerdict, "exportStatus" | "statusLabel" | "isReady"> {
  const unified = resolveUnifiedReadiness(report);
  return {
    exportStatus: unified.exportStatus,
    statusLabel: unified.statusLabel,
    isReady: unified.isReady,
  };
}

export function getReadinessVerdict(
  report: ExportAuditReport,
  score?: number
): ReadinessVerdict {
  const displayScore = score ?? calculateExportReadinessScore(report);
  const warningCount = report.issues.filter((i) => i.type === "warning").length;
  const errorCount = report.issues.filter((i) => i.type === "error").length;
  const unified = resolveUnifiedReadiness({ ...report, readinessScore: displayScore });
  const preferentialConfirmed = isPreferentialOriginConfirmed(report.preferenceOrigin);
  const exportDeclarationReady = isExportDeclarationReady(
    report.preferenceOrigin,
    report.hsCodesDetected.length
  );

  if (isManualClassificationPending(report) && errorCount === 0) {
    return {
      score: displayScore,
      statusLabel: unified.statusLabel,
      statusMessage:
        "Invoice documentation complete. Manual HS classification required before export declaration.",
      exportStatus: unified.exportStatus,
      isReady: unified.isReady,
      auditStatus: unified.auditStatus,
    };
  }

  if (exportDeclarationReady && preferentialConfirmed && errorCount === 0) {
    if (isDocumentationOnlyWarnings(report.issues)) {
      const vatOnly =
        report.issues.length === 1 &&
        resolveIssueCode(report.issues[0]) === MISSING_VAT_ARTICLE;
      return {
        score: displayScore,
        statusLabel: unified.statusLabel,
        statusMessage: vatOnly
          ? "Ready with 1 documentation warning."
          : warningCount > 0
            ? `Ready with ${warningCount} documentation warning${warningCount === 1 ? "" : "s"}.`
            : "Document meets export readiness requirements.",
        exportStatus: unified.exportStatus,
        isReady: unified.isReady,
        auditStatus: unified.auditStatus,
      };
    }
  }

  if (isCustomsExportReady(report) && errorCount === 0) {
    return {
      score: displayScore,
      statusLabel: unified.statusLabel,
      statusMessage:
        warningCount > 0
          ? "Customs data is complete. Review minor documentation warnings before filing."
          : "Document meets export readiness requirements.",
      exportStatus: unified.exportStatus,
      isReady: unified.isReady,
      auditStatus: unified.auditStatus,
    };
  }

  if (isPreferenceNotDeclared(report.preferenceOrigin) && errorCount === 0) {
    return {
      score: displayScore,
      statusLabel: unified.statusLabel,
      statusMessage:
        warningCount > 0
          ? "Review documentation findings before export filing."
          : unified.exportStatus === "Ready With Review"
            ? "Invoice is ready for review before export filing."
            : "Review findings before export filing.",
      exportStatus: unified.exportStatus,
      isReady: unified.isReady,
      auditStatus: unified.auditStatus,
    };
  }

  if (errorCount > 0) {
    return {
      score: displayScore,
      statusLabel: unified.statusLabel,
      statusMessage: "Resolve critical issues before export filing.",
      exportStatus: unified.exportStatus,
      isReady: false,
      auditStatus: unified.auditStatus,
    };
  }

  return {
    score: displayScore,
    statusLabel: unified.statusLabel,
    statusMessage:
      warningCount > 0
        ? "Review documentation findings before export filing."
        : "Review findings before export filing.",
    exportStatus: unified.exportStatus,
    isReady: unified.isReady,
    auditStatus: unified.auditStatus,
  };
}

export function countIssuesBySeverity(issues: ExportAuditReport["issues"]) {
  return {
    critical: issues.filter((i) => i.type === "error").length,
    warning: issues.filter((i) => i.type === "warning").length,
    information: issues.filter((i) => i.type === "info").length,
  };
}
