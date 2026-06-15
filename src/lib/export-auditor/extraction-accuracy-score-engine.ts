/**
 * Extraction Accuracy Score — measures how reliably data was extracted from the invoice.
 * Never mixed with customs filing readiness.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  FALLBACK_SOURCES,
  type ExtractionProvenanceEntry,
  type ExtractionSource,
} from "@/lib/export-auditor/extraction-provenance";
import { filterGoodsLines, normalizeAggregationItems } from "@/lib/export-auditor/hs-aggregation-engine";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import { TOTAL_MISMATCH } from "@/lib/export-auditor/invoice-total-consistency-validator";
import type {
  ExportAuditReport,
  ExtractionAccuracyScore,
  ScoreDimension,
} from "@/lib/export-auditor/types";

const SOURCE_PENALTIES: Partial<Record<ExtractionSource, number>> = {
  ocr_fallback: 8,
  heuristic_recovery: 12,
  regex_rescue: 5,
};

const DIMENSION_WEIGHTS = {
  ocrQuality: 20,
  lineExtraction: 20,
  hsExtraction: 20,
  cooExtraction: 15,
  valueExtraction: 15,
  preferentialOriginDetection: 10,
} as const;

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function weightedAverage(dimensions: ScoreDimension[]): number {
  const totalWeight = dimensions.reduce((sum, dim) => sum + dim.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0);
  return clampScore(weighted / totalWeight);
}

function scoreOcrQuality(
  report: ExportAuditReport,
  provenance: ExtractionProvenanceEntry[]
): number {
  let score =
    report.ocrObservability?.dataExtractionCompleteness ??
    report.ocrObservability?.ocrQualityScore ??
    report.confidence?.ocrQuality ??
    85;

  for (const entry of provenance) {
    score -= SOURCE_PENALTIES[entry.source] ?? 0;
  }

  const fallbackCount = provenance.filter((entry) =>
    FALLBACK_SOURCES.has(entry.source as ExtractionSource)
  ).length;
  if (fallbackCount >= 2) score -= 10;
  else if (fallbackCount === 1) score -= 5;

  if (report.dataRecoveryDiagnostics?.highRecoveryRisk) {
    score -= Math.min(15, Math.round(report.dataRecoveryDiagnostics.recoveryPercentage / 5));
  }

  return clampScore(score);
}

function scoreLineExtraction(invoice: NormalizedInvoice, report: ExportAuditReport): number {
  const items = invoice.items ?? [];
  if (items.length === 0) return 0;

  const withQty = items.filter((item) => {
    const qty = item.quantity;
    if (qty == null) return false;
    const n = typeof qty === "number" ? qty : Number(String(qty).replace(",", "."));
    return Number.isFinite(n) && n > 0;
  }).length;

  const withDescription = items.filter((item) => item.description?.trim()).length;
  const positionCoverage =
    items.filter((item) => typeof item.position_number === "number" && item.position_number > 0)
      .length / items.length;

  const qtyRatio = withQty / items.length;
  const descRatio = withDescription / items.length;
  const ocrItems = report.ocrObservability?.itemsExtracted ?? items.length;
  const countAlignment =
    ocrItems > 0 ? Math.min(1, items.length / ocrItems) : items.length > 0 ? 1 : 0;

  return clampScore((qtyRatio * 40 + descRatio * 30 + positionCoverage * 15 + countAlignment * 15));
}

function scoreHsExtraction(invoice: NormalizedInvoice, report: ExportAuditReport): number {
  const goods = filterGoodsLines(normalizeAggregationItems(invoice));
  if (goods.length === 0) return report.hsCodesDetected.length > 0 ? 70 : 0;

  const withHs = goods.filter((item) => item.hs_code?.trim()).length;
  const lineRatio = withHs / goods.length;
  const aggregated = (report.hsAggregationReport?.hsAggregation?.length ?? 0) > 0;
  const corpusDetected = Boolean(invoice.document_flags?.corpus_hs_detected);

  let score = lineRatio * 80;
  if (aggregated) score += 15;
  if (corpusDetected && withHs === 0) score = Math.max(score, 35);

  return clampScore(score);
}

function scoreCooExtraction(invoice: NormalizedInvoice, report: ExportAuditReport): number {
  const goods = filterGoodsLines(normalizeAggregationItems(invoice));
  if (goods.length === 0) {
    return report.invoiceSummary.countriesOfOrigin.length > 0 ? 75 : 0;
  }

  const withCoo = goods.filter((item) => item.country_of_origin?.trim()).length;
  const lineRatio = withCoo / goods.length;
  const summaryCoo = report.invoiceSummary.countriesOfOrigin.length > 0 ? 15 : 0;

  return clampScore(lineRatio * 85 + summaryCoo);
}

function scoreValueExtraction(invoice: NormalizedInvoice): number {
  const items = invoice.items ?? [];
  const invoiceTotal = resolveInvoiceValue(invoice);
  if (!Number.isFinite(invoiceTotal) || invoiceTotal <= 0) return 0;

  if (items.length === 0) return 50;

  const withLineTotal = items.filter((item) => {
    const raw = item.line_total;
    if (raw == null) return false;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    return Number.isFinite(n) && n > 0;
  }).length;

  const lineRatio = withLineTotal / items.length;
  let score = 60 + lineRatio * 35;

  if (invoice.document_flags?.[TOTAL_MISMATCH]) {
    score -= 25;
  }

  return clampScore(score);
}

function scorePreferentialOriginDetection(report: ExportAuditReport): number {
  const po = report.preferenceOrigin;
  const lines = po.lineItems ?? [];
  if (lines.length === 0) return po.originDeclarationFound || po.authorisedExporterDetected ? 60 : 40;

  const resolved = lines.filter(
    (line) =>
      line.preferential_origin === "YES" ||
      line.preferential_origin === "NO" ||
      line.preference_source !== "none"
  ).length;

  const ratio = resolved / lines.length;
  let score = ratio * 90;

  if (po.originDeclarationFound) score += 5;
  if (po.authorisedExporterDetected) score += 5;

  return clampScore(score);
}

function buildLabel(score: number): string {
  if (score >= 95) return "Excellent extraction";
  if (score >= 85) return "High extraction accuracy";
  if (score >= 70) return "Good extraction — review gaps";
  if (score >= 50) return "Partial extraction";
  return "Low extraction accuracy";
}

function buildMessage(dimensions: ScoreDimension[]): string {
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  if (!weakest || weakest.score >= 90) {
    return "Invoice data was extracted reliably across all measured dimensions.";
  }
  if (weakest.score >= 70) {
    return `Extraction is strong overall. Lowest area: ${weakest.label} (${weakest.score}/100).`;
  }
  return `Extraction needs review. Weakest area: ${weakest.label} (${weakest.score}/100).`;
}

/** Compute extraction accuracy score (0–100) — independent of customs readiness. */
export function computeExtractionAccuracyScore(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): ExtractionAccuracyScore {
  const provenance: ExtractionProvenanceEntry[] =
    (report.extractionProvenance as ExtractionProvenanceEntry[] | undefined) ??
    invoice.extraction_provenance ??
    [];

  const dimensions: ScoreDimension[] = [
    {
      id: "ocrQuality",
      label: "OCR Quality",
      score: scoreOcrQuality(report, provenance),
      weight: DIMENSION_WEIGHTS.ocrQuality,
    },
    {
      id: "lineExtraction",
      label: "Line Extraction",
      score: scoreLineExtraction(invoice, report),
      weight: DIMENSION_WEIGHTS.lineExtraction,
    },
    {
      id: "hsExtraction",
      label: "HS Extraction",
      score: scoreHsExtraction(invoice, report),
      weight: DIMENSION_WEIGHTS.hsExtraction,
    },
    {
      id: "cooExtraction",
      label: "COO Extraction",
      score: scoreCooExtraction(invoice, report),
      weight: DIMENSION_WEIGHTS.cooExtraction,
    },
    {
      id: "valueExtraction",
      label: "Value Extraction",
      score: scoreValueExtraction(invoice),
      weight: DIMENSION_WEIGHTS.valueExtraction,
    },
    {
      id: "preferentialOriginDetection",
      label: "Preferential Origin Detection",
      score: scorePreferentialOriginDetection(report),
      weight: DIMENSION_WEIGHTS.preferentialOriginDetection,
    },
  ];

  const score = weightedAverage(dimensions);

  return {
    score,
    label: buildLabel(score),
    message: buildMessage(dimensions),
    dimensions,
  };
}
