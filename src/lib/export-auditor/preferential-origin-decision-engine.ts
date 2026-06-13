/**
 * Preferential Origin Decision Engine — document-level evidence status from invoice data only.
 * Country of origin alone never confirms preferential origin. EUR.1 is never auto-recommended.
 */

import type { PreferenceScheme, PreferenceSchemeInfo } from "@/lib/export-auditor/preference-scheme";
import { resolvePreferenceScheme } from "@/lib/export-auditor/preference-scheme";
import type { PreferentialOriginEvidenceStatus } from "@/lib/export-auditor/types";

/** EU invoice-declaration value threshold (EUR) for low-value consignments. */
export const INVOICE_DECLARATION_VALUE_THRESHOLD_EUR = 6000;

export interface PreferentialOriginDecisionInput {
  preferenceScheme: PreferenceSchemeInfo;
  originDeclarationDetected: boolean;
  authorisedExporterDetected: boolean;
  statementOnOriginDetected: boolean;
  rexRegistrationDetected: boolean;
  /** Total invoice value in EUR (or invoice currency when EUR is not stated). */
  invoiceValueEur: number;
}

export interface PreferentialOriginDecision {
  /** @deprecated Use evidenceStatus — kept for line-derived status mapping. */
  preferentialOriginStatus: "CONFIRMED" | "NOT_DECLARED";
  evidenceStatus: PreferentialOriginEvidenceStatus;
  invoiceDeclarationSufficient: boolean;
  /** @deprecated Always false — EUR.1 is never auto-recommended from invoice data alone. */
  eur1Recommended: boolean;
  statusLabel: string;
  recommendation: string;
  caseId: 0 | 1 | 2 | 3 | 4;
}

export const CASE1_MESSAGE = "Preferential origin declared on invoice.";
export const CASE2_MESSAGE =
  "Preferential origin not claimed. For consignments up to EUR 6000, preferential treatment requires an invoice declaration if preference is intended.";
export const CASE3_MESSAGE =
  "Verify authorised exporter approval and EUR.1 requirements.";
export const CASE4_MESSAGE = "Authorised exporter declaration detected.";
export const HIGH_VALUE_NO_DECLARATION_MESSAGE =
  "Origin evidence not found on invoice. Verify LTSD, supplier declarations, EUR.1 requirements and importer instructions.";
export const NO_PREFERENCE_MESSAGE =
  "No preferential trade agreement workflow applies for this destination country.";
export const UK_UNDECLARED_MESSAGE =
  "No Statement on Origin detected. UK preferential treatment requires a valid Statement on Origin on the invoice.";
export const UK_CONFIRMED_MESSAGE = "Statement on Origin detected on invoice.";
export const REX_UNDECLARED_MESSAGE =
  "No Statement on Origin detected. Preferential treatment to this destination requires a Statement on Origin from a REX-registered exporter.";
export const REX_CONFIRMED_MESSAGE = "Statement on Origin detected on invoice.";
export const REX_CONFIRMED_WITH_REG_MESSAGE =
  "Statement on Origin with REX registration detected on invoice.";

function declaredDecision(
  recommendation: string,
  invoiceDeclarationSufficient: boolean,
  caseId: PreferentialOriginDecision["caseId"]
): PreferentialOriginDecision {
  return {
    preferentialOriginStatus: "CONFIRMED",
    evidenceStatus: "DECLARED",
    invoiceDeclarationSufficient,
    eur1Recommended: false,
    statusLabel: "Declared",
    recommendation,
    caseId,
  };
}

function notDeclaredDecision(
  recommendation: string,
  caseId: PreferentialOriginDecision["caseId"]
): PreferentialOriginDecision {
  return {
    preferentialOriginStatus: "NOT_DECLARED",
    evidenceStatus: "NOT_DECLARED",
    invoiceDeclarationSufficient: false,
    eur1Recommended: false,
    statusLabel: "Not declared",
    recommendation,
    caseId,
  };
}

function unverifiedDecision(recommendation: string): PreferentialOriginDecision {
  return {
    preferentialOriginStatus: "NOT_DECLARED",
    evidenceStatus: "UNVERIFIED",
    invoiceDeclarationSufficient: false,
    eur1Recommended: false,
    statusLabel: "Unverified",
    recommendation,
    caseId: 3,
  };
}

function evaluatePemDecision(input: PreferentialOriginDecisionInput): PreferentialOriginDecision {
  const {
    originDeclarationDetected,
    authorisedExporterDetected,
    invoiceValueEur,
  } = input;

  if (originDeclarationDetected && authorisedExporterDetected) {
    return declaredDecision(CASE4_MESSAGE, true, 4);
  }

  if (originDeclarationDetected && invoiceValueEur <= INVOICE_DECLARATION_VALUE_THRESHOLD_EUR) {
    return declaredDecision(CASE1_MESSAGE, true, 1);
  }

  if (originDeclarationDetected && invoiceValueEur > INVOICE_DECLARATION_VALUE_THRESHOLD_EUR) {
    return unverifiedDecision(CASE3_MESSAGE);
  }

  if (invoiceValueEur <= INVOICE_DECLARATION_VALUE_THRESHOLD_EUR) {
    return notDeclaredDecision(CASE2_MESSAGE, 2);
  }

  return notDeclaredDecision(HIGH_VALUE_NO_DECLARATION_MESSAGE, 3);
}

function evaluateStatementOnOriginDecision(
  scheme: PreferenceScheme,
  input: PreferentialOriginDecisionInput
): PreferentialOriginDecision {
  const { statementOnOriginDetected, rexRegistrationDetected } = input;

  if (statementOnOriginDetected) {
    const recommendation =
      scheme === "REX" && rexRegistrationDetected
        ? REX_CONFIRMED_WITH_REG_MESSAGE
        : scheme === "REX"
          ? REX_CONFIRMED_MESSAGE
          : UK_CONFIRMED_MESSAGE;

    return declaredDecision(recommendation, false, 1);
  }

  return notDeclaredDecision(
    scheme === "REX" ? REX_UNDECLARED_MESSAGE : UK_UNDECLARED_MESSAGE,
    2
  );
}

/** Evaluate document-level preferential origin evidence from submitted invoice data. */
export function evaluatePreferentialOriginDecision(
  input: PreferentialOriginDecisionInput
): PreferentialOriginDecision {
  const { preferenceScheme } = input;

  if (!preferenceScheme.workflowActive || preferenceScheme.scheme === "NO_PREFERENCE") {
    return {
      ...notDeclaredDecision(NO_PREFERENCE_MESSAGE, 0),
      statusLabel: "Not applicable",
    };
  }

  if (preferenceScheme.scheme === "UK" || preferenceScheme.scheme === "REX") {
    return evaluateStatementOnOriginDecision(preferenceScheme.scheme, input);
  }

  return evaluatePemDecision(input);
}

/** @deprecated Use resolvePreferenceScheme from preference-scheme.ts */
export function destinationSupportsPreferentialTrade(
  destinationOutsideEu: boolean,
  countryCode?: string | null
): boolean {
  if (!destinationOutsideEu) return false;
  return resolvePreferenceScheme(countryCode).workflowActive;
}
