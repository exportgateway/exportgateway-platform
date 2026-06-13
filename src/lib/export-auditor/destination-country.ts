import type { DeliveryAddress, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  POSTAL_PREFIX_COUNTRIES,
  resolveCountryFromLine,
  resolveCountryFromText,
} from "@/lib/export-auditor/country-resolution";
import { extractMultilingualConsigneeBlock } from "@/lib/export-auditor/multilingual-field-extractor";
import { inferExporterCountryOfOrigin } from "@/lib/export-auditor/invoice-fields";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

export type DestinationCountrySource =
  | "consignee_postal_prefix"
  | "consignee_country_name"
  | "consignee_postal_city"
  | "delivery_address"
  | "incoterms_place"
  | "ocr_country_field"
  | "unresolved";

export interface ResolvedDestination {
  code: string;
  name: string;
  source: DestinationCountrySource;
}

export interface DestinationCountryDiagnostics {
  exporterCountry: { code: string | null; name: string | null };
  consigneeCountry: { code: string | null; name: string | null };
  destinationCountry: string | null;
  destinationCountryCode: string | null;
  destinationCountrySource: DestinationCountrySource;
  isEuDestination: boolean;
}

/** @deprecated alias for tests — use POSTAL_PREFIX_COUNTRIES */
export const CONSIGNEE_POSTAL_PREFIX_COUNTRIES = POSTAL_PREFIX_COUNTRIES;

export type ConsigneePostalPrefix = keyof typeof POSTAL_PREFIX_COUNTRIES;

/** Matches Balkan consignee postal codes: MK-1000, RS-11000, etc. */
const CONSIGNEE_POSTAL_PREFIX_RE = /\b(MK|RS|BA|AL|XK|ME)-(\d{4,5})\b/i;

const CONSIGNEE_SECTION_BREAK =
  /^(?:izdajatelj|exporter|seller|prodajalec|incoterms|datum|date|račun|racun|invoice|total|skupaj|bruto|gross|koli|kosov|hs\s|tariff|valuta|currency|iban|swift|delivery\s+address|naslov\s+za\s+dostavo)/i;

/** Extract labelled consignee / buyer block from invoice OCR text. */
export function extractConsigneeBlockFromCorpus(corpus: string | null | undefined): string | null {
  return extractMultilingualConsigneeBlock(corpus ?? "");
}

function collectConsigneeAddressTexts(invoice: NormalizedInvoice): string[] {
  const texts: string[] = [];

  if (invoice.consignee?.trim()) {
    texts.push(invoice.consignee.trim());
  }

  const delivery = invoice.delivery_address;
  if (delivery) {
    const deliveryBlock = [
      delivery.company,
      delivery.address,
      delivery.city,
      delivery.postal_code,
      delivery.country,
    ]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join("\n");
    if (deliveryBlock.trim()) {
      texts.push(deliveryBlock.trim());
    }
  }

  for (const corpus of [
    invoice.ocr_text,
    invoice.footer_text,
    invoice.delivery_notes,
    invoice.shipment_notes,
  ]) {
    const block = extractConsigneeBlockFromCorpus(corpus);
    if (block) texts.push(block);
  }

  return [...new Set(texts)];
}

export function isEuDestinationCountry(countryCode?: string | null): boolean {
  if (!countryCode?.trim()) return false;
  return EU_COUNTRY_CODES.has(countryCode.trim().toUpperCase());
}

function resolveExporterCountry(invoice: NormalizedInvoice): {
  code: string | null;
  name: string | null;
} {
  const inferred = inferExporterCountryOfOrigin(invoice);
  if (inferred) {
    const match = inferred.match(/\(([A-Z]{2})\)\s*$/);
    return {
      code: match?.[1] ?? null,
      name: inferred.replace(/\s*\([A-Z]{2}\)\s*$/, "").trim() || inferred,
    };
  }
  const fromExporter = resolveCountryFromText(invoice.exporter);
  return { code: fromExporter.country_code, name: fromExporter.country };
}

function toResolved(
  code: string | null,
  name: string | null,
  source: DestinationCountrySource
): ResolvedDestination | null {
  if (!code?.trim()) return null;
  const upper = code.trim().toUpperCase();
  const resolvedName =
    name?.trim() ||
    POSTAL_PREFIX_COUNTRIES[upper]?.name ||
    upper;
  return { code: upper, name: resolvedName, source };
}

/**
 * Derive destination country from consignee address postal prefix.
 * Returns null when consignee has no recognized prefix pattern.
 */
export function extractDestinationFromConsignee(
  consignee: string | null | undefined
): ResolvedDestination | null {
  const text = consignee?.trim() ?? "";
  if (!text) return null;

  const prefixMatch = text.match(CONSIGNEE_POSTAL_PREFIX_RE);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toUpperCase();
    const mapped = POSTAL_PREFIX_COUNTRIES[prefix];
    if (mapped) {
      return {
        code: mapped.code,
        name: mapped.name,
        source: "consignee_postal_prefix",
      };
    }
  }

  const lines = text.split(/[\n,;]+/).map((part) => part.trim()).filter(Boolean);
  for (const line of [...lines].reverse()) {
    const fromLine = resolveCountryFromLine(line);
    if (fromLine.country_code) {
      const source: DestinationCountrySource =
        /^\d{4,5}\s+/i.test(line) ? "consignee_postal_city" : "consignee_country_name";
      return toResolved(fromLine.country_code, fromLine.country, source);
    }
  }

  const fromText = resolveCountryFromText(text);
  if (fromText.country_code) {
    return toResolved(fromText.country_code, fromText.country, "consignee_country_name");
  }

  return null;
}

function extractDestinationFromDeliveryAddress(
  delivery?: DeliveryAddress | null
): ResolvedDestination | null {
  if (!delivery) return null;

  if (delivery.country_code?.trim()) {
    return toResolved(
      delivery.country_code,
      delivery.country,
      "delivery_address"
    );
  }

  const parts = [delivery.city, delivery.country, delivery.address, delivery.company]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n");
  const resolved = resolveCountryFromText(parts);
  if (resolved.country_code) {
    return toResolved(resolved.country_code, resolved.country, "delivery_address");
  }

  return null;
}

function extractDestinationFromIncoterms(
  incoterms: string | null | undefined,
  exporterCountryCode: string | null
): ResolvedDestination | null {
  const text = incoterms?.trim() ?? "";
  if (!text) return null;

  // FCA / EXW / FOB / FAS name a loading/handover place — never destination country.
  if (/^(FCA|EXW|FOB|FAS)\b/i.test(text)) {
    return null;
  }

  const place = text.replace(/^[A-Z]{3}\s+/i, "").trim();
  if (!place) return null;

  const resolved = resolveCountryFromText(place);
  if (!resolved.country_code) return null;

  if (exporterCountryCode && resolved.country_code.toUpperCase() === exporterCountryCode) {
    return null;
  }

  return toResolved(resolved.country_code, resolved.country, "incoterms_place");
}

function extractDestinationFromOcrFields(
  invoice: NormalizedInvoice,
  exporterCountryCode: string | null
): ResolvedDestination | null {
  const code = invoice.country_code?.trim().toUpperCase();
  const name = invoice.country?.trim();
  if (!code && !name) return null;

  const resolved = toResolved(code ?? null, name ?? null, "ocr_country_field");
  if (!resolved) return null;

  // OCR country fields often mirror exporter territory — never treat as destination when they match.
  if (exporterCountryCode && resolved.code === exporterCountryCode) {
    return null;
  }

  return resolved;
}

function pickConsigneeDestination(invoice: NormalizedInvoice): ResolvedDestination | null {
  const exporterCode = resolveExporterCountry(invoice).code;
  let fallback: ResolvedDestination | null = null;

  for (const text of collectConsigneeAddressTexts(invoice)) {
    const resolved = extractDestinationFromConsignee(text);
    if (!resolved) continue;

    if (exporterCode && resolved.code !== exporterCode) {
      return resolved;
    }

    if (!fallback) {
      fallback = resolved;
    }
  }

  return fallback;
}

/** Collect destination candidates in customs declaration priority order. */
export function resolveDestinationCandidates(
  invoice: NormalizedInvoice
): ResolvedDestination[] {
  const candidates: ResolvedDestination[] = [];
  const exporterCountryCode = resolveExporterCountry(invoice).code;

  const fromConsignee = pickConsigneeDestination(invoice);
  if (fromConsignee) candidates.push(fromConsignee);

  const fromDelivery = extractDestinationFromDeliveryAddress(invoice.delivery_address);
  if (fromDelivery) candidates.push(fromDelivery);

  // Explicit OCR country fields are authoritative over incoterms loading places.
  const fromOcr = extractDestinationFromOcrFields(invoice, exporterCountryCode);
  if (fromOcr) candidates.push(fromOcr);

  const fromIncoterms = extractDestinationFromIncoterms(
    invoice.incoterms,
    exporterCountryCode
  );
  if (fromIncoterms) candidates.push(fromIncoterms);

  return candidates;
}

export function buildDestinationCountryDiagnostics(
  invoice: NormalizedInvoice,
  resolved?: ResolvedDestination | null
): DestinationCountryDiagnostics {
  const exporterCountry = resolveExporterCountry(invoice);
  const consigneeResolved = resolveCountryFromText(invoice.consignee);
  const destination = resolved ?? resolveDestinationCandidates(invoice)[0] ?? null;

  const destinationCountryCode = destination?.code ?? null;
  const destinationCountry = destination?.name ?? null;

  return {
    exporterCountry,
    consigneeCountry: {
      code: consigneeResolved.country_code,
      name: consigneeResolved.country,
    },
    destinationCountry,
    destinationCountryCode,
    destinationCountrySource: destination?.source ?? "unresolved",
    isEuDestination: isEuDestinationCountry(destinationCountryCode),
  };
}

export function logDestinationCountryDiagnostics(
  diagnostics: DestinationCountryDiagnostics,
  context?: { invoiceNumber?: string; fileName?: string }
): void {
  console.log("[EXPORT-AUDITOR-RUNTIME] destinationCountry", {
    invoiceNumber: context?.invoiceNumber,
    fileName: context?.fileName,
    ...diagnostics,
  });
}

/**
 * Apply consignee-first destination business rule to a normalized invoice.
 *
 * Destination country must represent the consignee/importer — never exporter.
 * Consignee-derived country wins over OCR country fields and Incoterms place.
 */
export function resolveDestinationCountry(invoice: NormalizedInvoice): NormalizedInvoice {
  const { invoice: resolved } = resolveDestinationWithDiagnostics(invoice);
  return resolved;
}

export function resolveDestinationWithDiagnostics(invoice: NormalizedInvoice): {
  invoice: NormalizedInvoice;
  diagnostics: DestinationCountryDiagnostics;
} {
  const winner = resolveDestinationCandidates(invoice)[0] ?? null;
  const diagnostics = buildDestinationCountryDiagnostics(invoice, winner);

  if (!winner) {
    return { invoice, diagnostics };
  }

  const consigneeSources: DestinationCountrySource[] = [
    "consignee_postal_prefix",
    "consignee_country_name",
    "consignee_postal_city",
  ];
  let resolvedInvoice: NormalizedInvoice = {
    ...invoice,
    country: winner.name,
    country_code: winner.code,
  };
  if (consigneeSources.includes(winner.source)) {
    resolvedInvoice = appendProvenance(resolvedInvoice, {
      field: "destination_country",
      value: winner.code,
      source: "consignee_parser",
    });
  } else if (winner.source === "ocr_country_field") {
    resolvedInvoice = appendProvenance(resolvedInvoice, {
      field: "destination_country",
      value: winner.code,
      source: "ocr_fallback",
    });
  }

  return {
    invoice: resolvedInvoice,
    diagnostics,
  };
}
