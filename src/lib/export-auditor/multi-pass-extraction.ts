/**
 * Multi-pass customs field extraction — structured OCR → PDF text → table → regex → semantic.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  appendProvenance,
  appendProvenanceMany,
  type ExtractionProvenanceEntry,
} from "@/lib/export-auditor/extraction-provenance";
import {
  extractDocumentLevelHs,
  extractHsByPosition,
  extractHsHitsFromCorpus,
} from "@/lib/export-auditor/hs-code-extraction-engine";
import {
  extractCooByPosition,
  extractCooHitsFromCorpus,
  extractDocumentLevelCoo,
  normalizeCountryOfOrigin,
} from "@/lib/export-auditor/country-of-origin-extraction-engine";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import { buildCommercialHsCorpus, countCommercialGoodsLines, detectCommercialGoodsLines, isSingleLineVehicleInvoice } from "@/lib/export-auditor/commercial-line-detector";
import {
  applyHsClassificationSanity,
  collectSanitizedHsCodes,
  shouldSkipCorpusHsSweep,
} from "@/lib/export-auditor/hs-classification-sanity";
import {
  normalizeAndValidateHsToken,
} from "@/lib/export-auditor/hs-code-normalize";

export type ExtractionPass =
  | "structured_ocr"
  | "pdf_text"
  | "table_reconstruction"
  | "regex_fallback"
  | "semantic_ai";

export interface FieldProvenance {
  value: string;
  source: ExtractionPass;
  confidence: number;
}

function resolveItemPosition(item: ApiInvoiceItem, index: number): number {
  const extended = item as ApiInvoiceItem & { position_number?: number | null };
  return typeof extended.position_number === "number" && extended.position_number > 0
    ? extended.position_number
    : index + 1;
}

function mapPassToProvenanceSource(pass: ExtractionPass): ExtractionProvenanceEntry["source"] {
  switch (pass) {
    case "structured_ocr":
      return "ocr_primary";
    case "pdf_text":
      return "ocr_fallback";
    case "table_reconstruction":
      return "heuristic_recovery";
    case "regex_fallback":
      return "regex_rescue";
    case "semantic_ai":
      return "heuristic_recovery";
    default:
      return "regex_rescue";
  }
}

function extractUniformCorpusHs(corpus: string, lineCount: number): string | null {
  if (lineCount < 2) return null;
  const counts = new Map<string, number>();
  for (const match of corpus.matchAll(/\b(\d{8,10})\b/g)) {
    const normalized = normalizeAndValidateHsToken(match[1]);
    if (!normalized.normalized || normalized.invalid) continue;
    counts.set(normalized.normalized, (counts.get(normalized.normalized) ?? 0) + 1);
  }
  for (const [code, count] of counts) {
    if (count >= Math.max(2, Math.floor(lineCount * 0.8))) return code;
  }
  return null;
}

function enrichItemsFromHits(
  invoice: NormalizedInvoice,
  positionCorpus: string,
  pass: ExtractionPass,
  hitCorpus?: string
): { invoice: NormalizedInvoice; hsBackfilled: number; cooBackfilled: number } {
  const items = invoice.items;
  const scanCorpus = hitCorpus ?? positionCorpus;
  if (!items?.length || !positionCorpus.trim()) {
    return { invoice, hsBackfilled: 0, cooBackfilled: 0 };
  }

  const hsByPosition = extractHsByPosition(positionCorpus);
  const cooByPosition = extractCooByPosition(positionCorpus);
  const documentHs = extractDocumentLevelHs(scanCorpus);
  const documentCoo = extractDocumentLevelCoo(positionCorpus);
  const hsHits = extractHsHitsFromCorpus(scanCorpus, { source: pass === "pdf_text" ? "pdf_text" : "regex_fallback" });
  const uniqueHs = [...new Set(hsHits.map((hit) => hit.value))];
  const commercialCount = countCommercialGoodsLines(invoice);
  const goodsPositions = new Set(
    detectCommercialGoodsLines(invoice).map((line) => line.positionNumber)
  );
  const uniformHsFallback =
    commercialCount >= 2
      ? extractUniformCorpusHs(scanCorpus, commercialCount)
      : null;
  const singleHsFallback =
    commercialCount === 1 && uniqueHs.length >= 1
      ? uniqueHs.sort((a, b) => {
          const aComplete = /^870[1-5]/.test(a) ? 1 : 0;
          const bComplete = /^870[1-5]/.test(b) ? 1 : 0;
          return bComplete - aComplete;
        })[0]
      : uniqueHs.length === 1
        ? uniqueHs[0]
        : documentHs;
  const effectiveSingleHsFallback = singleHsFallback ?? uniformHsFallback ?? documentHs;
  const cooHits = extractCooHitsFromCorpus(positionCorpus);
  const uniqueCoo = [...new Set(cooHits.map((hit) => hit.value))];
  const singleCooFallback = uniqueCoo.length === 1 ? uniqueCoo[0] : documentCoo;

  let hsBackfilled = 0;
  let cooBackfilled = 0;
  const provenanceEntries: ExtractionProvenanceEntry[] = [];

  const enrichedItems = items.map((item, index) => {
    const position = resolveItemPosition(item, index);
    if (goodsPositions.size > 0 && !goodsPositions.has(position)) {
      return item;
    }
    let next = item;

    if (!item.hs_code?.trim()) {
      const hs =
        hsByPosition.get(position) ??
        (uniqueHs.length === 1 ? effectiveSingleHsFallback : null) ??
        (commercialCount === 1 ? effectiveSingleHsFallback : null) ??
        (uniformHsFallback && !item.hs_code?.trim() ? uniformHsFallback : null) ??
        (items.length === 1 ? effectiveSingleHsFallback : null);
      if (hs) {
        next = { ...next, hs_code: hs };
        hsBackfilled += 1;
        provenanceEntries.push({
          field: "hs_code",
          value: hs,
          source: mapPassToProvenanceSource(pass),
        });
      }
    }

    if (!item.country_of_origin?.trim()) {
      const coo =
        cooByPosition.get(position) ??
        (items.length === 1 ? singleCooFallback : null);
      if (coo) {
        next = { ...next, country_of_origin: coo };
        cooBackfilled += 1;
        provenanceEntries.push({
          field: "country_of_origin",
          value: coo,
          source: mapPassToProvenanceSource(pass),
        });
      }
    }

    return next;
  });

  if (hsBackfilled === 0 && cooBackfilled === 0) {
    return { invoice, hsBackfilled: 0, cooBackfilled: 0 };
  }

  let enriched: NormalizedInvoice = { ...invoice, items: enrichedItems };
  enriched = appendProvenanceMany(enriched, provenanceEntries);
  return { invoice: enriched, hsBackfilled, cooBackfilled };
}

/**
 * Run multi-pass customs extraction on an enriched invoice document.
 * Pass order: structured → PDF corpus → table → regex → semantic (stub).
 */
export function runMultiPassCustomsExtraction(invoice: NormalizedInvoice): NormalizedInvoice {
  let current = invoice;
  const corpus = buildInvoiceTextCorpus(current);
  const hsCorpus = buildCommercialHsCorpus(current, corpus);

  // Pass 1 — structured OCR (parser line items already on invoice)
  const structuredHs = (current.items ?? []).filter((item) => item.hs_code?.trim()).length;
  const structuredCoo = (current.items ?? []).filter((item) => item.country_of_origin?.trim()).length;
  if (structuredHs > 0 || structuredCoo > 0) {
    current = appendProvenance(current, {
      field: "customs_extraction_pass",
      value: `structured_ocr:hs=${structuredHs},coo=${structuredCoo}`,
      source: "ocr_primary",
    });
  }

  // Pass 2 — PDF text corpus (merged into ocr_text during enrichment)
  if (corpus.trim()) {
    const pdfPass = enrichItemsFromHits(current, corpus, "pdf_text", hsCorpus);
    current = pdfPass.invoice;
  }

  const tablePass = enrichItemsFromHits(current, corpus, "table_reconstruction", hsCorpus);
  current = tablePass.invoice;

  const regexPass = enrichItemsFromHits(current, corpus, "regex_fallback", hsCorpus);
  current = regexPass.invoice;

  // Pass 5 — semantic AI (future hook; no external call in this module)
  const remainingMissingHs = (current.items ?? []).filter((item) => !item.hs_code?.trim()).length;
  if (remainingMissingHs > 0 && corpus.trim()) {
    current = appendProvenance(current, {
      field: "customs_extraction_pass",
      value: `semantic_ai:skipped_local=${remainingMissingHs}`,
      source: "heuristic_recovery",
    });
  }

  // Normalize COO tokens on all items
  const items = current.items;
  if (items?.length) {
    current = {
      ...current,
      items: items.map((item) => {
        let next = item;
        if (item.hs_code?.trim()) {
          const repaired = normalizeAndValidateHsToken(item.hs_code);
          if (repaired.normalized && repaired.normalized !== item.hs_code.trim()) {
            next = { ...next, hs_code: repaired.normalized };
          }
        }
        return next.country_of_origin?.trim()
          ? { ...next, country_of_origin: normalizeCountryOfOrigin(next.country_of_origin) }
          : next;
      }),
    };
  }

  const cooHits = extractCooHitsFromCorpus(corpus);
  if (cooHits.length > 0) {
    current = {
      ...current,
      document_flags: {
        ...current.document_flags,
        corpus_coo_detected: cooHits.map((hit) => hit.value).join(","),
      },
    };
  }

  const hsHits = extractHsHitsFromCorpus(hsCorpus);
  if (hsHits.length > 0 && !isSingleLineVehicleInvoice(current)) {
    current = {
      ...current,
      document_flags: {
        ...current.document_flags,
        corpus_hs_detected: hsHits.map((hit) => hit.value).join(","),
      },
    };
  }

  const sanity = applyHsClassificationSanity(current);
  current = sanity.invoice;

  return current;
}
