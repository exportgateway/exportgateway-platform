/**
 * Export Auditor ↔ Classification Wizard integration contract.
 * Prepared for Phase 2+ — not activated in Phase 1.1.
 *
 * Future flow:
 *   Export Auditor → missing HS → Classify with Wizard → Use Classification → return tariff
 */

import type { ClassifyV2Response, ConfidenceBand, ResearchSource } from "@/lib/wizard-types";

export interface ClassificationSelectedPayload {
  cn_code: string;
  query: string;
  confidence: ConfidenceBand | string;
  source: ResearchSource | string;
  commodity_description: string;
}

/** Callback supplied when wizard is launched from Export Auditor context. */
export type OnClassificationSelected = (payload: ClassificationSelectedPayload) => void;

export function buildClassificationSelectedPayload(
  result: ClassifyV2Response,
  query: string
): ClassificationSelectedPayload {
  return {
    cn_code: String(result.recommended_cn_code ?? "").replace(/\s/g, ""),
    query: result.query || query,
    confidence: result.confidence,
    source: result.research_source,
    commodity_description: result.commodity_description || result.product_type || "",
  };
}
