/**
 * Concept-based authorised exporter detection — not invoice-specific regex patching.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { resolveCountryFromText } from "@/lib/export-auditor/country-resolution";

export type AuthorisedExporterDetectionRule =
  | "EXPORTER_DECLARATION_WITH_AUTHORIZATION"
  | "AUTHORIZATION_NUMBER_WITH_CONTEXT"
  | "CUSTOMS_AUTHORIZATION_SLASH_FORMAT"
  | "AUTHORIZED_EXPORTER_LABEL"
  | "REX_REGISTRATION";

export interface AuthorisedExporterTraceStep {
  stage: string;
  matched: boolean;
  pattern?: string;
  source_text?: string;
  confidence?: number;
  rejection_reason?: string;
}

export interface AuthorisedExporterDetectionResult {
  detected: boolean;
  authorisation_number: string | null;
  authorisation_country: string | null;
  exporter_country: string | null;
  exporter_country_code: string | null;
  detection_rule: AuthorisedExporterDetectionRule | null;
  confidence: number;
  country_match: boolean | null;
  trace: AuthorisedExporterTraceStep[];
}

const AUTH_SPELL = "authori[sz]ation";
const AUTH_EXPORTER_SPELL = "authori[sz]ed\\s+exporter";
const CUSTOMS_AUTH = `customs\\s+${AUTH_SPELL}`;
const AUTH_NO = "(?:no\\.?|number|#)";

const EXPORTER_DECLARATION_PATTERNS: RegExp[] = [
  /the\s+exporter\s+of\s+the\s+products\s+covered\s+by\s+this\s+document/i,
  /exporter\s+of\s+the\s+products\s+covered\s+by\s+this\s+document/i,
  /exporter\s+of\s+(?:the\s+)?products/i,
  /the\s+undersigned\s+exporter/i,
];

const AUTHORIZATION_REFERENCE_PATTERNS: RegExp[] = [
  new RegExp(`customer\\s+${AUTH_SPELL}`, "i"),
  new RegExp(`${CUSTOMS_AUTH}`, "i"),
  new RegExp(`exporter\\s+${AUTH_SPELL}`, "i"),
  new RegExp(`${AUTH_SPELL}\\s+${AUTH_NO}`, "i"),
  new RegExp(`${AUTH_EXPORTER_SPELL}`, "i"),
  new RegExp(`approved\\s+exporter`, "i"),
  /\bREX[\s-]?(?:No|Number|#)?/i,
];

/** EU authorised exporter / REX identifier formats. */
const IDENTIFIER_PATTERNS: Array<{
  re: RegExp;
  normalize: (raw: string) => string;
  countryFromId: (raw: string) => string | null;
}> = [
  {
    re: /\b([A-Z]{2}\/\d+\/\d+)\b/i,
    normalize: (raw) => raw.toUpperCase(),
    countryFromId: (raw) => raw.slice(0, 2).toUpperCase(),
  },
  {
    re: /\b([A-Z]{2}\d{6}\/\d{4})\b/i,
    normalize: (raw) => raw.toUpperCase(),
    countryFromId: (raw) => raw.slice(0, 2).toUpperCase(),
  },
  {
    re: /\b(ATU\d{8,11})\b/i,
    normalize: (raw) => raw.toUpperCase(),
    countryFromId: () => "AT",
  },
  {
    re: /\b(FR\d{6}\/\d{4})\b/i,
    normalize: (raw) => raw.toUpperCase(),
    countryFromId: () => "FR",
  },
  {
    re: /\b([A-Z]{2}[A-Z0-9]{8,14})\b/,
    normalize: (raw) => raw.toUpperCase(),
    countryFromId: (raw) => raw.slice(0, 2).toUpperCase(),
  },
  {
    re: /\b(DE\d{9,12})\b/i,
    normalize: (raw) => raw.toUpperCase(),
    countryFromId: () => "DE",
  },
  {
    re: /\b(IT[A-Z0-9]{9,14})\b/i,
    normalize: (raw) => raw.toUpperCase(),
    countryFromId: () => "IT",
  },
];

const AUTHORIZATION_CAPTURE_RE = new RegExp(
  `(?:customer\\s+)?(?:${CUSTOMS_AUTH}|exporter\\s+${AUTH_SPELL}|${AUTH_SPELL}|${AUTH_EXPORTER_SPELL}|approved\\s+exporter|REX)\\s*(?:${AUTH_NO})?\\s*[:.]?\\s*\\(?\\s*([A-Z]{2}[A-Z0-9/]{4,20}|ATU\\d{8,11}|FR\\d{6}\\/\\d{4})\\s*\\)?`,
  "i"
);

function normalizeCorpus(corpus: string): string {
  return corpus.replace(/\s+/g, " ").trim();
}

function findExporterDeclaration(corpus: string): { matched: boolean; text: string | null; pattern: string | null } {
  for (const re of EXPORTER_DECLARATION_PATTERNS) {
    const match = corpus.match(re);
    if (match) {
      return { matched: true, text: match[0], pattern: re.source };
    }
  }
  return { matched: false, text: null, pattern: null };
}

function findAuthorizationReference(corpus: string): { matched: boolean; text: string | null; pattern: string | null } {
  for (const re of AUTHORIZATION_REFERENCE_PATTERNS) {
    const match = corpus.match(re);
    if (match) {
      return { matched: true, text: match[0], pattern: re.source };
    }
  }
  return { matched: false, text: null, pattern: null };
}

function extractIdentifierNearAuthorization(corpus: string): string | null {
  const capture = corpus.match(AUTHORIZATION_CAPTURE_RE);
  if (capture?.[1]) return capture[1].toUpperCase().replace(/\s+/g, "");

  return null;
}

function extractIdentifierInDeclarationWindow(corpus: string): string | null {
  const blockRe =
    /the\s+exporter\s+of\s+the\s+products\s+covered\s+by\s+this\s+document[\s\S]{0,400}?preferential\s+origin/i;
  const block = corpus.match(blockRe)?.[0];
  if (!block) return null;

  const nearAuth = block.match(AUTHORIZATION_CAPTURE_RE);
  if (nearAuth?.[1]) return nearAuth[1].toUpperCase().replace(/\s+/g, "");

  return null;
}

function countryFromAuthorisationNumber(number: string): string | null {
  for (const { re, countryFromId } of IDENTIFIER_PATTERNS) {
    const match = number.match(re);
    if (match) return countryFromId(match[1] ?? number);
  }
  if (/^[A-Z]{2}/.test(number)) return number.slice(0, 2).toUpperCase();
  return null;
}

function resolveExporterCountry(invoice?: NormalizedInvoice | null): {
  country: string | null;
  country_code: string | null;
} {
  if (!invoice) return { country: null, country_code: null };
  const fromExporter = resolveCountryFromText(invoice.exporter);
  if (fromExporter.country_code) return fromExporter;
  const fromVat = resolveCountryFromText(invoice.vat_article);
  if (fromVat.country_code) return fromVat;
  return { country: null, country_code: null };
}

function computeConfidence(
  hasExporterDeclaration: boolean,
  hasAuthReference: boolean,
  identifier: string | null,
  countryMatch: boolean | null
): number {
  if (!identifier) return 0;
  if (hasExporterDeclaration && hasAuthReference) {
    return countryMatch === false ? 70 : 100;
  }
  if (hasAuthReference) return countryMatch === false ? 65 : 90;
  return countryMatch === false ? 60 : 75;
}

/** Detect authorised exporter from declaration corpus (concept-based). */
export function detectAuthorisedExporter(
  corpus: string,
  invoice?: NormalizedInvoice | null
): AuthorisedExporterDetectionResult {
  const trace: AuthorisedExporterTraceStep[] = [];
  const normalized = normalizeCorpus(corpus);

  const exporterDecl = findExporterDeclaration(normalized);
  trace.push({
    stage: "exporter_declaration_language",
    matched: exporterDecl.matched,
    pattern: exporterDecl.pattern ?? undefined,
    source_text: exporterDecl.text?.slice(0, 120) ?? undefined,
    rejection_reason: exporterDecl.matched ? undefined : "No exporter declaration phrase found",
  });

  const authRef = findAuthorizationReference(normalized);
  trace.push({
    stage: "authorization_reference",
    matched: authRef.matched,
    pattern: authRef.pattern ?? undefined,
    source_text: authRef.text?.slice(0, 120) ?? undefined,
    rejection_reason: authRef.matched ? undefined : "No authorization/authorisation reference found",
  });

  let identifier =
    extractIdentifierInDeclarationWindow(normalized) ?? extractIdentifierNearAuthorization(normalized);

  trace.push({
    stage: "authorization_identifier",
    matched: Boolean(identifier),
    source_text: identifier ?? undefined,
    rejection_reason: identifier
      ? undefined
      : "No authorization identifier matched (expected formats: NL86525748B01, SI/239/10, ATU12345678, etc.)",
  });

  const exporterCountry = resolveExporterCountry(invoice);
  const authorisationCountry = identifier ? countryFromAuthorisationNumber(identifier) : null;

  let countryMatch: boolean | null = null;
  if (authorisationCountry && exporterCountry.country_code) {
    countryMatch = authorisationCountry === exporterCountry.country_code;
    trace.push({
      stage: "country_validation",
      matched: countryMatch,
      source_text: `exporter=${exporterCountry.country_code}, authorisation=${authorisationCountry}`,
      confidence: countryMatch ? 100 : 70,
      rejection_reason: countryMatch
        ? undefined
        : `Authorization prefix ${authorisationCountry} differs from exporter country ${exporterCountry.country_code}`,
    });
  }

  let detection_rule: AuthorisedExporterDetectionRule | null = null;
  let detected = false;
  let confidence = 0;

  if (identifier && exporterDecl.matched && authRef.matched) {
    detected = true;
    detection_rule = "EXPORTER_DECLARATION_WITH_AUTHORIZATION";
    confidence = computeConfidence(true, true, identifier, countryMatch);
  } else if (identifier && authRef.matched) {
    detected = true;
    detection_rule = "AUTHORIZATION_NUMBER_WITH_CONTEXT";
    confidence = computeConfidence(false, true, identifier, countryMatch);
  } else if (identifier && /\/\d/.test(identifier)) {
    detected = true;
    detection_rule = "CUSTOMS_AUTHORIZATION_SLASH_FORMAT";
    confidence = computeConfidence(exporterDecl.matched, authRef.matched, identifier, countryMatch);
  } else if (authRef.matched && /\bREX\b/i.test(authRef.text ?? "")) {
    detected = true;
    detection_rule = "REX_REGISTRATION";
    confidence = 75;
  } else if (authRef.matched && new RegExp(AUTH_EXPORTER_SPELL, "i").test(authRef.text ?? "")) {
    detected = Boolean(identifier);
    detection_rule = detected ? "AUTHORIZED_EXPORTER_LABEL" : null;
    confidence = detected ? 80 : 0;
  }

  trace.push({
    stage: "final_detection",
    matched: detected,
    confidence,
    rejection_reason: detected
      ? undefined
      : "No authorised-exporter, approved-exporter, customs-authorisation, authorization-number, or REX evidence with a valid identifier was found",
  });

  return {
    detected,
    authorisation_number: identifier,
    authorisation_country: authorisationCountry,
    exporter_country: exporterCountry.country,
    exporter_country_code: exporterCountry.country_code,
    detection_rule,
    confidence,
    country_match: countryMatch,
    trace,
  };
}

/** Backward-compatible number extraction — delegates to concept engine. */
export function extractAuthorisedExporterNumberFromCorpus(corpus: string): string | null {
  return detectAuthorisedExporter(corpus).authorisation_number;
}
