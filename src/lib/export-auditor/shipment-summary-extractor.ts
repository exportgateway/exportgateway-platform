import type {
  ApiInvoiceItem,
  DeliveryAddress,
  NormalizedInvoice,
  ShipmentSummary,
} from "@/lib/export-auditor/api-types";
import { extractTabularShipmentMetrics } from "@/lib/export-auditor/tabular-shipment-extractor";
import {
  extractMultilingualDeliveryAddress,
  extractMultilingualShipmentMetrics,
  mergeMultilingualIntoShipmentSummary,
} from "@/lib/export-auditor/multilingual-field-extractor";
import { DELIVERY_SECTION_LABELS } from "@/lib/export-auditor/multilingual-invoice-labels";
import { appendProvenance, type ExtractionProvenanceEntry } from "@/lib/export-auditor/extraction-provenance";
import { recordParserRecovery } from "@/lib/export-auditor/parser-recovery-provenance";
import { applyWeightHierarchyToShipmentSummary } from "@/lib/export-auditor/weight-extraction-hierarchy";
import { aggregateLineNetWeightsForShipment } from "@/lib/export-auditor/weight-line-aggregation";

const EMPTY_SHIPMENT_SUMMARY: ShipmentSummary = {
  package_count: null,
  package_type: null,
  gross_weight_total: null,
  gross_weight_unit: null,
  net_weight_total: null,
  net_weight_unit: null,
  pallet_dimensions: null,
  pallet_count: null,
};

const EMPTY_DELIVERY_ADDRESS: DeliveryAddress = {
  company: null,
  address: null,
  city: null,
  postal_code: null,
  country: null,
  country_code: null,
};

const SECTION_BREAK =
  /^(?:skupaj|število|bruto|gross|paleta|pallet|invoice|račun|racun|datum|total|item|position|artikel|hs\s|tariff)/i;

const POSTAL_PREFIX_COUNTRIES: Record<string, { code: string; name: string }> = {
  MK: { code: "MK", name: "North Macedonia" },
  RS: { code: "RS", name: "Serbia" },
  BA: { code: "BA", name: "Bosnia and Herzegovina" },
  AL: { code: "AL", name: "Albania" },
  XK: { code: "XK", name: "Kosovo" },
  ME: { code: "ME", name: "Montenegro" },
  SI: { code: "SI", name: "Slovenia" },
  HR: { code: "HR", name: "Croatia" },
  AT: { code: "AT", name: "Austria" },
  DE: { code: "DE", name: "Germany" },
  IT: { code: "IT", name: "Italy" },
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  serbia: "RS",
  srbija: "RS",
  "north macedonia": "MK",
  makedonija: "MK",
  slovenia: "SI",
  slovenija: "SI",
  croatia: "HR",
  hrvatska: "HR",
  bosnia: "BA",
  albania: "AL",
  montenegro: "ME",
  "crna gora": "ME",
  kosovo: "XK",
  austria: "AT",
  österreich: "AT",
  germany: "DE",
  deutschland: "DE",
  italy: "IT",
  italia: "IT",
};

function normalizeDimensions(raw: string): string {
  const dim = raw.replace(/\s+/g, "").replace(/×/gi, "x");
  return dim.replace(/(\d)(cm)$/i, "$1 $2");
}

function parseWeightNumber(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (/^\d+\.\d{1,3}$/.test(t)) return parseFloat(t);
  if (/^\d+,\d{1,3}$/.test(t)) return parseFloat(t.replace(",", "."));
  const normalized = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Same-line unit suffix — space/tab only; never `\s` (avoids "62" + newline + "Tara" → unit "t"). */
const WEIGHT_UNIT_SUFFIX = "(?:[ \\t]+(kg|g|lb|ton|tonne|tons|tonnes)(?![a-zA-Z]))?";

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

function resolveCapturedWeightUnit(
  match: RegExpMatchArray,
  unitIndex: number,
  hasValue: boolean
): string | null {
  if (!hasValue) return null;
  const raw = match[unitIndex]?.toLowerCase();
  if (raw && /^(kg|g|lb|ton|tonne|tons|tonnes)$/.test(raw)) return raw;
  return "kg";
}

function inferPackageType(token: string | undefined): string | null {
  if (!token?.trim()) return null;
  const t = token.toLowerCase();
  if (/\bcartons?\b|\bctns?\b|\bbox(?:es)?\b|\bpkgs?\b/.test(t)) return "CT";
  if (/\bkoli\b|\bcolli\b|\bcollis\b/.test(t)) return "COLLI";
  if (/\bpalet|\bpallet/.test(t)) return "PALLET";
  return null;
}

/** Match 35 CARTONS (1 PALLETE) and similar packing lines. */
const PACKING_PACKAGE_RE =
  /(\d+)[ \t]*(cartons?|carton|ctns?|ctn|boxes|box|pkgs?|pkg|collis?|colli)\b(?:[ \t]*[\(\[][ \t]*(\d+)[ \t]*pal+\w*[ \t]*[\)\]])?/gi;

const CARTON_LABEL_PACKAGE_RE =
  /\bcartons?\s+(?:nr\.?|no\.?|number)?\s*(\d+)\b/i;

function extractPalletFromParens(text: string): number | null {
  const match = text.match(/[\(\[]\s*(\d+)\s*pal+\w*\s*[\)\]]/i);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  return Number.isFinite(count) ? count : null;
}

function extractPackingLinePackages(corpus: string): Pick<
  ShipmentSummary,
  "package_count" | "package_type" | "pallet_count"
> {
  const packingSection =
    corpus.match(/\bpacking\s*:\s*([^\n]+)/i)?.[1] ??
    corpus.match(/\bpackaging\s*:\s*([^\n]+)/i)?.[1];

  const searchBlocks = packingSection ? [packingSection] : [corpus];

  for (const block of searchBlocks) {
    const labelMatch = block.match(CARTON_LABEL_PACKAGE_RE);
    if (labelMatch) {
      const count = parseInt(labelMatch[1], 10);
      if (Number.isFinite(count)) {
        return {
          package_count: count,
          package_type: "CT",
          pallet_count: extractPalletFromParens(block),
        };
      }
    }

    PACKING_PACKAGE_RE.lastIndex = 0;
    const match = PACKING_PACKAGE_RE.exec(block);
    if (!match) continue;

    const count = parseInt(match[1], 10);
    if (!Number.isFinite(count)) continue;

    const packageType = inferPackageType(match[2]) ?? "CT";
    const palletInParens =
      match[3] != null ? parseInt(match[3], 10) : extractPalletFromParens(block);

    return {
      package_count: count,
      package_type: packageType,
      pallet_count: Number.isFinite(palletInParens!) ? palletInParens : null,
    };
  }

  const cartonLabelMatch = corpus.match(CARTON_LABEL_PACKAGE_RE);
  if (cartonLabelMatch) {
    const count = parseInt(cartonLabelMatch[1], 10);
    if (Number.isFinite(count)) {
      return {
        package_count: count,
        package_type: "CT",
        pallet_count: extractPalletFromParens(cartonLabelMatch[0]),
      };
    }
  }

  PACKING_PACKAGE_RE.lastIndex = 0;
  const globalMatch = PACKING_PACKAGE_RE.exec(corpus);
  if (globalMatch) {
    const count = parseInt(globalMatch[1], 10);
    const packageType = inferPackageType(globalMatch[2]) ?? "CT";
    const palletInParens =
      globalMatch[3] != null
        ? parseInt(globalMatch[3], 10)
        : extractPalletFromParens(globalMatch[0]);

    if (Number.isFinite(count)) {
      return {
        package_count: count,
        package_type: packageType,
        pallet_count: Number.isFinite(palletInParens!) ? palletInParens : null,
      };
    }
  }

  return { package_count: null, package_type: null, pallet_count: null };
}

/** Collect invoice-level text for shipment extraction — never line items. */
export function collectShipmentCorpus(invoice: NormalizedInvoice): string {
  const parts: string[] = [];

  if (invoice.ocr_text?.trim()) {
    parts.push(invoice.ocr_text.trim());
  }

  const scalarKeys = [
    "vat_article",
    "exporter",
    "consignee",
    "incoterms",
    "invoice_number",
    "invoice_date",
    "country",
    "currency",
    "origin_declaration_text",
    "shipment_notes",
    "packing_info",
    "footer_text",
    "delivery_notes",
  ] as const;

  for (const key of scalarKeys) {
    const value = invoice[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    }
  }

  for (const value of Object.values(invoice.document_flags ?? {})) {
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    }
  }

  if (invoice.preference_declarations?.length) {
    for (const entry of invoice.preference_declarations) {
      if (entry?.trim()) parts.push(entry.trim());
    }
  }

  return parts.join("\n");
}

/** Extract footer-style shipment metrics (Gross/Gross, Bruto/Gross, Netto/Nett, Colli, Pallets). */
export function extractFooterShipmentMetrics(corpus: string): Pick<
  ShipmentSummary,
  | "package_count"
  | "package_type"
  | "pallet_count"
  | "gross_weight_total"
  | "gross_weight_unit"
  | "net_weight_total"
  | "net_weight_unit"
> {
  const tabular = extractTabularShipmentMetrics(corpus);
  const packing = extractPackingLinePackages(corpus);
  const colliMatch =
    matchLabeledValue(corpus, /\bkoli\s*:?\s*/i, /^\s*(\d+)/i) ??
    matchLabeledValue(corpus, /\bkosov\s*:?\s*/i, /^\s*(\d+)/i) ??
    corpus.match(/\bkoli\s*\/\s*colli\s*:?\s*(\d+)/i) ??
    corpus.match(/\bcolli\s*=?\s*(\d+)/i) ??
    corpus.match(/\bcolli\s*:\s*(\d+)/i) ??
    corpus.match(/\bcollis?\s*:?\s*(\d+)/i) ??
    corpus.match(/\bkosov\s*:?\s*(\d+)/i) ??
    corpus.match(/\b(\d+)\s+kosov\b/i);
  const palletMatch =
    corpus.match(/\b(\d+)\s*x\s*pallets?\b/i) ??
    corpus.match(/\b(\d+)\s*x\s*palet(?:a|e|s)?\b/i) ??
    corpus.match(/\b(\d+)\s+pallets?\s*:/i) ??
    corpus.match(/\b(\d+)\s+palet(?:a|e|s)?\s*:/i) ??
    corpus.match(/\bpalete\s*\/\s*paletts?\s*:?\s*(\d+)/i) ??
    corpus.match(/\bpallets?\s*=?\s*(\d+)/i) ??
    corpus.match(/\bpalet(?:a|e|s)?\s*:\s*(\d+)/i);
  const grossMatch =
    matchLabeledValue(
      corpus,
      /\bbruto\s+te[žz]a\s*:?\s*/i,
      new RegExp(`^\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")
    ) ??
    matchLabeledValue(
      corpus,
      /\bbruto\s+teza\s*:?\s*/i,
      new RegExp(`^\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")
    ) ??
    corpus.match(new RegExp(`\\bbtto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bbrutto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bbruto\\s*\\/\\s*gross\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bgross\\s*\\/\\s*gross\\s*=:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bbruto\\s*\\/\\s*gross\\s*=:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bgross\\s+weight\\s*:?\\s*(kg|km|g|lb|ton|tonne|tons|tonnes)[ \\t]+([\\d.,]+)`, "i")) ??
    corpus.match(new RegExp(`\\bgross\\s+weight\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bgross\\s*:\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"));
  const netMatch =
    corpus.match(new RegExp(`\\bntto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bnetto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bneto\\s*\\/\\s*nett?\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bnetto\\s*\\/\\s*nett?\\s*=:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bnet\\s+weight\\s*:?\\s*(kg|g|lb|ton|tonne|tons|tonnes)[ \\t]+([\\d.,]+)`, "i")) ??
    corpus.match(new RegExp(`\\bnet\\s+weight\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bnet(?:to|t)?\\s*:\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i")) ??
    corpus.match(new RegExp(`\\bnett?\\s*=\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"));

  const grossUnitBeforeValue = grossMatch?.[1] != null && grossMatch?.[2] != null && /^(kg|km|g|lb|ton|tonne|tons|tonnes)$/i.test(grossMatch[1]);
  const netUnitBeforeValue = netMatch?.[1] != null && netMatch?.[2] != null && /^(kg|g|lb|ton|tonne|tons|tonnes)$/i.test(netMatch[1]);
  const grossTotal = grossMatch ? parseWeightNumber(grossUnitBeforeValue ? grossMatch[2] : grossMatch[1]) : null;
  const netTotal = netMatch ? parseWeightNumber(netUnitBeforeValue ? netMatch[2] : netMatch[1]) : null;

  const package_count =
    packing.package_count ??
    tabular.package_count ??
    (colliMatch ? parseInt(colliMatch[1], 10) : null);
  const package_type =
    packing.package_type ?? (colliMatch ? "COLLI" : null);
  const pallet_count =
    packing.pallet_count ?? (palletMatch ? parseInt(palletMatch[1], 10) : null);

  const base: ShipmentSummary = {
    package_count,
    package_type,
    pallet_count,
    gross_weight_total: grossTotal ?? tabular.gross_weight_total,
    gross_weight_unit:
      (grossUnitBeforeValue ? (grossMatch![1].toLowerCase() === "km" ? "kg" : grossMatch![1].toLowerCase()) : null) ??
      (grossMatch ? resolveCapturedWeightUnit(grossMatch, 2, grossTotal != null) : null) ??
      tabular.gross_weight_unit,
    net_weight_total: netTotal ?? tabular.net_weight_total,
    net_weight_unit:
      (netUnitBeforeValue ? netMatch![1].toLowerCase() : null) ??
      (netMatch ? resolveCapturedWeightUnit(netMatch, 2, netTotal != null) : null) ??
      tabular.net_weight_unit,
    pallet_dimensions: null,
  };

  return mergeMultilingualIntoShipmentSummary(base, extractMultilingualShipmentMetrics(corpus));
}

/** Extract package count and type from shipment-level labels only. */
export function extractPackageCount(corpus: string): Pick<ShipmentSummary, "package_count" | "package_type"> {
  const footer = extractFooterShipmentMetrics(corpus);
  if (footer.package_count != null) {
    return {
      package_count: footer.package_count,
      package_type: footer.package_type ?? "COLLI",
    };
  }

  const patterns: Array<{
    re: RegExp;
    typeIndex?: number;
  }> = [
    { re: /\bcartons?\s+(?:nr\.?|no\.?|number)?\s*(\d+)\b/i, typeIndex: 0 },
    { re: /(\d+)[ \t]*(cartons?|carton|ctns?|ctn|boxes|box|pkgs?|pkg|collis?|colli)\b(?:[ \t]*[\(\[][ \t]*\d+[ \t]*palet(?:t)?(?:e|a|s)?[ \t]*[\)\]])?/i, typeIndex: 2 },
    { re: /skupaj\s+število\s*[:\-]?\s*(\d+)\s*(koli|colli|palet(?:a|e|i)?|pallets?)?/i, typeIndex: 2 },
    { re: /število\s+koli\s*[:\-]?\s*(\d+)/i },
    { re: /number\s+of\s+packages?\s*[:\-]?\s*(\d+)/i },
    { re: /packages?\s*[:\-]?\s*(\d+)/i },
    { re: /(\d+)\s*x\s+pallets?\b/i, typeIndex: 0 },
    { re: /(\d+)\s*x\s+palet(?:a|e|i)?\b/i, typeIndex: 0 },
    { re: /(\d+)\s+pallets?\s*:/i, typeIndex: 0 },
    { re: /(\d+)\s+palet(?:a|e|i)?\s*:/i, typeIndex: 0 },
    { re: /(\d+)\s+pallets?\b/i, typeIndex: 0 },
    { re: /(\d+)\s+Pallet\(s\)/i, typeIndex: 0 },
    { re: /(\d+)\s+palet(?:a|e|i)?\b/i, typeIndex: 0 },
    { re: /(\d+)\s+koli\b/i, typeIndex: 0 },
    { re: /(\d+)\s+colli\b/i, typeIndex: 0 },
    { re: /\bkoli\s*[:\-]?\s*(\d+)/i },
    { re: /\bkosov\s*[:\-]?\s*(\d+)/i },
    { re: /\bcolli\s*[:\-]?\s*(\d+)/i },
  ];

  for (const { re, typeIndex } of patterns) {
    const match = corpus.match(re);
    if (!match) continue;

    const count = parseInt(match[1], 10);
    if (!Number.isFinite(count)) continue;

    let packageType: string | null = null;
    if (typeIndex !== undefined && typeIndex > 0) {
      packageType = inferPackageType(match[typeIndex]);
    } else if (/palet|pallet/i.test(match[0])) {
      packageType = "PALLET";
    } else if (/carton|ctn|box|pkg/i.test(match[0])) {
      packageType = "CT";
    } else if (/koli|colli|collis/i.test(match[0])) {
      packageType = "COLLI";
    } else if (typeIndex === 0) {
      packageType = inferPackageType(/palet|pallet/i.test(match[0]) ? "pallet" : "koli");
    }

    return { package_count: count, package_type: packageType };
  }

  return { package_count: null, package_type: null };
}

/** Extract gross shipment weight from shipment-level labels only. */
export function extractGrossWeight(
  corpus: string
): Pick<ShipmentSummary, "gross_weight_total" | "gross_weight_unit"> {
  const footer = extractFooterShipmentMetrics(corpus);
  if (footer.gross_weight_total != null) {
    return {
      gross_weight_total: footer.gross_weight_total,
      gross_weight_unit: footer.gross_weight_unit,
    };
  }

  const patterns = [
    new RegExp(`\\bbruto\\s+te[žz]a\\s*:?\\s*\\n?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bbruto\\s+teza\\s*:?\\s*\\n?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bbtto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bbrutto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bbruto\\s*\\/\\s*gross\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bgross\\s*:\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bgross\\s+weight\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bbruto\\s*:\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bbruto\\s*\\/\\s*gross\\s*=:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`skupna\\s+bruto\\s+teža\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`bruto\\s+teža\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`Gross\\s+Weight\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`),
    /GrossWeight\s*\(\s*kg\s*\)\s*([\d.,]+)/i,
  ];

  for (const re of patterns) {
    const match = corpus.match(re);
    if (!match) continue;
    const total = parseWeightNumber(match[1]);
    if (total == null) continue;
    const unit =
      resolveCapturedWeightUnit(match, 2, true) ||
      (/\(\s*kg\s*\)/i.test(match[0]) ? "kg" : "kg");
    return { gross_weight_total: total, gross_weight_unit: unit };
  }

  return { gross_weight_total: null, gross_weight_unit: null };
}

/** Sum line-item net weights (line totals, not unit weights) when present on invoice rows. */
export function extractLineItemNetWeightTotal(
  items: ApiInvoiceItem[] | undefined,
  documentGross?: number | null
): Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit"> {
  const aggregation = aggregateLineNetWeightsForShipment(items, documentGross);
  return {
    net_weight_total: aggregation.net_weight_total,
    net_weight_unit: aggregation.net_weight_unit,
  };
}

/** @deprecated Use aggregateLineNetWeightsForShipment for unit-weight detection. */
export function extractLineItemNetWeightTotalLegacy(
  items: ApiInvoiceItem[] | undefined
): Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit"> {
  if (!items?.length) {
    return { net_weight_total: null, net_weight_unit: null };
  }

  let total = 0;
  let weightedLines = 0;

  for (const item of items) {
    if (item.net_weight == null) continue;
    const weight = parseWeightNumber(String(item.net_weight));
    if (weight == null) continue;
    total += weight;
    weightedLines += 1;
  }

  if (weightedLines === 0) {
    return { net_weight_total: null, net_weight_unit: null };
  }

  return { net_weight_total: total, net_weight_unit: "kg" };
}

/** Extract document-level net weight from labelled totals — never from line items. */
export function extractNetWeightFromDocument(
  corpus: string
): Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit"> {
  const labelPatterns = [
    new RegExp(`\\bntto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`\\bnetto\\s*:?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`total\\s+weight\\s+net\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`net\\s+weight\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`Net\\s+Weight\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`),
    new RegExp(`weight\\s+net\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`nett?\\s*\\/\\s*netto\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    new RegExp(`netto\\s+weight\\s*[:\\-]?\\s*([\\d.,]+)${WEIGHT_UNIT_SUFFIX}`, "i"),
    /NetWeight\s*\(\s*kg\s*\)\s*([\d.,]+)/i,
  ];

  for (const re of labelPatterns) {
    const match = corpus.match(re);
    if (!match) continue;
    const total = parseWeightNumber(match[1]);
    if (total == null) continue;
    const unit = resolveCapturedWeightUnit(match, 2, true) || "kg";
    return { net_weight_total: total, net_weight_unit: unit };
  }

  const footer = extractFooterShipmentMetrics(corpus);
  if (footer.net_weight_total != null) {
    return {
      net_weight_total: footer.net_weight_total,
      net_weight_unit: footer.net_weight_unit,
    };
  }

  return { net_weight_total: null, net_weight_unit: null };
}

/** Extract shipment-level net weight — document labels first, line items as fallback only. */
export function extractNetWeight(
  corpus: string,
  items?: ApiInvoiceItem[]
): Pick<ShipmentSummary, "net_weight_total" | "net_weight_unit"> {
  const fromDocument = extractNetWeightFromDocument(corpus);
  if (fromDocument.net_weight_total != null) {
    return fromDocument;
  }

  const fromLines = extractLineItemNetWeightTotal(items);
  if (fromLines.net_weight_total != null) {
    return fromLines;
  }

  return { net_weight_total: null, net_weight_unit: null };
}

/** Extract pallet dimensions from shipment-level labels only. */
export function extractPalletDimensions(corpus: string): string | null {
  const labeled = [
    /paleta\s+dimenzije\s*[:\-]?\s*(\d{2,3}\s*[x×]\s*\d{2,3}\s*[x×]\s*\d{2,3}\s*cm)/i,
    /pallet\s+dimensions?\s*[:\-]?\s*(\d{2,3}\s*[x×]\s*\d{2,3}\s*[x×]\s*\d{2,3}\s*cm)/i,
  ];

  for (const re of labeled) {
    const match = corpus.match(re);
    if (match) {
      return normalizeDimensions(match[1]);
    }
  }

  const nearKeyword =
    /(?:paleta|pallet|dimenzij|dimension)[^\n]{0,40}(\d{2,3}\s*[x×]\s*\d{2,3}\s*[x×]\s*\d{2,3}\s*cm)/i;
  const nearMatch = corpus.match(nearKeyword);
  if (nearMatch) {
    return normalizeDimensions(nearMatch[1]);
  }

  return null;
}

function resolveCountryFromLine(line: string): { country: string | null; country_code: string | null } {
  const prefixMatch = line.match(/\b(MK|RS|BA|AL|XK|ME|SI|HR|AT|DE|IT)-(\d{4,5})\b/i);
  if (prefixMatch) {
    const mapped = POSTAL_PREFIX_COUNTRIES[prefixMatch[1].toUpperCase()];
    if (mapped) {
      return { country: mapped.name, country_code: mapped.code };
    }
  }

  const lower = line.toLowerCase().trim();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (lower === name || lower.includes(name)) {
      const countryName = POSTAL_PREFIX_COUNTRIES[code]?.name ?? name;
      return { country: countryName, country_code: code };
    }
  }

  return { country: null, country_code: null };
}

function parseDeliveryBlock(lines: string[]): DeliveryAddress {
  if (lines.length === 0) return { ...EMPTY_DELIVERY_ADDRESS };

  let company: string | null = null;
  let address: string | null = null;
  let city: string | null = null;
  let postal_code: string | null = null;
  let country: string | null = null;
  let country_code: string | null = null;

  const postalRe = /\b([A-Z]{2}-\d{4,5})\b/i;
  const cityPostalRe = /^(.+?)\s+([A-Z]{2}-\d{4,5})\s*(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cityPostal = line.match(cityPostalRe);
    if (cityPostal) {
      city = cityPostal[1].trim();
      postal_code = cityPostal[2].toUpperCase();
      const prefix = postal_code.split("-")[0];
      const mapped = POSTAL_PREFIX_COUNTRIES[prefix as keyof typeof POSTAL_PREFIX_COUNTRIES];
      if (mapped) {
        country = mapped.name;
        country_code = mapped.code;
      }
      if (cityPostal[3]?.trim() && !country) {
        const extra = resolveCountryFromLine(cityPostal[3]);
        country = extra.country ?? country;
        country_code = extra.country_code ?? country_code;
      }
      continue;
    }

    const postalOnly = line.match(postalRe);
    if (postalOnly && !postal_code) {
      postal_code = postalOnly[1].toUpperCase();
      const prefix = postal_code.split("-")[0];
      const mapped = POSTAL_PREFIX_COUNTRIES[prefix as keyof typeof POSTAL_PREFIX_COUNTRIES];
      if (mapped && !country_code) {
        country = mapped.name;
        country_code = mapped.code;
      }
      const cityPart = line.replace(postalRe, "").replace(/[,;]/g, "").trim();
      if (cityPart && !city) city = cityPart;
      continue;
    }

    const fromCountry = resolveCountryFromLine(line);
    if (fromCountry.country && !country && !postalRe.test(line)) {
      country = fromCountry.country;
      country_code = fromCountry.country_code;
      if (line.split(/\s+/).length <= 2) continue;
    }

    if (!company) {
      company = line;
    } else if (!address) {
      address = line;
    } else if (!city) {
      city = line;
    } else if (!country) {
      const resolved = resolveCountryFromLine(line);
      country = resolved.country ?? line;
      country_code = resolved.country_code;
    }
  }

  return { company, address, city, postal_code, country, country_code };
}

/** Extract delivery address from labeled section — separate from consignee. */
export function extractDeliveryAddress(corpus: string): DeliveryAddress {
  const multilingual = extractMultilingualDeliveryAddress(corpus);
  if (
    multilingual.company?.trim() ||
    multilingual.address?.trim() ||
    multilingual.country_code?.trim()
  ) {
    return multilingual;
  }

  const labelMatch = corpus.match(DELIVERY_SECTION_LABELS);
  if (!labelMatch || labelMatch.index == null) {
    return { ...EMPTY_DELIVERY_ADDRESS };
  }

  const remainder = corpus.slice(labelMatch.index + labelMatch[0].length);
  const rawLines = remainder.split(/\n/);
  const blockLines: string[] = [];

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line && blockLines.length > 0) break;
    if (SECTION_BREAK.test(line) && blockLines.length > 0) break;
    if (line) blockLines.push(line);
    if (blockLines.length >= 8) break;
  }

  return parseDeliveryBlock(blockLines);
}

export function extractShipmentSummary(
  corpus: string,
  items?: ApiInvoiceItem[]
): ShipmentSummary {
  const footer = extractFooterShipmentMetrics(corpus);
  const pkg = extractPackageCount(corpus);
  const weight = extractGrossWeight(corpus);
  const netWeight = extractNetWeightFromDocument(corpus);
  const pallet_dimensions = extractPalletDimensions(corpus);

  let package_type = footer.package_type ?? pkg.package_type;
  if (footer.package_count != null && !package_type) {
    package_type = "COLLI";
  } else if (pkg.package_count != null && !package_type) {
    if (/\bcartons?|\bctns?|\bbox|\bpkgs?\b/i.test(corpus)) package_type = "CT";
    else if (/\bkoli\b|\bcolli\b/i.test(corpus)) package_type = "COLLI";
    else if (/\bpalet|\bpallet|Pallet\(s\)/i.test(corpus)) package_type = "PALLET";
  }

  let pallet_count = footer.pallet_count;
  if (pallet_count == null && pkg.package_type === "PALLET" && pkg.package_count != null) {
    pallet_count = pkg.package_count;
  }

  return {
    package_count:
      footer.package_count ??
      (pkg.package_type === "PALLET" ? null : pkg.package_count),
    package_type,
    gross_weight_total: footer.gross_weight_total ?? weight.gross_weight_total,
    gross_weight_unit: footer.gross_weight_unit ?? weight.gross_weight_unit,
    net_weight_total: footer.net_weight_total ?? netWeight.net_weight_total,
    net_weight_unit: footer.net_weight_unit ?? netWeight.net_weight_unit,
    pallet_dimensions,
    pallet_count,
  };
}

function mergeShipmentSummary(
  existing: ShipmentSummary | undefined,
  extracted: ShipmentSummary
): ShipmentSummary {
  const base = existing ?? EMPTY_SHIPMENT_SUMMARY;
  return {
    package_count: base.package_count ?? extracted.package_count,
    package_type: base.package_type ?? extracted.package_type,
    gross_weight_total: base.gross_weight_total ?? extracted.gross_weight_total,
    gross_weight_unit: base.gross_weight_unit ?? extracted.gross_weight_unit,
    gross_weight_source: base.gross_weight_source ?? extracted.gross_weight_source,
    gross_weight_type: base.gross_weight_type ?? extracted.gross_weight_type,
    net_weight_total: base.net_weight_total ?? extracted.net_weight_total,
    net_weight_unit: base.net_weight_unit ?? extracted.net_weight_unit,
    net_weight_source: base.net_weight_source ?? extracted.net_weight_source,
    net_weight_type: base.net_weight_type ?? extracted.net_weight_type,
    pallet_dimensions: base.pallet_dimensions ?? extracted.pallet_dimensions,
    pallet_count: base.pallet_count ?? extracted.pallet_count,
  };
}

const SHIPMENT_PROVENANCE_FIELDS: Array<{
  key: keyof Pick<
    ShipmentSummary,
    "package_count" | "gross_weight_total" | "net_weight_total" | "pallet_count"
  >;
  field: string;
}> = [
  { key: "package_count", field: "package_count" },
  { key: "gross_weight_total", field: "gross_weight_total" },
  { key: "net_weight_total", field: "net_weight_total" },
  { key: "pallet_count", field: "pallet_count" },
];

function provenanceForFilledShipmentFields(
  existing: ShipmentSummary | undefined,
  merged: ShipmentSummary
): ExtractionProvenanceEntry[] {
  const base = existing ?? EMPTY_SHIPMENT_SUMMARY;
  const entries: ExtractionProvenanceEntry[] = [];
  for (const { key, field } of SHIPMENT_PROVENANCE_FIELDS) {
    if (base[key] == null && merged[key] != null) {
      entries.push({
        field,
        value: String(merged[key]),
        source: "heuristic_recovery",
      });
    }
  }
  return entries;
}

function mergeDeliveryAddress(
  existing: DeliveryAddress | undefined,
  extracted: DeliveryAddress
): DeliveryAddress {
  const base = existing ?? EMPTY_DELIVERY_ADDRESS;
  return {
    company: base.company ?? extracted.company,
    address: base.address ?? extracted.address,
    city: base.city ?? extracted.city,
    postal_code: base.postal_code ?? extracted.postal_code,
    country: base.country ?? extracted.country,
    country_code: base.country_code ?? extracted.country_code,
  };
}

/**
 * Resolve gross weight from enriched shipment summary or any invoice text (footer, OCR, labels).
 * Returns a positive weight when found anywhere on the document.
 */
export function resolveInvoiceGrossWeight(
  invoice: NormalizedInvoice
): Pick<ShipmentSummary, "gross_weight_total" | "gross_weight_unit"> {
  const summaryWeight = invoice.shipment_summary?.gross_weight_total;
  if (summaryWeight != null && summaryWeight > 0) {
    return {
      gross_weight_total: summaryWeight,
      gross_weight_unit: invoice.shipment_summary?.gross_weight_unit ?? "kg",
    };
  }

  const corpusParts = [collectShipmentCorpus(invoice)];
  if (invoice.ocr_text?.trim()) {
    corpusParts.push(invoice.ocr_text.trim());
  }
  if (invoice.footer_text?.trim()) {
    corpusParts.push(invoice.footer_text.trim());
  }

  const extracted = extractGrossWeight(corpusParts.join("\n"));
  if (extracted.gross_weight_total != null && extracted.gross_weight_total > 0) {
    return extracted;
  }

  return { gross_weight_total: null, gross_weight_unit: null };
}

export function hasInvoiceGrossWeight(invoice: NormalizedInvoice): boolean {
  const { gross_weight_total } = resolveInvoiceGrossWeight(invoice);
  return gross_weight_total != null && gross_weight_total > 0;
}

/**
 * Enrich normalized invoice with shipment summary and delivery address.
 * Uses OCR structured fields when present; fills gaps from shipment-level text patterns.
 * Never infers package count or weight from line items.
 */
export function enrichInvoiceShipmentData(invoice: NormalizedInvoice): NormalizedInvoice {
  const corpus = collectShipmentCorpus(invoice);
  const extractedSummary = extractShipmentSummary(corpus, invoice.items);
  const extractedDelivery = extractDeliveryAddress(corpus);
  const mergedSummary = mergeShipmentSummary(invoice.shipment_summary, extractedSummary);
  const documentGross = extractGrossWeight(corpus);
  const resolvedGross =
    mergedSummary.gross_weight_total ?? documentGross.gross_weight_total ?? null;
  const lineAggregation = aggregateLineNetWeightsForShipment(invoice.items, resolvedGross);
  const hierarchySummary = applyWeightHierarchyToShipmentSummary(mergedSummary, {
    documentNet: extractNetWeightFromDocument(corpus),
    documentGross,
    calculatedNet: {
      net_weight_total: lineAggregation.net_weight_total,
      net_weight_unit: lineAggregation.net_weight_unit,
    },
    unitWeightMisuseLikely: lineAggregation.unitWeightMisuseLikely,
  });

  let enriched: NormalizedInvoice = {
    ...invoice,
    shipment_summary: hierarchySummary,
    delivery_address: mergeDeliveryAddress(invoice.delivery_address, extractedDelivery),
  };

  for (const entry of provenanceForFilledShipmentFields(invoice.shipment_summary, hierarchySummary)) {
    enriched = appendProvenance(enriched, entry);
  }

  const parserGross = enriched.parser_input_snapshot?.gross_weight_total ?? 0;
  const finalGross = hierarchySummary.gross_weight_total ?? 0;
  if (
    parserGross <= 0 &&
    finalGross > 0 &&
    !enriched.parser_recovery_provenance?.some((entry) => entry.field === "gross_weight")
  ) {
    enriched = recordParserRecovery(enriched, {
      field: "gross_weight",
      original_value: null,
      recovered_value: String(finalGross),
      recovery_source: "WEIGHT_HIERARCHY_RECOVERY",
    });
  }

  const parserNet = enriched.parser_input_snapshot?.net_weight_total ?? 0;
  const finalNet = hierarchySummary.net_weight_total ?? 0;
  if (
    parserNet <= 0 &&
    finalNet > 0 &&
    !enriched.parser_recovery_provenance?.some((entry) => entry.field === "net_weight")
  ) {
    enriched = recordParserRecovery(enriched, {
      field: "net_weight",
      original_value: null,
      recovered_value: String(finalNet),
      recovery_source: "WEIGHT_HIERARCHY_RECOVERY",
    });
  }

  return enriched;
}
