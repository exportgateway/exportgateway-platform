/**
 * Preferential proof scheme by destination country.
 * Determines which origin documentation applies — not inferred from supplier/manufacturing country.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { isDestinationOutsideEu } from "@/lib/export-auditor/invoice-fields";

export type PreferenceScheme = "PEM" | "UK" | "REX" | "NO_PREFERENCE";

export type PreferenceProofDocument =
  | "Invoice Declaration"
  | "Authorised Exporter"
  | "EUR.1"
  | "Statement on Origin"
  | "REX registration";

export interface PreferenceSchemeInfo {
  scheme: PreferenceScheme;
  schemeLabel: string;
  applicableProofDocuments: PreferenceProofDocument[];
  /** When false, preferential origin workflow is skipped for this destination. */
  workflowActive: boolean;
}

/** Pan-Euro-Mediterranean cumulation zone (non-EU destinations). */
export const PEM_COUNTRY_CODES = new Set([
  "AL",
  "BA",
  "CH",
  "DZ",
  "EG",
  "FO",
  "GE",
  "IL",
  "IS",
  "JO",
  "LB",
  "LI",
  "MA",
  "MD",
  "ME",
  "MK",
  "NO",
  "PS",
  "RS",
  "SY",
  "TN",
  "TR",
  "UA",
  "XK",
]);

/** United Kingdom — EU–UK Trade and Cooperation Agreement proof path. */
export const UK_COUNTRY_CODES = new Set(["GB", "UK"]);

/**
 * Destinations where EU preferential origin is proven via Statement on Origin / REX.
 * (Modern EU FTAs — not PEM invoice-declaration path.)
 */
export const REX_COUNTRY_CODES = new Set([
  "AU",
  "CA",
  "CL",
  "CO",
  "CR",
  "EC",
  "GT",
  "HN",
  "JP",
  "KR",
  "MX",
  "MY",
  "NI",
  "NZ",
  "PA",
  "PE",
  "PH",
  "SG",
  "TH",
  "VN",
  "ZA",
]);

const PEM_PROOFS: PreferenceProofDocument[] = [
  "Invoice Declaration",
  "Authorised Exporter",
  "EUR.1",
];

const UK_PROOFS: PreferenceProofDocument[] = ["Statement on Origin"];

const REX_PROOFS: PreferenceProofDocument[] = ["Statement on Origin", "REX registration"];

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  ICELAND: "IS",
  SERBIA: "RS",
  SWITZERLAND: "CH",
  "UNITED KINGDOM": "GB",
  UK: "GB",
  "GREAT BRITAIN": "GB",
  CANADA: "CA",
  JAPAN: "JP",
  CHINA: "CN",
  "UNITED STATES": "US",
  USA: "US",
  KOSOVO: "XK",
  "NORTH MACEDONIA": "MK",
  "BOSNIA AND HERZEGOVINA": "BA",
};

function normalizeCountryCode(
  countryCode?: string | null,
  countryName?: string | null
): string | null {
  const code = countryCode?.trim().toUpperCase();
  if (code && code.length === 2) {
    return code === "UK" ? "GB" : code;
  }
  const name = countryName?.trim().toUpperCase();
  if (name && COUNTRY_NAME_ALIASES[name]) {
    return COUNTRY_NAME_ALIASES[name];
  }
  return null;
}

function buildSchemeInfo(
  scheme: PreferenceScheme,
  applicableProofDocuments: PreferenceProofDocument[]
): PreferenceSchemeInfo {
  const labels: Record<PreferenceScheme, string> = {
    PEM: "Pan-Euro-Mediterranean (PEM)",
    UK: "United Kingdom (TCA)",
    REX: "Statement on Origin / REX",
    NO_PREFERENCE: "No preferential workflow",
  };

  return {
    scheme,
    schemeLabel: labels[scheme],
    applicableProofDocuments,
    workflowActive: scheme !== "NO_PREFERENCE",
  };
}

/** Resolve preferential proof scheme from destination country. */
export function resolvePreferenceScheme(
  countryCode?: string | null,
  countryName?: string | null
): PreferenceSchemeInfo {
  const code = normalizeCountryCode(countryCode, countryName);

  if (!code) {
    return buildSchemeInfo("NO_PREFERENCE", []);
  }

  if (!isDestinationOutsideEu(code)) {
    return buildSchemeInfo("NO_PREFERENCE", []);
  }

  if (UK_COUNTRY_CODES.has(code)) {
    return buildSchemeInfo("UK", UK_PROOFS);
  }

  if (REX_COUNTRY_CODES.has(code)) {
    return buildSchemeInfo("REX", REX_PROOFS);
  }

  if (PEM_COUNTRY_CODES.has(code)) {
    return buildSchemeInfo("PEM", PEM_PROOFS);
  }

  return buildSchemeInfo("NO_PREFERENCE", []);
}

export function schemeSupportsPreferenceWorkflow(schemeInfo: PreferenceSchemeInfo): boolean {
  return schemeInfo.workflowActive;
}

/** Detect Statement on Origin wording (UK TCA and REX FTAs). */
export function detectStatementOnOrigin(corpus: string): boolean {
  if (!corpus.trim()) return false;
  return (
    /statement\s+on\s+origin/i.test(corpus) ||
    /origin\s+statement/i.test(corpus) ||
    /declare\s+that\s+the\s+goods\s+(?:meet|qualify|are)/i.test(corpus) ||
    /goods\s+originating\s+in\s+(?:the\s+)?(?:EU|European\s+Union)/i.test(corpus)
  );
}

/** Detect REX registration reference on invoice (REX scheme destinations). */
export function detectRexRegistration(corpus: string): string | null {
  const patterns = [
    /\bREX\s*(?:No|Number|#|Registration)?\s*[:\s]*([A-Z]{2}[A-Z0-9]{4,})/i,
    /registered\s+exporter\s*(?:No|Number|#)?\s*[:\s]*([A-Z]{2}[A-Z0-9]{4,})/i,
  ];
  for (const re of patterns) {
    const match = corpus.match(re);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

/** Collect invoice text used to detect origin proof statements. */
export function collectPreferenceDetectionCorpus(invoice: NormalizedInvoice): string {
  const parts: string[] = [];

  if (invoice.ocr_text?.trim()) parts.push(invoice.ocr_text.trim());

  const keys = [
    "vat_article",
    "origin_declaration_text",
    "footer_text",
    "shipment_notes",
    "packing_info",
    "delivery_notes",
  ] as const;

  for (const key of keys) {
    const value = invoice[key as keyof NormalizedInvoice];
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    }
  }

  for (const entry of invoice.preference_declarations ?? []) {
    if (entry?.trim()) parts.push(entry.trim());
  }

  return parts.join("\n");
}
