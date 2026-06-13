/**
 * Unified readiness — single source of truth for export status across all UI tabs.
 */
import type { AuditStatusLevel, ExportAuditReport } from "@/lib/export-auditor/types";
import { hasOnlyManualHsClassificationReview, isCriticalBlocker } from "@/lib/export-auditor/issue-readiness";

export type UnifiedExportStatus = "Ready" | "Ready With Review" | "Needs Review";

export interface UnifiedReadiness {
  exportStatus: UnifiedExportStatus;
  statusLabel: string;
  auditStatus: AuditStatusLevel;
  isReady: boolean;
}

function goodsLineCount(report: ExportAuditReport): number {
  return Math.max(
    report.hsAggregationReport.mrnSummary.totalGoodsLines,
    report.invoiceSummary.lineItemCount
  );
}

function hasBlockingIssues(report: ExportAuditReport): boolean {
  return report.issues.some(isCriticalBlocker);
}

/** Resolve export and audit status from score, HS classification, and blocking issues. */
export function resolveUnifiedReadiness(report: ExportAuditReport): UnifiedReadiness {
  const score = report.readinessScore;
  const errorCount = report.issues.filter((issue) => issue.type === "error").length;
  const hsCodeCount = report.hsCodesDetected.length;
  const goodsLines = goodsLineCount(report);

  if (errorCount > 0 || hasBlockingIssues(report)) {
    return {
      exportStatus: "Needs Review",
      statusLabel: "Requires Attention Before Export Filing",
      auditStatus: "ERROR",
      isReady: false,
    };
  }

  if (score < 80) {
    return {
      exportStatus: "Needs Review",
      statusLabel: "Requires Attention Before Export Filing",
      auditStatus: "WARNING",
      isReady: false,
    };
  }

  if (goodsLines > 0 && hsCodeCount === 0) {
    return {
      exportStatus: "Ready With Review",
      statusLabel: "Ready With Review",
      auditStatus: "WARNING",
      isReady: true,
    };
  }

  if (score >= 90) {
    return {
      exportStatus: "Ready",
      statusLabel: "Ready For Export Filing",
      auditStatus: "READY",
      isReady: true,
    };
  }

  return {
    exportStatus: "Ready With Review",
    statusLabel: "Ready With Review",
    auditStatus: "WARNING",
    isReady: true,
  };
}

/** Map unified readiness for reports still being assembled (pre-HS aggregation). */
export function resolveUnifiedReadinessFromParts(options: {
  readinessScore: number;
  errorCount: number;
  hsCodeCount: number;
  goodsLines: number;
  hasBlockingIssue?: boolean;
}): UnifiedReadiness {
  const {
    readinessScore,
    errorCount,
    hsCodeCount,
    goodsLines,
    hasBlockingIssue = false,
  } = options;

  if (errorCount > 0 || hasBlockingIssue) {
    return {
      exportStatus: "Needs Review",
      statusLabel: "Requires Attention Before Export Filing",
      auditStatus: "ERROR",
      isReady: false,
    };
  }

  if (readinessScore < 80) {
    return {
      exportStatus: "Needs Review",
      statusLabel: "Requires Attention Before Export Filing",
      auditStatus: "WARNING",
      isReady: false,
    };
  }

  if (goodsLines > 0 && hsCodeCount === 0) {
    return {
      exportStatus: "Ready With Review",
      statusLabel: "Ready With Review",
      auditStatus: "WARNING",
      isReady: true,
    };
  }

  if (readinessScore >= 90) {
    return {
      exportStatus: "Ready",
      statusLabel: "Ready For Export Filing",
      auditStatus: "READY",
      isReady: true,
    };
  }

  return {
    exportStatus: "Ready With Review",
    statusLabel: "Ready With Review",
    auditStatus: "WARNING",
    isReady: true,
  };
}

export function isManualClassificationPending(report: ExportAuditReport): boolean {
  return (
    goodsLineCount(report) > 0 &&
    report.hsCodesDetected.length === 0 &&
    hasOnlyManualHsClassificationReview(report.issues)
  );
}
