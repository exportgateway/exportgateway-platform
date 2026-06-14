import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  normalizeHsToken,
  normalizeAndValidateHsToken,
  isInvalidHsToken,
  INVALID_HS_CODE,
} from "@/lib/export-auditor/hs-code-normalize";
import { extractGenericHsCodes } from "@/lib/export-auditor/hs-code-extraction-engine";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import { buildCommercialHsCorpus } from "@/lib/export-auditor/commercial-line-detector";
import {
  collectSanitizedHsCodes,
  shouldSkipCorpusHsSweep,
} from "@/lib/export-auditor/hs-classification-sanity";

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const COUNTRY_NAMES: Record<string, string> = {
  MK: "North Macedonia",
  RS: "Serbia",
  BA: "Bosnia and Herzegovina",
  AL: "Albania",
  ME: "Montenegro",
  XK: "Kosovo",
  SI: "Slovenia",
  HR: "Croatia",
  DE: "Germany",
  AT: "Austria",
  IT: "Italy",
  FR: "France",
  GB: "United Kingdom",
  US: "United States",
  CH: "Switzerland",
  NO: "Norway",
  TR: "Turkey",
  CN: "China",
  IN: "India",
};

const HS_ITEM_KEYS = [
  "hs_code",
  "tariff_code",
  "cn_code",
  "customs_code",
  "tariff",
  "hs_tariff_code",
] as const;

export {
  normalizeHsToken,
  normalizeAndValidateHsToken,
  isInvalidHsToken,
  INVALID_HS_CODE,
} from "@/lib/export-auditor/hs-code-normalize";

function hsFromUnknownItem(item: ApiInvoiceItem | Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const key of HS_ITEM_KEYS) {
    const value = item[key as keyof typeof item];
    if (typeof value === "string" && value.trim()) {
      for (const part of value.split(/[,;/|]+/)) {
        const code = normalizeHsToken(part);
        if (code) found.push(code);
      }
    }
  }
  return found;
}

/** Collect HS/tariff codes from line items and optional audit disposition extras. */
export function extractHsCodes(
  invoice: NormalizedInvoice,
  extraCodes: string[] = []
): string[] {
  const codes = new Set<string>();

  for (const item of invoice.items ?? []) {
    for (const code of hsFromUnknownItem(item)) {
      codes.add(code);
    }
  }

  for (const raw of extraCodes) {
    for (const part of String(raw).split(/[,;/|]+/)) {
      const code = normalizeHsToken(part);
      if (code) codes.add(code);
    }
  }

  const flags = invoice.document_flags ?? {};
  for (const [key, value] of Object.entries(flags)) {
    if (key === "corpus_hs_detected" && shouldSkipCorpusHsSweep(invoice)) {
      continue;
    }
    if (typeof value === "string") {
      for (const part of value.split(/[,;/|]+/)) {
        const code = normalizeHsToken(part);
        if (code) codes.add(code);
      }
    }
  }

  for (const code of collectSanitizedHsCodes(invoice)) {
    codes.add(code);
  }

  if (codes.size === 0) {
    const corpus = buildInvoiceTextCorpus(invoice);
    if (corpus && !shouldSkipCorpusHsSweep(invoice)) {
      const hsCorpus = buildCommercialHsCorpus(invoice, corpus);
      for (const code of extractGenericHsCodes(hsCorpus)) {
        codes.add(code);
      }
    }
  }

  return [...codes].sort();
}

export function countLineItems(invoice: NormalizedInvoice): number {
  return invoice.items?.length ?? 0;
}

export function extractCountriesOfOrigin(invoice: NormalizedInvoice): string[] {
  const origins = new Set<string>();
  for (const item of invoice.items ?? []) {
    const raw =
      item.country_of_origin?.trim() ||
      (item as Record<string, unknown>).origin?.toString().trim() ||
      (item as Record<string, unknown>).coo?.toString().trim();
    if (raw) origins.add(formatCountryDisplay(raw, raw.length === 2 ? raw : undefined));
  }

  if (origins.size === 0) {
    return [];
  }

  return [...origins].sort();
}

/** Infer country of origin from exporter postal prefix (e.g. SI-3214 ZREČE). */
export function inferExporterCountryOfOrigin(invoice: NormalizedInvoice): string | null {
  const exporter = invoice.exporter?.trim();
  if (!exporter) return null;

  const postalMatch = exporter.match(/\b([A-Z]{2})[\s–\-]\s*\d{4}/i);
  if (!postalMatch) return null;

  const code = postalMatch[1].toUpperCase();
  const name = COUNTRY_NAMES[code];
  return formatCountryDisplay(name ?? code, code);
}

export function formatCountryDisplay(
  name?: string | null,
  code?: string | null
): string {
  const rawName = name?.trim() || "";
  const rawCode = code?.trim().toUpperCase() || "";

  const isCodeOnly = /^[A-Za-z]{2}$/.test(rawName);
  const resolvedCode = rawCode || (isCodeOnly ? rawName.toUpperCase() : "");
  const resolvedName =
    !isCodeOnly && rawName.length > 2
      ? rawName
      : resolvedCode
        ? COUNTRY_NAMES[resolvedCode] || rawName
        : rawName;

  if (resolvedName && resolvedCode && resolvedName.toUpperCase() !== resolvedCode) {
    return `${resolvedName} (${resolvedCode})`;
  }
  if (resolvedName) return resolvedName;
  if (resolvedCode) {
    return COUNTRY_NAMES[resolvedCode]
      ? `${COUNTRY_NAMES[resolvedCode]} (${resolvedCode})`
      : resolvedCode;
  }
  return "—";
}

export function isDestinationOutsideEu(countryCode?: string | null): boolean {
  if (!countryCode?.trim()) return false;
  return !EU_COUNTRY_CODES.has(countryCode.trim().toUpperCase());
}
