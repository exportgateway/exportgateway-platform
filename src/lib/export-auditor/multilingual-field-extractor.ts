import type { DeliveryAddress, ShipmentSummary } from "@/lib/export-auditor/api-types";
import {
  buildLabelAlternation,
  buildLabelGroupPattern,
  buildSectionHeaderPattern,
  MULTILINGUAL_FIELD_LABELS,
  type InvoiceFieldLabelGroup,
} from "@/lib/export-auditor/multilingual-invoice-labels";
import { resolveCountryFromLine, resolveCountryFromText, COUNTRY_NAME_TO_CODE } from "@/lib/export-auditor/country-resolution";

const WEIGHT_UNIT_SUFFIX = "(?:[ \\t]+(kg|g|lb|ton|tonne|tons|tonnes)(?![a-zA-Z]))?";

function parseWeightNumber(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (/^\d+\.\d{1,3}$/.test(t)) return parseFloat(t);
  if (/^\d+,\d{1,3}$/.test(t)) return parseFloat(t.replace(",", "."));
  const normalized = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function matchLabeledValue(
  corpus: string,
  labelPattern: RegExp,
  valuePattern: RegExp
): RegExpMatchArray | null {
  const labelMatch = corpus.match(labelPattern);
  if (!labelMatch || labelMatch.index == null) return null;
  const afterLabel = corpus.slice(labelMatch.index + labelMatch[0].length);
  return afterLabel.match(valuePattern);
}

function buildWeightLabelPattern(
  group: "grossWeight" | "netWeight"
): RegExp {
  const alternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS[group]);
  return new RegExp(`(?:${alternation})(?=\\s*:|[\\s\\n]|$)\\s*:?\\s*`, "i");
}

function buildPackageLabelPattern(): RegExp {
  const alternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.packages);
  return new RegExp(`(?:${alternation})(?=\\s*:|[\\s\\n]|$)\\s*:?\\s*`, "i");
}

function buildPalletLabelPattern(): RegExp {
  const alternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.pallets);
  return new RegExp(`(?:${alternation})(?=\\s*:|[\\s\\n]|$)\\s*:?\\s*`, "i");
}

const VALUE_WEIGHT = new RegExp(`^\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i");
const VALUE_INT = /^\s*(\d+)/;

function inferPackageType(token: string | undefined): string | null {
  if (!token?.trim()) return null;
  const t = token.toLowerCase();
  if (/\bcartons?\b|\bctns?\b|\bbox(?:es)?\b|\bpkgs?\b/.test(t)) return "CT";
  if (/\bkoli\b|\bcolli\b|\bcollis\b|\bpaketi\b|\bstück\b|\bstuck\b/.test(t)) return "COLLI";
  if (/\bpalet|\bpallet/.test(t)) return "PALLET";
  return null;
}

export interface MultilingualShipmentMetrics {
  package_count: number | null;
  package_type: string | null;
  pallet_count: number | null;
  gross_weight_total: number | null;
  gross_weight_unit: string | null;
  net_weight_total: number | null;
  net_weight_unit: string | null;
}

const EMPTY_METRICS: MultilingualShipmentMetrics = {
  package_count: null,
  package_type: null,
  pallet_count: null,
  gross_weight_total: null,
  gross_weight_unit: null,
  net_weight_total: null,
  net_weight_unit: null,
};

/** Extract shipment metrics using the multilingual label dictionary. */
export function extractMultilingualShipmentMetrics(corpus: string): MultilingualShipmentMetrics {
  const result = { ...EMPTY_METRICS };

  const grossAlternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.grossWeight);
  const grossMatch =
    matchLabeledValue(corpus, buildWeightLabelPattern("grossWeight"), VALUE_WEIGHT) ??
    corpus.match(
      new RegExp(
        `(?:${grossAlternation})(?=\\s*:|[\\s\\n]|$)\\s*:?\\s*\\n?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`,
        "i"
      )
    );
  if (grossMatch) {
    result.gross_weight_total = parseWeightNumber(grossMatch[1]);
    result.gross_weight_unit = grossMatch[2]?.toLowerCase() ?? "kg";
  }

  const netAlternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.netWeight);
  const netMatch =
    matchLabeledValue(corpus, buildWeightLabelPattern("netWeight"), VALUE_WEIGHT) ??
    corpus.match(
      new RegExp(
        `(?:${netAlternation})(?=\\s*:|[\\s\\n]|$)\\s*:?\\s*\\n?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`,
        "i"
      )
    );
  if (netMatch) {
    result.net_weight_total = parseWeightNumber(netMatch[1]);
    result.net_weight_unit = netMatch[2]?.toLowerCase() ?? "kg";
  }

  const packageAlternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.packages);
  const packageMatch =
    matchLabeledValue(corpus, buildPackageLabelPattern(), VALUE_INT) ??
    corpus.match(
      new RegExp(`(?:${packageAlternation})(?=\\s*:|[\\s\\n]|$)\\s*:?\\s*\\n?\\s*(\\d+)`, "i")
    );
  if (packageMatch) {
    result.package_count = parseInt(packageMatch[1], 10);
    result.package_type = inferPackageType(packageMatch[0]) ?? "COLLI";
  }

  const palletAlternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.pallets);
  const palletMatch =
    matchLabeledValue(corpus, buildPalletLabelPattern(), VALUE_INT) ??
    corpus.match(
      new RegExp(`(\\d+)\\s*(?:x\\s*)?(?:${palletAlternation})(?=\\s*:|[\\s\\n]|$)`, "i")
    );
  if (palletMatch) {
    result.pallet_count = parseInt(palletMatch[1], 10);
    if (result.package_type == null) {
      result.package_type = "PALLET";
    }
  }

  return result;
}

const SECTION_BREAK =
  /^(?:skupaj|število|bruto|gross|net|paleta|pallet|invoice|račun|racun|datum|total|item|position|artikel|hs\s|tariff|valuta|currency)/i;

const SHIPMENT_METRIC_GROUPS: InvoiceFieldLabelGroup[] = [
  "grossWeight",
  "netWeight",
  "packages",
  "pallets",
];

function isShipmentMetricLine(line: string): boolean {
  return SHIPMENT_METRIC_GROUPS.some((group) => buildLabelGroupPattern(group).test(line));
}

function shouldBreakAddressBlock(
  line: string,
  blockLines: string[],
  breakOnSection?: RegExp
): boolean {
  if (blockLines.length === 0) return false;
  if (breakOnSection?.test(line)) return true;
  if (SECTION_BREAK.test(line) || isShipmentMetricLine(line)) return true;
  if (/\b[A-Z]{2}-\d{4,5}\b/i.test(line) && blockLines.some((l) => /\b[A-Z]{2}-\d{4,5}\b/i.test(l))) {
    return true;
  }
  return false;
}

function parseAddressBlock(blockLines: string[]): DeliveryAddress {
  const empty: DeliveryAddress = {
    company: null,
    address: null,
    city: null,
    postal_code: null,
    country: null,
    country_code: null,
  };
  if (blockLines.length === 0) return empty;

  let company: string | null = null;
  let address: string | null = null;
  let city: string | null = null;
  let postal_code: string | null = null;
  let country: string | null = null;
  let country_code: string | null = null;

  const postalRe = /\b([A-Z]{2}-\d{4,5})\b/i;

  function isPureCountryLine(line: string): boolean {
    const lower = line.trim().toLowerCase();
    return Object.keys(COUNTRY_NAME_TO_CODE).some((name) => lower === name);
  }

  for (const line of blockLines) {
    const cityPostal = line.match(/^(\d{4,5})\s+(.+)$/);
    if (cityPostal) {
      city = cityPostal[2].trim();
      const resolved = resolveCountryFromLine(cityPostal[2]);
      country = resolved.country ?? country;
      country_code = resolved.country_code ?? country_code;
      continue;
    }

    const prefixPostal = line.match(postalRe);
    if (prefixPostal && !postal_code) {
      postal_code = prefixPostal[1].toUpperCase();
      const resolved = resolveCountryFromLine(line);
      country = resolved.country ?? country;
      country_code = resolved.country_code ?? country_code;
      continue;
    }

    const fromCountry = resolveCountryFromLine(line);
    if (fromCountry.country_code && !country_code) {
      country = fromCountry.country;
      country_code = fromCountry.country_code;
      if (isPureCountryLine(line)) continue;
    }

    if (!company) company = line;
    else if (!address) address = line;
    else if (!city) city = line;
    else if (!country) {
      country = fromCountry.country ?? line;
      country_code = fromCountry.country_code ?? country_code;
    }
  }

  return { company, address, city, postal_code, country, country_code };
}

function extractLabeledAddressBlock(
  corpus: string,
  sectionPattern: RegExp,
  breakOnSection?: RegExp
): DeliveryAddress {
  const labelMatch = corpus.match(sectionPattern);
  if (!labelMatch || labelMatch.index == null) {
    return {
      company: null,
      address: null,
      city: null,
      postal_code: null,
      country: null,
      country_code: null,
    };
  }

  const remainder = corpus.slice(labelMatch.index + labelMatch[0].length);
  const blockLines: string[] = [];

  for (const raw of remainder.split(/\n/)) {
    const line = raw.trim();
    if (!line && blockLines.length > 0) break;
    if (shouldBreakAddressBlock(line, blockLines, breakOnSection)) break;
    if (line) blockLines.push(line);
    if (blockLines.length >= 8) break;
  }

  return parseAddressBlock(blockLines);
}

/** Extract consignee block text from multilingual section headers. */
export function extractMultilingualConsigneeBlock(corpus: string): string | null {
  const pattern = buildSectionHeaderPattern("consigneeSection");
  const labelMatch = corpus.match(pattern);
  if (!labelMatch || labelMatch.index == null) return null;

  const remainder = corpus.slice(labelMatch.index + labelMatch[0].length);
  const blockLines: string[] = [];
  const breakOnDelivery = buildSectionHeaderPattern("deliverySection");

  for (const raw of remainder.split(/\n/)) {
    const line = raw.trim();
    if (!line && blockLines.length > 0) break;
    if (shouldBreakAddressBlock(line, blockLines, breakOnDelivery)) break;
    if (line) blockLines.push(line);
    if (blockLines.length >= 8) break;
  }

  return blockLines.length > 0 ? blockLines.join("\n") : null;
}

/** Extract structured delivery / consignee address from multilingual section labels. */
export function extractMultilingualDeliveryAddress(corpus: string): DeliveryAddress {
  const fromDelivery = extractLabeledAddressBlock(
    corpus,
    buildSectionHeaderPattern("deliverySection"),
    buildSectionHeaderPattern("consigneeSection")
  );
  if (fromDelivery.company || fromDelivery.country_code) {
    return fromDelivery;
  }

  const consigneeBlock = extractMultilingualConsigneeBlock(corpus);
  if (consigneeBlock) {
    return parseAddressBlock(consigneeBlock.split(/\n/).map((l) => l.trim()).filter(Boolean));
  }

  return fromDelivery;
}

/** Extract origin country label value from corpus (footer / line annotations). */
export function extractMultilingualOriginCountry(corpus: string): {
  country: string | null;
  country_code: string | null;
} {
  const alternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.originCountry);
  const pattern = new RegExp(`(?:${alternation})(?=\\s*:|[\\s\\n]|$)\\s*:?\\s*([^\\n;]+)`, "i");
  const match = corpus.match(pattern);
  if (!match) return { country: null, country_code: null };
  return resolveCountryFromText(match[1]);
}

/** Detect preferential origin declaration keywords in corpus. */
export function detectMultilingualPreferentialOrigin(corpus: string): boolean {
  const alternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS.preferentialOrigin);
  return new RegExp(`(?:${alternation})(?=\\s|:|$)`, "i").test(corpus);
}

export function mergeMultilingualIntoShipmentSummary(
  base: ShipmentSummary,
  metrics: MultilingualShipmentMetrics
): ShipmentSummary {
  return {
    package_count: base.package_count ?? metrics.package_count,
    package_type: base.package_type ?? metrics.package_type,
    pallet_count: base.pallet_count ?? metrics.pallet_count,
    gross_weight_total: base.gross_weight_total ?? metrics.gross_weight_total,
    gross_weight_unit: base.gross_weight_unit ?? metrics.gross_weight_unit,
    net_weight_total: base.net_weight_total ?? metrics.net_weight_total,
    net_weight_unit: base.net_weight_unit ?? metrics.net_weight_unit,
    pallet_dimensions: base.pallet_dimensions,
  };
}
