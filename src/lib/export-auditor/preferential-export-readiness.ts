import type { AuditIssue, PreferenceOriginAnalysis } from "@/lib/export-auditor/types";
import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  hasOnlyManualHsClassificationReview,
  isMinorDocumentationIssue,
  MISSING_VAT_ARTICLE,
  resolveIssueCode,
} from "@/lib/export-auditor/issue-readiness";

export const REQUEST_MISSING_VAT_ARTICLE = "Request missing VAT article";

export function isPreferentialOriginConfirmed(
  preferenceOrigin: PreferenceOriginAnalysis
): boolean {
  if (preferenceOrigin.preferentialOriginStatus !== "CONFIRMED") {
    return false;
  }
  if (preferenceOrigin.mixedOrigin) {
    return false;
  }
  if (preferenceOrigin.eur1Recommended) {
    return false;
  }
  if (
    preferenceOrigin.statementOnOriginDetected &&
    (preferenceOrigin.preferenceScheme === "UK" || preferenceOrigin.preferenceScheme === "REX")
  ) {
    return true;
  }

  if (preferenceOrigin.lineItems.length === 0) {
    return preferenceOrigin.originDeclarationFound;
  }
  return preferenceOrigin.lineItems.every((line) => line.preferential_origin === "YES");
}

export function isExportDeclarationReady(
  preferenceOrigin: PreferenceOriginAnalysis,
  hsCodeCount: number
): boolean {
  return hsCodeCount > 0 && isPreferentialOriginConfirmed(preferenceOrigin);
}

export function isPreferentialReviewRecommendation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return (
    /verify preferential origin/.test(normalized) ||
    /preferential origin has not been confirmed/.test(normalized) ||
    /preferential origin.*not.*confirm/.test(normalized) ||
    (/requires review before export declaration/.test(normalized) &&
      /preferential/.test(normalized))
  );
}

export function isEur1Recommendation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /eur\.?\s*1/.test(normalized);
}

export function isInvoiceDeclarationSufficientRecommendation(text: string): boolean {
  return /invoice declaration sufficient/i.test(text.trim());
}

export function isPreferenceNotDeclared(preferenceOrigin: PreferenceOriginAnalysis): boolean {
  return (
    preferenceOrigin.preferentialOriginStatus === "NOT_DECLARED" ||
    preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT"
  );
}

export function isMixedPreferentialOriginStatus(
  preferenceOrigin: PreferenceOriginAnalysis
): boolean {
  return preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN";
}

export function isPreferentialOriginAnalyzed(
  preferenceOrigin: PreferenceOriginAnalysis
): boolean {
  return (
    isPreferentialOriginConfirmed(preferenceOrigin) ||
    isMixedPreferentialOriginStatus(preferenceOrigin) ||
    (preferenceOrigin.mixedOrigin && preferenceOrigin.originDeclarationFound)
  );
}

/** CASE 2 — low value, no declaration: suppress EUR.1 recommendations entirely. */
export function shouldSuppressEur1Recommendations(
  preferenceOrigin: PreferenceOriginAnalysis
): boolean {
  if (!preferenceOrigin.preferenceWorkflowActive) {
    return true;
  }
  if (preferenceOrigin.preferenceScheme !== "PEM") {
    return true;
  }
  return (
    isPreferenceNotDeclared(preferenceOrigin) &&
    !preferenceOrigin.eur1Recommended
  );
}

export function shouldIgnorePreferenceWorkflow(
  preferenceOrigin: PreferenceOriginAnalysis
): boolean {
  return !preferenceOrigin.preferenceWorkflowActive;
}

export function isDocumentationOnlyWarnings(issues: AuditIssue[]): boolean {
  return (
    issues.length > 0 &&
    issues.every(
      (issue) =>
        issue.type !== "error" &&
        (resolveIssueCode(issue) === MISSING_VAT_ARTICLE || isMinorDocumentationIssue(issue))
    )
  );
}

export function filterPreferentialReviewRecommendations(
  recommendations: string[],
  options: {
    preferentialConfirmed: boolean;
    preferentialOriginAnalyzed?: boolean;
    preferenceNotDeclared?: boolean;
    suppressEur1?: boolean;
    ignorePreferenceWorkflow?: boolean;
  }
): string[] {
  const {
    preferentialConfirmed,
    preferentialOriginAnalyzed = false,
    preferenceNotDeclared = false,
    suppressEur1 = false,
    ignorePreferenceWorkflow = false,
  } = options;
  return recommendations.filter((text) => {
    if (ignorePreferenceWorkflow) {
      if (isPreferentialReviewRecommendation(text)) return false;
      if (isEur1Recommendation(text)) return false;
      if (isInvoiceDeclarationSufficientRecommendation(text)) return false;
      return true;
    }
    if ((preferentialConfirmed || preferentialOriginAnalyzed) && isPreferentialReviewRecommendation(text)) {
      return false;
    }
    if (preferenceNotDeclared) {
      if (isPreferentialReviewRecommendation(text)) return false;
      if (isInvoiceDeclarationSufficientRecommendation(text)) return false;
      if (isEur1Recommendation(text)) return false;
    } else if (suppressEur1 && isEur1Recommendation(text)) {
      return false;
    }
    return true;
  });
}

export function isInvoiceFoundationComplete(
  invoice: NormalizedInvoice,
  preferenceOrigin: PreferenceOriginAnalysis
): boolean {
  const shipment = invoice.shipment_summary;
  return Boolean(
    invoice.exporter?.trim() &&
      invoice.consignee?.trim() &&
      (invoice.country_code?.trim() || invoice.country?.trim()) &&
      invoice.vat_article?.trim() &&
      shipment?.gross_weight_total != null &&
      shipment?.package_count != null &&
      preferenceOrigin.originDeclarationFound &&
      preferenceOrigin.authorisedExporterDetected
  );
}

export function isReadyWithManualClassificationReview(
  report: {
    hsCodesDetected: string[];
    issues: AuditIssue[];
    preferenceOrigin: PreferenceOriginAnalysis;
    invoiceSummary: { exporter: string; consignee: string };
  },
  invoiceFoundationComplete: boolean
): boolean {
  return (
    invoiceFoundationComplete &&
    report.hsCodesDetected.length === 0 &&
    hasOnlyManualHsClassificationReview(report.issues) &&
    report.preferenceOrigin.originDeclarationFound &&
    report.preferenceOrigin.authorisedExporterDetected
  );
}
