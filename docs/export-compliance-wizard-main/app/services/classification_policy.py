"""Classification state and confidence policy (Phase A)."""

from __future__ import annotations

from enum import Enum

from app.models.cpr import CanonicalProductRecord
from app.services.cn_database import SearchHit
from app.services.product_understanding_service import ENGINE_FALLBACK, ProductUnderstandingResult


class ClassificationState(str, Enum):
    SUGGEST = "SUGGEST"
    DISAMBIGUATE = "DISAMBIGUATE"
    ABSTAIN = "ABSTAIN"
    EXPERT_REQUIRED = "EXPERT_REQUIRED"


def cap_confidence(raw: float, data_quality: float, *, rank_index: int = 0) -> float:
    if data_quality < 0.4:
        ceiling = 0.45
    elif data_quality < 0.55:
        ceiling = 0.65
    elif data_quality < 0.7:
        ceiling = 0.82
    else:
        ceiling = 0.97
    if rank_index > 0:
        ceiling = max(0.38, ceiling - 0.06 * rank_index)
    return min(raw, ceiling)


def decide_classification_state(
    *,
    cpr: CanonicalProductRecord,
    suggestions: list[SearchHit],
    understanding: ProductUnderstandingResult,
) -> ClassificationState:
    if cpr.pending_disambiguation:
        return ClassificationState.DISAMBIGUATE

    if not suggestions:
        if cpr.data_quality_score < 0.5:
            return ClassificationState.EXPERT_REQUIRED
        return ClassificationState.ABSTAIN

    if cpr.data_quality_score < 0.35:
        return ClassificationState.ABSTAIN

    if (
        understanding.understanding_engine == ENGINE_FALLBACK
        and understanding.detected_language != "en"
    ):
        if cpr.data_quality_score < 0.55 and not cpr.lexicon_concepts:
            return ClassificationState.EXPERT_REQUIRED

    top_conf = suggestions[0].confidence_level if suggestions else 0
    capped = cap_confidence(top_conf, cpr.data_quality_score)
    if capped < 0.55:
        return ClassificationState.EXPERT_REQUIRED

    if len(suggestions) >= 2:
        raw_margin = suggestions[0].raw_score - suggestions[1].raw_score
        best_raw = suggestions[0].raw_score
        relative_margin = raw_margin / best_raw if best_raw > 0 else 0.0
        if relative_margin < 0.05 and capped < 0.75:
            return ClassificationState.EXPERT_REQUIRED

    return ClassificationState.SUGGEST


def apply_confidence_policy(
    suggestions: list[SearchHit],
    data_quality: float,
) -> list[SearchHit]:
    from app.services.cn_database import SearchHit

    updated: list[SearchHit] = []
    for index, hit in enumerate(suggestions):
        updated.append(
            SearchHit(
                cn_code=hit.cn_code,
                description=hit.description,
                confidence_level=cap_confidence(
                    hit.confidence_level, data_quality, rank_index=index
                ),
                match_explanation=hit.match_explanation,
                raw_score=hit.raw_score,
                matched_keywords=hit.matched_keywords,
            )
        )
    return updated


def requires_expert_review(state: ClassificationState) -> bool:
    return state in {ClassificationState.EXPERT_REQUIRED, ClassificationState.ABSTAIN}
