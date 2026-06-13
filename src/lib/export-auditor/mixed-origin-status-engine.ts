/**
 * Mixed Origin Status Engine — document-level preferential status from line-level results.
 * Line-level classification always takes precedence over blanket document declarations.
 */
import type { LinePreferentialOrigin } from "@/lib/export-auditor/preferential-origin-engine";
import type { PreferentialOriginDecision } from "@/lib/export-auditor/preferential-origin-decision-engine";

export type LineDerivedPreferentialStatus =
  | "CONFIRMED"
  | "NOT_DECLARED"
  | "MIXED_ORIGIN"
  | "NON_PREFERENTIAL_EXPORT";

export const NON_PREFERENTIAL_EXPORT_STATUS_LABEL = "Non-Preferential Export Goods";
export const NON_PREFERENTIAL_EXPORT_RECOMMENDATION =
  "No preferential origin declared on invoice lines. All goods treated as non-preferential export.";

export const MIXED_ORIGIN_STATUS_LABEL = "Mixed Origin Goods";
export const MIXED_ORIGIN_RECOMMENDATION =
  "Document declaration present, but line-level analysis shows both preferential and non-preferential goods. Split declaration treatment required.";

export function hasPreferentialLines(lines: LinePreferentialOrigin[]): boolean {
  return lines.some((line) => line.preferential_origin === "YES");
}

export function hasNonPreferentialLines(lines: LinePreferentialOrigin[]): boolean {
  return lines.some((line) => line.preferential_origin === "NO");
}

export function isMixedPreferentialLines(lines: LinePreferentialOrigin[]): boolean {
  return hasPreferentialLines(lines) && hasNonPreferentialLines(lines);
}

/** True when every classified line is NOT_DECLARED (no YES/NO markers). */
export function isAllNotDeclaredLines(lines: LinePreferentialOrigin[]): boolean {
  return (
    lines.length > 0 &&
    lines.every((line) => line.preferential_origin === "NOT_DECLARED")
  );
}

/** Derive document preferential status from classified line items. */
export function deriveLineBasedPreferentialStatus(
  lines: LinePreferentialOrigin[]
): LineDerivedPreferentialStatus | null {
  if (lines.length === 0) {
    return null;
  }

  const hasYes = hasPreferentialLines(lines);
  const hasNo = hasNonPreferentialLines(lines);

  if (hasYes && hasNo) {
    return "MIXED_ORIGIN";
  }
  if (hasYes && !hasNo) {
    return "CONFIRMED";
  }
  if (hasNo && !hasYes) {
    return "NOT_DECLARED";
  }
  if (isAllNotDeclaredLines(lines)) {
    return "NON_PREFERENTIAL_EXPORT";
  }

  return null;
}

export interface LineDerivedOriginPresentation {
  preferentialOriginStatus: LineDerivedPreferentialStatus;
  statusLabel: string;
  recommendation: string;
  invoiceDeclarationSufficient: boolean;
  mixedOrigin: boolean;
}

/** Apply line-level origin result over PEM/UK/REX decision engine output. */
export function applyLineDerivedOriginStatus(
  decision: PreferentialOriginDecision,
  lines: LinePreferentialOrigin[],
  options: { originDeclarationFound: boolean }
): LineDerivedOriginPresentation {
  const lineStatus = deriveLineBasedPreferentialStatus(lines);

  if (lineStatus === "MIXED_ORIGIN") {
    return {
      preferentialOriginStatus: "MIXED_ORIGIN",
      statusLabel: MIXED_ORIGIN_STATUS_LABEL,
      recommendation: MIXED_ORIGIN_RECOMMENDATION,
      invoiceDeclarationSufficient: false,
      mixedOrigin: true,
    };
  }

  if (lineStatus === "NON_PREFERENTIAL_EXPORT") {
    return {
      preferentialOriginStatus: "NON_PREFERENTIAL_EXPORT",
      statusLabel: NON_PREFERENTIAL_EXPORT_STATUS_LABEL,
      recommendation: NON_PREFERENTIAL_EXPORT_RECOMMENDATION,
      invoiceDeclarationSufficient: false,
      mixedOrigin: false,
    };
  }

  if (lineStatus === "NOT_DECLARED") {
    return {
      preferentialOriginStatus: "NOT_DECLARED",
      statusLabel: decision.statusLabel,
      recommendation: decision.recommendation,
      invoiceDeclarationSufficient: false,
      mixedOrigin: false,
    };
  }

  if (lineStatus === "CONFIRMED") {
    return {
      preferentialOriginStatus: "CONFIRMED",
      statusLabel: decision.statusLabel,
      recommendation: decision.recommendation,
      invoiceDeclarationSufficient: decision.invoiceDeclarationSufficient,
      mixedOrigin: false,
    };
  }

  if (options.originDeclarationFound && hasNonPreferentialLines(lines)) {
    return {
      preferentialOriginStatus: "MIXED_ORIGIN",
      statusLabel: MIXED_ORIGIN_STATUS_LABEL,
      recommendation: MIXED_ORIGIN_RECOMMENDATION,
      invoiceDeclarationSufficient: false,
      mixedOrigin: true,
    };
  }

  return {
    preferentialOriginStatus: decision.preferentialOriginStatus,
    statusLabel: decision.statusLabel,
    recommendation: decision.recommendation,
    invoiceDeclarationSufficient: decision.invoiceDeclarationSufficient,
    mixedOrigin: isMixedPreferentialLines(lines),
  };
}
