/**
 * Preferential Origin Decision Engine — document-level status from invoice evidence only.
 * Country of origin alone never confirms preferential origin.
 */

import type { PreferenceScheme, PreferenceSchemeInfo } from "@/lib/export-auditor/preference-scheme";
import { resolvePreferenceScheme } from "@/lib/export-auditor/preference-scheme";

export type PreferentialOriginDocumentStatus = "CONFIRMED" | "NOT_DECLARED";

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
  preferentialOriginStatus: PreferentialOriginDocumentStatus;
  invoiceDeclarationSufficient: boolean;
  eur1Recommended: boolean;
  statusLabel: string;
  recommendation: string;
  caseId: 0 | 1 | 2 | 3 | 4;
}

export const CASE1_MESSAGE = "Preferential origin declared on invoice.";
export const CASE2_MESSAGE =
  "Preferential origin not claimed. For consignments up to EUR 6000, preferential treatment requires an invoice declaration if preference is intended.";
export const CASE3_MESSAGE =
  "Preferential origin not claimed. Invoice value exceeds EUR 6000. EUR.1 may be required if preferential treatment is intended.";
export const CASE4_MESSAGE = "Authorised exporter declaration detected.";
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

function evaluatePemDecision(input: PreferentialOriginDecisionInput): PreferentialOriginDecision {
  const {
    originDeclarationDetected,
    authorisedExporterDetected,
    invoiceValueEur,
    preferenceScheme,
  } = input;

  if (originDeclarationDetected && authorisedExporterDetected) {
    return {
      preferentialOriginStatus: "CONFIRMED",
      invoiceDeclarationSufficient: true,
      eur1Recommended: false,
      statusLabel: "Confirmed",
      recommendation: CASE4_MESSAGE,
      caseId: 4,
    };
  }

  if (originDeclarationDetected) {
    return {
      preferentialOriginStatus: "CONFIRMED",
      invoiceDeclarationSufficient: true,
      eur1Recommended: false,
      statusLabel: "Confirmed",
      recommendation: CASE1_MESSAGE,
      caseId: 1,
    };
  }

  if (invoiceValueEur <= INVOICE_DECLARATION_VALUE_THRESHOLD_EUR) {
    return {
      preferentialOriginStatus: "NOT_DECLARED",
      invoiceDeclarationSufficient: false,
      eur1Recommended: false,
      statusLabel: "Not declared",
      recommendation: CASE2_MESSAGE,
      caseId: 2,
    };
  }

  if (!authorisedExporterDetected) {
    const eur1Recommended = preferenceScheme.workflowActive;
    return {
      preferentialOriginStatus: "NOT_DECLARED",
      invoiceDeclarationSufficient: false,
      eur1Recommended,
      statusLabel: "Not declared",
      recommendation: eur1Recommended ? CASE3_MESSAGE : CASE2_MESSAGE,
      caseId: 3,
    };
  }

  return {
    preferentialOriginStatus: "NOT_DECLARED",
    invoiceDeclarationSufficient: false,
    eur1Recommended: false,
    statusLabel: "Not declared",
    recommendation:
      "Customs authorization reference detected without a preferential origin declaration. Country of origin alone does not establish preference.",
    caseId: 2,
  };
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

    return {
      preferentialOriginStatus: "CONFIRMED",
      invoiceDeclarationSufficient: false,
      eur1Recommended: false,
      statusLabel: "Confirmed",
      recommendation,
      caseId: 1,
    };
  }

  return {
    preferentialOriginStatus: "NOT_DECLARED",
    invoiceDeclarationSufficient: false,
    eur1Recommended: false,
    statusLabel: "Not declared",
    recommendation: scheme === "REX" ? REX_UNDECLARED_MESSAGE : UK_UNDECLARED_MESSAGE,
    caseId: 2,
  };
}

/** Evaluate document-level preferential origin status from submitted invoice evidence. */
export function evaluatePreferentialOriginDecision(
  input: PreferentialOriginDecisionInput
): PreferentialOriginDecision {
  const { preferenceScheme } = input;

  if (!preferenceScheme.workflowActive || preferenceScheme.scheme === "NO_PREFERENCE") {
    return {
      preferentialOriginStatus: "NOT_DECLARED",
      invoiceDeclarationSufficient: false,
      eur1Recommended: false,
      statusLabel: "Not applicable",
      recommendation: NO_PREFERENCE_MESSAGE,
      caseId: 0,
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
