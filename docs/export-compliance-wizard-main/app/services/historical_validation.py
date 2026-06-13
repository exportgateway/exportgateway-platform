"""AES historical validation layer — capped secondary ranking bonus."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.cn_database import SearchHit
from app.services.cn_ranking import RankedCandidate, confidence_from_scores
from app.services.historical_search_service import (
    HistoricalCnMatch,
    HistoricalSearchResult,
    search_historical_classifications,
)

# Validation thresholds
MIN_HISTORICAL_CONFIDENCE = 0.85
MIN_HISTORICAL_DECLARATIONS = 20
MAX_SCORE_INFLUENCE = 0.18  # 18% of candidate score (within 15–20% limit)


@dataclass(frozen=True)
class HistoricalValidationContext:
    enabled: bool
    search_result: HistoricalSearchResult | None
    strong_matches: tuple[HistoricalCnMatch, ...]
    applied: bool = False


@dataclass(frozen=True)
class HistoricalValidationSummary:
    database_available: bool
    matches_found: int
    strong_match_count: int
    validation_applied: bool
    top_historical_cn: str | None = None
    top_historical_confidence: float | None = None
    top_historical_declarations: int | None = None


def _strong_matches(result: HistoricalSearchResult) -> tuple[HistoricalCnMatch, ...]:
    return tuple(
        match
        for match in result.matches
        if match.confidence > MIN_HISTORICAL_CONFIDENCE
        and match.match_count > MIN_HISTORICAL_DECLARATIONS
    )


def build_validation_context(
    query: str,
    *,
    enabled: bool = True,
    search_result: HistoricalSearchResult | None = None,
) -> HistoricalValidationContext:
    result = search_result or search_historical_classifications(query)
    if not enabled:
        return HistoricalValidationContext(
            enabled=False,
            search_result=result,
            strong_matches=(),
            applied=False,
        )

    strong = _strong_matches(result) if result.database_available else ()
    return HistoricalValidationContext(
        enabled=True,
        search_result=result,
        strong_matches=strong,
        applied=bool(strong),
    )


def _candidate_digits(cn_code: str) -> str:
    return "".join(ch for ch in cn_code if ch.isdigit())[:8]


def _historical_bonus(
    base_score: float,
    match: HistoricalCnMatch,
    *,
    exact_cn8_match: bool,
) -> float:
    if base_score <= 0:
        return 0.0
    influence = MAX_SCORE_INFLUENCE * match.confidence
    if exact_cn8_match:
        return base_score * influence
    # Heading-only agreement — small nudge, never enough to override primary ranking alone.
    return base_score * influence * 0.2


def apply_historical_validation_to_ranked(
    ranked: list[RankedCandidate],
    *,
    validation: HistoricalValidationContext,
    focus_term_count: int = 1,
) -> list[RankedCandidate]:
    """Apply capped AES validation bonus and re-rank without overriding primary signals."""
    if not validation.enabled or not validation.strong_matches or not ranked:
        return ranked

    strong_by_digits = {_candidate_digits(match.cn_code): match for match in validation.strong_matches}
    strong_by_heading = {match.heading_code: match for match in validation.strong_matches}
    ranked_digits = {_candidate_digits(candidate.cn_code) for candidate in ranked}
    has_exact_strong_in_pool = any(digits in strong_by_digits for digits in ranked_digits)

    adjusted: list[tuple[float, RankedCandidate, float]] = []
    for candidate in ranked:
        digits = _candidate_digits(candidate.cn_code)
        heading = candidate.cn_code.replace(" ", "")[:4]
        exact_match = strong_by_digits.get(digits)
        heading_match = strong_by_heading.get(heading)
        match = exact_match
        exact_cn8_match = match is not None
        if match is None and heading_match is not None and not has_exact_strong_in_pool:
            match = heading_match
            exact_cn8_match = False
        bonus = (
            _historical_bonus(candidate.score, match, exact_cn8_match=exact_cn8_match)
            if match
            else 0.0
        )
        adjusted_score = candidate.score + bonus
        reason = candidate.match_reason
        if bonus > 0 and match is not None:
            reason = (
                f"{reason} AES validation bonus +{bonus:.2f} "
                f"(confidence={match.confidence:.2f}, declarations={match.match_count})."
            )
        adjusted.append(
            (
                adjusted_score,
                RankedCandidate(
                    cn_code=candidate.cn_code,
                    description=candidate.description,
                    score=adjusted_score,
                    confidence_level=candidate.confidence_level,
                    match_reason=reason,
                    matched_keywords=candidate.matched_keywords,
                    matched_layers=candidate.matched_layers,
                ),
                bonus,
            )
        )

    adjusted.sort(key=lambda item: item[0], reverse=True)
    best_score = adjusted[0][0] if adjusted else 0.0

    results: list[RankedCandidate] = []
    for rank_index, (score, candidate, _bonus) in enumerate(adjusted):
        confidence = confidence_from_scores(
            score,
            best_score,
            focus_term_count,
            rank_index=rank_index,
        )
        results.append(
            RankedCandidate(
                cn_code=candidate.cn_code,
                description=candidate.description,
                score=score,
                confidence_level=confidence,
                match_reason=candidate.match_reason,
                matched_keywords=candidate.matched_keywords,
                matched_layers=candidate.matched_layers,
            )
        )
    return results


def apply_historical_validation_to_hits(
    hits: list[SearchHit],
    *,
    validation: HistoricalValidationContext,
) -> list[SearchHit]:
    if not validation.enabled or not validation.strong_matches or not hits:
        return hits

    ranked = [
        RankedCandidate(
            cn_code=hit.cn_code,
            description=hit.description,
            score=hit.raw_score,
            confidence_level=hit.confidence_level,
            match_reason=hit.match_explanation,
            matched_keywords=hit.matched_keywords,
            matched_layers=(),
        )
        for hit in hits
    ]
    updated = apply_historical_validation_to_ranked(ranked, validation=validation)
    return [
        SearchHit(
            cn_code=item.cn_code,
            description=item.description,
            confidence_level=item.confidence_level,
            match_explanation=item.match_reason,
            raw_score=item.score,
            matched_keywords=item.matched_keywords,
        )
        for item in updated
    ]


def summarize_validation(validation: HistoricalValidationContext) -> HistoricalValidationSummary:
    result = validation.search_result
    if result is None:
        return HistoricalValidationSummary(
            database_available=False,
            matches_found=0,
            strong_match_count=0,
            validation_applied=False,
        )
    top = validation.strong_matches[0] if validation.strong_matches else None
    return HistoricalValidationSummary(
        database_available=result.database_available,
        matches_found=result.matches_found,
        strong_match_count=len(validation.strong_matches),
        validation_applied=validation.applied,
        top_historical_cn=top.cn_code if top else None,
        top_historical_confidence=top.confidence if top else None,
        top_historical_declarations=top.match_count if top else None,
    )
