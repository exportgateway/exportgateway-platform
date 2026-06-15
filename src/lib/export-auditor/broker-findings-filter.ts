/**
 * Broker-facing findings filter — hides technical pipeline noise from default UI.
 * Technical findings remain in Admin PDF and Forensic tab.
 */

import type { AuditIssue } from "@/lib/export-auditor/types";
import { resolveIssueCode } from "@/lib/export-auditor/issue-readiness";

/** Issue codes hidden from broker Findings panel (forensic / pipeline only). */
export const TECHNICAL_FINDING_CODES = new Set<string>([
  "POSITION_DATA_OVERWRITE_ATTEMPT",
  "OCR_RECOVERY",
  "EXTRACTION_SOURCE_TRACE",
  "CONFIDENCE_RECALCULATION",
  "LOCK_ENGINE_EVENT",
  "POSITION_LOCK_DEBUG",
  "RECOVERY_ENGINE_TRACE",
]);

const TECHNICAL_MESSAGE_PATTERNS: RegExp[] = [
  /overwrite attempted/i,
  /locked position commercial fields/i,
  /position lock/i,
  /ocr recovery/i,
  /extraction provenance/i,
  /confidence recalculation/i,
  /recovery engine/i,
  /forensic/i,
  /traceability audit/i,
];

export function isTechnicalFinding(issue: AuditIssue): boolean {
  const code = resolveIssueCode(issue);
  if (code && TECHNICAL_FINDING_CODES.has(code)) return true;
  if (issue.field && TECHNICAL_FINDING_CODES.has(issue.field)) return true;
  return TECHNICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(issue.message));
}

export function filterBusinessFindings(issues: AuditIssue[]): AuditIssue[] {
  return issues.filter((issue) => !isTechnicalFinding(issue));
}
