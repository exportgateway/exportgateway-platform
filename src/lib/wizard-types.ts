/**
 * Export Classification Wizard V2 — types aligned with Render API schema
 * (`app/models/schemas.py`). Do not add fields not returned by the backend.
 */

/** Confidence band returned by POST /classify/v2 */
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

/** Primary research source label returned by the classification engine */
export type ResearchSource =
  | "AES Historical Data"
  | "Knowledge Base"
  | "AI Classification"
  | "Web Research";

/** AES historical evidence level */
export type EvidenceLevel = "none" | "weak" | "medium" | "strong";

/** Enriched evidence strength label (display enrichment) */
export type EvidenceStrength = "None" | "Weak" | "Medium" | "Strong" | string;

export interface ClassifyV2Request {
  product_description: string;
  plan?: string | null;
  disambiguation?: Record<string, string> | null;
}

export interface DisambiguationOption {
  id: string;
  label: string;
}

export interface DisambiguationQuestion {
  id: string;
  prompt: string;
  options: DisambiguationOption[];
}

export interface DetectedAttributes {
  gender?: string | null;
  material?: string | null;
  fabric?: string | null;
  construction?: string | null;
}

export type InteractiveCategory = "A" | "B" | "C";

export type CompletionPath = "immediate" | "one_question" | "multiple_questions";

export interface InteractionMetrics {
  questions_asked: number;
  completion_path: CompletionPath | string;
}

export interface HistoricalEvidenceSummary {
  level: EvidenceLevel | string;
  declaration_count: number;
  most_common_tariff: string | null;
  message: string;
  evidence_strength: EvidenceStrength;
}

export interface ClassificationReasoning {
  detected: string[];
  matches: string[];
}

export interface ClassificationSummary {
  product_type: string;
  detected_attributes: string[];
}

export interface HierarchyStep {
  level: string;
  code: string;
  label: string;
}

export interface SourceBreakdown {
  aes_historical: boolean;
  knowledge_base: boolean;
  ai_classification: boolean;
  web_research: boolean;
  web_research_required: boolean;
}

export interface AlternativeClassification {
  cn_code: string;
  recommended: boolean;
  description: string;
}

/** GET /classify/v2/usage — PlanUsageResponse in backend schema */
export interface UsageResponse {
  plan: string;
  month_key: string;
  classifications_used: number;
  classifications_limit: number;
  classifications_remaining: number;
  research_used: number;
  research_limit: number;
  research_remaining: number;
}

export interface ClassifyV2Response {
  query: string;
  recommended_cn_code: string | null;
  confidence: ConfidenceBand | string;
  historical_evidence: HistoricalEvidenceSummary;
  reasoning: ClassificationReasoning;
  alternatives: AlternativeClassification[];
  research_source: ResearchSource | string;
  manual_classification_recommended: boolean;
  product_type: string;
  usage: UsageResponse;
  from_cache: boolean;
  commodity_description: string;
  hierarchy_path: HierarchyStep[];
  classification_summary: ClassificationSummary | null;
  why_explanation: string;
  confidence_source: string;
  source_breakdown: SourceBreakdown | null;
  needs_more_information?: boolean;
  classification_state?: string | null;
  disambiguation_questions?: DisambiguationQuestion[];
  detected_attributes?: DetectedAttributes | null;
  auto_answered_questions?: string[];
  interactive_category?: InteractiveCategory | string | null;
  interactive_family?: string | null;
  additional_information_required?: boolean;
  additional_information_reason?: string;
  interaction_step?: number | null;
  interaction_total_steps?: number | null;
  interaction_metrics?: InteractionMetrics | null;
  selected_chapter?: string | null;
  chapter_confidence?: number | null;
}

export const RESEARCH_SOURCES: readonly ResearchSource[] = [
  "AES Historical Data",
  "Knowledge Base",
  "AI Classification",
  "Web Research",
] as const;

export const CONFIDENCE_BANDS: readonly ConfidenceBand[] = ["HIGH", "MEDIUM", "LOW"] as const;

export const EVIDENCE_LEVELS: readonly EvidenceLevel[] = ["none", "weak", "medium", "strong"] as const;
