import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  FALLBACK_SOURCES,
  type ExtractionProvenanceEntry,
  type ExtractionSource,
  provenanceBreakdown,
} from "@/lib/export-auditor/extraction-provenance";
import { extractGenericHsCodes } from "@/lib/export-auditor/hs-code-extraction-engine";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import type { ConfidenceScores } from "@/lib/export-auditor/types";
import {
  filterGoodsLines,
  normalizeAggregationItems,
  runHsAggregationEngine,
} from "@/lib/export-auditor/hs-aggregation-engine";
import { buildPositionTraceability } from "@/lib/export-auditor/position-traceability";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import {
  TOTAL_MISMATCH,
} from "@/lib/export-auditor/invoice-total-consistency-validator";
import {
  HS_AGGREGATION_MISSING,
  TRACEABILITY_MISSING,
} from "@/lib/export-auditor/extraction-integrity-validator";

const SOURCE_PENALTIES: Partial<Record<ExtractionSource, number>> = {
  ocr_fallback: 3,
  heuristic_recovery: 5,
  regex_rescue: 2,
};

const OCR_FALLBACK_CAP = 97;
const HEURISTIC_CAP = 95;
const MULTI_FALLBACK_CAP = 92;
const CUSTOMS_CRITICAL_CAP = 90;

const CRITICAL_FIELDS = [
  "invoice_number",
  "destination_country",
  "hs_code",
  "package_count",
  "net_weight_total",
  "gross_weight_total",
] as const;

export interface ConfidenceScoreResult extends ConfidenceScores {
  confidenceBreakdown: Record<string, string>;
  extractionProvenance: ExtractionProvenanceEntry[];
}

function countMissingNonCritical(invoice: NormalizedInvoice): number {
  let missing = 0;
  if (!invoice.incoterms?.trim()) missing += 1;
  if (!invoice.vat_article?.trim()) missing += 1;
  if (!invoice.invoice_date?.trim()) missing += 1;
  return missing;
}

function hasCriticalFieldCoverage(
  invoice: NormalizedInvoice,
  provenance: ExtractionProvenanceEntry[]
): boolean {
  const breakdown = provenanceBreakdown(provenance);
  const hasHs =
    (invoice.items?.some((item) => item.hs_code?.trim()) ?? false) ||
    breakdown.hs_code != null;
  const hasDestination =
    Boolean(invoice.country_code?.trim() || invoice.country?.trim()) ||
    breakdown.destination_country != null;
  const summary = invoice.shipment_summary;
  const hasShipment =
    summary?.package_count != null ||
    summary?.net_weight_total != null ||
    summary?.gross_weight_total != null;

  return (
    Boolean(invoice.invoice_number?.trim()) &&
    hasHs &&
    hasDestination &&
    hasShipment
  );
}

function applyFallbackCaps(score: number, sources: Set<ExtractionSource>): number {
  const fallbackLayers = [...FALLBACK_SOURCES].filter((source) => sources.has(source));
  if (fallbackLayers.length >= 2) {
    return Math.min(score, MULTI_FALLBACK_CAP);
  }
  if (sources.has("heuristic_recovery")) {
    return Math.min(score, HEURISTIC_CAP);
  }
  if (sources.has("ocr_fallback")) {
    return Math.min(score, OCR_FALLBACK_CAP);
  }
  return score;
}

function computeExtractionPenalties(invoice: NormalizedInvoice): number {
  let penalty = 0;
  const items = invoice.items ?? [];
  const lineHsCount = items.filter((item) => item.hs_code?.trim()).length;
  const lineCooCount = items.filter((item) => item.country_of_origin?.trim()).length;

  if (items.length > 0 && lineHsCount === 0) {
    penalty += 10;
  }
  if (items.length > 0 && lineCooCount === 0) {
    penalty += 5;
  }
  if (invoice.document_flags?.[TOTAL_MISMATCH]) {
    penalty += 15;
  }

  return penalty;
}

export function computeConfidenceScores(
  invoice: NormalizedInvoice,
  options: {
    checksPassed: number;
    checksTotal: number;
    readinessScore: number;
  }
): ConfidenceScoreResult {
  const extractionProvenance = invoice.extraction_provenance ?? [];
  const sourcesUsed = new Set(extractionProvenance.map((entry) => entry.source));

  let overallConfidence = 100;

  for (const entry of extractionProvenance) {
    overallConfidence -= SOURCE_PENALTIES[entry.source] ?? 0;
  }

  overallConfidence -= countMissingNonCritical(invoice);
  overallConfidence -= computeExtractionPenalties(invoice);

  overallConfidence = applyFallbackCaps(overallConfidence, sourcesUsed);

  const usedFallback = [...FALLBACK_SOURCES].some((source) => sourcesUsed.has(source));
  const primaryComplete =
    !usedFallback &&
    hasCriticalFieldCoverage(invoice, extractionProvenance) &&
    countMissingNonCritical(invoice) === 0;

  if (!primaryComplete) {
    overallConfidence = Math.min(overallConfidence, 99);
  }

  overallConfidence = Math.max(0, Math.round(overallConfidence));

  const dataCompleteness = options.checksTotal
    ? Math.round((options.checksPassed / options.checksTotal) * 100)
    : options.readinessScore;

  const extractionPenalty = computeExtractionPenalties(invoice);
  const ocrPenalty = extractionProvenance
    .filter((entry) => entry.source === "ocr_fallback")
    .reduce((sum, entry) => sum + (SOURCE_PENALTIES.ocr_fallback ?? 0), 0);
  let ocrQuality = Math.min(
    98,
    Math.max(0, 100 - ocrPenalty - Math.min(extractionPenalty, 20)),
    usedFallback && sourcesUsed.has("ocr_fallback") ? OCR_FALLBACK_CAP : 98
  );

  return {
    overallConfidence,
    dataCompleteness,
    ocrQuality,
    confidenceBreakdown: provenanceBreakdown(extractionProvenance),
    extractionProvenance,
  };
}
