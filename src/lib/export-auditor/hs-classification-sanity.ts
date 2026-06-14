/**
 * HS classification sanity — single-line vehicle protection and candidate deduplication.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { buildInvoiceTextCorpus } from "@/lib/export-auditor/invoice-corpus";
import {
  buildCommercialHsCorpus,
  countCommercialGoodsLines,
  detectCommercialGoodsLines,
  isCompleteVehicleDescription,
  isExplicitVehiclePartDescription,
  isSingleLineVehicleInvoice,
} from "@/lib/export-auditor/commercial-line-detector";
import { extractHsHitsFromCorpus } from "@/lib/export-auditor/hs-code-extraction-engine";
import { normalizeAndValidateHsToken } from "@/lib/export-auditor/hs-code-normalize";
import { validateHsCode } from "@/lib/export-auditor/hs-validation-engine";
import { MULTIPLE_HS_CANDIDATES_DETECTED } from "@/lib/export-auditor/issue-readiness";

export { MULTIPLE_HS_CANDIDATES_DETECTED };
export const MULTIPLE_HS_CANDIDATES_MESSAGE =
  "Multiple HS candidates detected for a single goods line — highest-confidence code retained.";

/** Part chapters invalid for complete-vehicle descriptions unless explicitly parts. */
export const VEHICLE_PART_HS_CHAPTERS = new Set(["8708", "8409", "8483", "8707"]);

/** Complete motor vehicles / trucks — chapters 8701–8705. */
const COMPLETE_VEHICLE_HS_CHAPTERS = new Set(["8701", "8702", "8703", "8704", "8705"]);

export interface HsClassificationCandidate {
  code: string;
  confidence: number;
  source: "invoice_line" | "position_match" | "corpus_labeled" | "corpus_regex" | "wizard";
}

export interface HsSanityWarning {
  code: typeof MULTIPLE_HS_CANDIDATES_DETECTED;
  message: string;
  positionNumber: number;
  candidates: string[];
  selected: string;
}

function resolveItemPosition(item: ApiInvoiceItem, index: number): number {
  const extended = item as ApiInvoiceItem & { position_number?: number | null };
  return typeof extended.position_number === "number" && extended.position_number > 0
    ? extended.position_number
    : index + 1;
}

function chapterOf(code: string): string {
  return code.replace(/\D/g, "").slice(0, 4);
}

export function isForbiddenVehiclePartHs(
  hsCode: string,
  description: string | null | undefined
): boolean {
  if (isExplicitVehiclePartDescription(description)) return false;
  if (!isCompleteVehicleDescription(description)) return false;
  const chapter = chapterOf(hsCode);
  return VEHICLE_PART_HS_CHAPTERS.has(chapter);
}

function scoreCandidate(
  candidate: HsClassificationCandidate,
  description: string | null | undefined
): number {
  let score = candidate.confidence;
  const chapter = chapterOf(candidate.code);

  if (isCompleteVehicleDescription(description)) {
    if (COMPLETE_VEHICLE_HS_CHAPTERS.has(chapter)) score += 0.12;
    if (VEHICLE_PART_HS_CHAPTERS.has(chapter)) score -= 0.65;
  }

  if (candidate.source === "invoice_line") score += 0.08;
  return score;
}

function collectItemHsCandidates(
  item: ApiInvoiceItem,
  position: number,
  corpus: string,
  skipCorpusSweep: boolean
): HsClassificationCandidate[] {
  const extended = item as ApiInvoiceItem & {
    invoice_hs_code?: string | null;
    wizard_hs_code?: string | null;
    final_hs_code?: string | null;
  };

  const candidates: HsClassificationCandidate[] = [];
  const seen = new Set<string>();

  function add(raw: string | null | undefined, source: HsClassificationCandidate["source"], confidence: number) {
    const validation = validateHsCode(raw);
    if (!validation.normalizedHs || validation.hsStatus === "INVALID_FORMAT") return;
    const code = validation.normalizedHs;
    if (seen.has(code)) return;
    seen.add(code);
    candidates.push({ code, confidence, source });
  }

  add(extended.invoice_hs_code, "invoice_line", 0.98);
  add(item.hs_code, "invoice_line", 0.96);
  if (extended.hs_source !== "USER") {
    add(extended.final_hs_code, "invoice_line", 0.94);
  } else {
    add(extended.final_hs_code, "invoice_line", 0.99);
  }
  add(extended.wizard_hs_code, "wizard", 0.9);

  const lineHs = item.hs_code?.trim() ?? extended.invoice_hs_code?.trim();
  if (skipCorpusSweep && lineHs && validateHsCode(lineHs).normalizedHs) {
    return candidates;
  }

  for (const hit of extractHsHitsFromCorpus(corpus)) {
    if (hit.position != null && hit.position !== position) continue;
    add(
      hit.value,
      hit.confidence >= 0.9 ? "position_match" : "corpus_regex",
      hit.confidence
    );
  }

  return candidates;
}

export function selectBestHsCandidate(
  candidates: HsClassificationCandidate[],
  description: string | null | undefined
): { code: string | null; ranked: HsClassificationCandidate[] } {
  const filtered = candidates.filter(
    (candidate) => !isForbiddenVehiclePartHs(candidate.code, description)
  );
  if (filtered.length === 0) {
    return { code: null, ranked: [] };
  }

  const ranked = [...filtered].sort(
    (a, b) => scoreCandidate(b, description) - scoreCandidate(a, description)
  );
  return { code: ranked[0]?.code ?? null, ranked };
}

export function applyHsClassificationSanity(invoice: NormalizedInvoice): {
  invoice: NormalizedInvoice;
  warnings: HsSanityWarning[];
} {
  const goodsLines = detectCommercialGoodsLines(invoice);
  const corpus = buildCommercialHsCorpus(invoice, buildInvoiceTextCorpus(invoice));
  const warnings: HsSanityWarning[] = [];
  const items = invoice.items ?? [];
  const skipCorpusSweep =
    goodsLines.length > 0 &&
    goodsLines.every((line) => {
      const hs = line.item.hs_code?.trim();
      return Boolean(hs && validateHsCode(hs).normalizedHs);
    });

  if (goodsLines.length === 0) {
    return { invoice, warnings };
  }

  const enrichedItems = items.map((item, index) => {
    const position = resolveItemPosition(item, index);
    const goodsMatch = goodsLines.find((line) => line.positionNumber === position);
    if (!goodsMatch) return item;

    const extended = item as ApiInvoiceItem & {
      hs_source?: string | null;
      final_hs_code?: string | null;
    };
    if (extended.hs_source === "USER" && extended.final_hs_code?.trim()) {
      return { ...item, hs_code: extended.final_hs_code.trim() };
    }
    if (extended.hs_source === "WIZARD" && extended.final_hs_code?.trim()) {
      return item;
    }

    const candidates = collectItemHsCandidates(item, position, corpus, skipCorpusSweep);
    const uniqueCodes = [...new Set(candidates.map((c) => c.code))];
    const { code: best, ranked } = selectBestHsCandidate(candidates, goodsMatch.description);

    if (!skipCorpusSweep && uniqueCodes.length > 1 && best) {
      warnings.push({
        code: MULTIPLE_HS_CANDIDATES_DETECTED,
        message: `${MULTIPLE_HS_CANDIDATES_MESSAGE} (${uniqueCodes.join(", ")} → ${best})`,
        positionNumber: position,
        candidates: uniqueCodes,
        selected: best,
      });
    }

    if (!best) return item;

    return {
      ...item,
      hs_code: best,
      final_hs_code: best,
    };
  });

  let next: NormalizedInvoice = { ...invoice, items: enrichedItems };

  if (isSingleLineVehicleInvoice(next)) {
    const sole = detectCommercialGoodsLines(next)[0];
    const soleItem = enrichedItems.find(
      (_, index) => resolveItemPosition(items[index], index) === sole.positionNumber
    );
    const hs = soleItem?.hs_code?.trim();
    if (hs) {
      next = {
        ...next,
        document_flags: {
          ...next.document_flags,
          corpus_hs_detected: hs,
          single_vehicle_hs_locked: "true",
        },
      };
    }
  }

  const finalCodes = [
    ...new Set(
      detectCommercialGoodsLines(next)
        .map((line) => line.item.hs_code?.trim())
        .filter((code): code is string => Boolean(code))
        .map((code) => normalizeAndValidateHsToken(code).normalized ?? code)
    ),
  ];

  if (finalCodes.length > 0) {
    next = {
      ...next,
      document_flags: {
        ...next.document_flags,
        corpus_hs_detected: finalCodes.join(","),
      },
    };
  }

  if (warnings.length > 0) {
    next = {
      ...next,
      document_flags: {
        ...next.document_flags,
        hs_sanity_warnings: warnings.map((w) => w.code).join(","),
      },
    };
  }

  return { invoice: next, warnings };
}

/** Document-level HS list after sanity — one code per commercial goods line max. */
export function collectSanitizedHsCodes(invoice: NormalizedInvoice): string[] {
  const codes = new Set<string>();
  for (const line of detectCommercialGoodsLines(invoice)) {
    const validation = validateHsCode(line.item.hs_code);
    if (validation.normalizedHs && validation.hsStatus !== "INVALID_FORMAT") {
      codes.add(validation.normalizedHs);
    }
  }
  return [...codes].sort();
}

export function shouldSkipCorpusHsSweep(invoice: NormalizedInvoice): boolean {
  if (countCommercialGoodsLines(invoice) === 1 && isSingleLineVehicleInvoice(invoice)) {
    return true;
  }
  const goods = detectCommercialGoodsLines(invoice);
  return (
    goods.length > 0 &&
    goods.every((line) => {
      const hs = line.item.hs_code?.trim();
      return Boolean(hs && validateHsCode(hs).normalizedHs);
    })
  );
}
