"""AES Knowledge Engine v1 — historical candidate injection and capped knowledge signals."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.historical_search_service import (
    HistoricalCnMatch,
    HistoricalSearchResult,
    search_historical_classifications,
)

MAX_KNOWLEDGE_SCORE_INFLUENCE = 0.20
MIN_CANDIDATE_DECLARATIONS = 2  # AES optimization pass #1 (was 3)
MIN_CANDIDATE_CONFIDENCE = 0.35


@dataclass(frozen=True)
class HistoricalKnowledgeCandidate:
    cn_code: str
    cn_digits: str
    heading_code: str
    declaration_count: int
    similarity_score: float
    country_match: float
    confidence: float
    top_descriptions: tuple[str, ...] = ()


@dataclass(frozen=True)
class AesKnowledgeSummary:
    enabled: bool
    database_available: bool
    candidate_count: int
    injected_count: int
    top_candidate_cn: str | None = None
    top_candidate_confidence: float | None = None
    injection_performed: bool = False
    injection_won_ranking: bool = False


@dataclass(frozen=True)
class AesKnowledgeContext:
    enabled: bool
    query: str
    search_result: HistoricalSearchResult | None
    candidates: tuple[HistoricalKnowledgeCandidate, ...]
    injected_cn8: frozenset[str]
    bonus_eligible_cn8: frozenset[str] = frozenset()

    @property
    def database_available(self) -> bool:
        return bool(self.search_result and self.search_result.database_available)


def _declaration_score(count: int) -> float:
    return min(1.0, count / 25.0)


def compute_candidate_confidence(
    *,
    declaration_count: int,
    similarity_score: float,
    country_match: float,
) -> float:
    """Blend declaration volume, FTS similarity, and country alignment."""
    return round(
        min(
            0.99,
            0.45 * _declaration_score(declaration_count)
            + 0.45 * min(1.0, max(0.0, similarity_score))
            + 0.10 * min(1.0, max(0.0, country_match)),
        ),
        4,
    )


def _taxonomy_heading_constraints(
    family_ids: tuple[str, ...] | list[str] | None,
    penalized_headings: frozenset[str] | set[str] | None = None,
) -> tuple[frozenset[str], frozenset[str]]:
    """Return (preferred_headings, blocked_headings) for knowledge filtering."""
    from app.services.taxonomy_service import _load_taxonomy

    config = _load_taxonomy()
    families_by_id = {entry.get("id"): entry for entry in config.get("families", [])}
    preferred: set[str] = set()
    blocked = set(penalized_headings or ())
    narrow_families = 0

    for family_id in family_ids or ():
        entry = families_by_id.get(family_id)
        if not entry:
            continue
        headings = [str(h) for h in entry.get("headings", []) if str(h).isdigit()]
        if headings and len(headings) <= 2:
            preferred.update(headings)
            narrow_families += 1
        blocked.update(str(h) for h in entry.get("penalized_headings", []) if str(h).isdigit())

    if narrow_families == 0:
        preferred.clear()
    return frozenset(preferred), frozenset(blocked)


def filter_knowledge_candidates(
    candidates: tuple[HistoricalKnowledgeCandidate, ...] | list[HistoricalKnowledgeCandidate],
    *,
    family_ids: tuple[str, ...] | list[str] | None = None,
    penalized_headings: frozenset[str] | set[str] | None = None,
) -> tuple[HistoricalKnowledgeCandidate, ...]:
    preferred, blocked = _taxonomy_heading_constraints(family_ids, penalized_headings)
    filtered: list[HistoricalKnowledgeCandidate] = []
    for candidate in candidates:
        heading = candidate.heading_code[:4]
        if heading in blocked:
            continue
        if preferred and heading not in preferred:
            continue
        filtered.append(candidate)
    return tuple(filtered)


def _match_to_candidate(match: HistoricalCnMatch) -> HistoricalKnowledgeCandidate:
    similarity = min(1.0, match.confidence * 1.05)
    country = getattr(match, "country_match", 1.0)
    confidence = compute_candidate_confidence(
        declaration_count=match.match_count,
        similarity_score=similarity,
        country_match=country,
    )
    return HistoricalKnowledgeCandidate(
        cn_code=match.cn_code,
        cn_digits=match.cn_digits,
        heading_code=match.heading_code,
        declaration_count=match.match_count,
        similarity_score=round(similarity, 4),
        country_match=round(country, 4),
        confidence=confidence,
        top_descriptions=match.top_descriptions,
    )


def build_aes_knowledge_context(
    query: str,
    *,
    enabled: bool = True,
    country_code: str | None = "SI",
    search_result: HistoricalSearchResult | None = None,
    limit: int = 8,
    family_ids: tuple[str, ...] | list[str] | None = None,
    penalized_headings: frozenset[str] | set[str] | None = None,
) -> AesKnowledgeContext:
    if not enabled:
        return AesKnowledgeContext(
            enabled=False,
            query=query,
            search_result=None,
            candidates=(),
            injected_cn8=frozenset(),
        )

    result = search_result or search_historical_classifications(
        query,
        limit=limit,
        country_code=country_code,
    )
    if not result.database_available or not result.matches:
        return AesKnowledgeContext(
            enabled=True,
            query=query,
            search_result=result,
            candidates=(),
            injected_cn8=frozenset(),
        )

    candidates: list[HistoricalKnowledgeCandidate] = []
    for match in result.matches:
        candidate = _match_to_candidate(match)
        if (
            candidate.declaration_count >= MIN_CANDIDATE_DECLARATIONS
            and candidate.confidence >= MIN_CANDIDATE_CONFIDENCE
        ):
            candidates.append(candidate)

    candidates = list(
        filter_knowledge_candidates(
            candidates,
            family_ids=family_ids,
            penalized_headings=penalized_headings,
        )
    )

    injected = frozenset(c.cn_digits[:8] for c in candidates)
    return AesKnowledgeContext(
        enabled=True,
        query=query,
        search_result=result,
        candidates=tuple(candidates),
        injected_cn8=injected,
    )


def knowledge_bonus_for_candidate(
    base_score: float,
    *,
    cn_digits: str,
    knowledge: AesKnowledgeContext | None,
) -> tuple[float, HistoricalKnowledgeCandidate | None]:
    """Return capped AES knowledge bonus for a ranked CN8 candidate."""
    if not knowledge or not knowledge.enabled or base_score <= 0:
        return 0.0, None

    target = cn_digits[:8]
    if not knowledge.bonus_eligible_cn8 or target not in knowledge.bonus_eligible_cn8:
        return 0.0, None
    for candidate in knowledge.candidates:
        if candidate.cn_digits[:8] == target:
            bonus = base_score * MAX_KNOWLEDGE_SCORE_INFLUENCE * candidate.confidence
            return bonus, candidate
    return 0.0, None


def diagnose_knowledge_pipeline(
    search_result: HistoricalSearchResult | None,
    *,
    family_ids: tuple[str, ...] | list[str] | None = None,
    penalized_headings: frozenset[str] | set[str] | None = None,
    pre_existing_cn8: frozenset[str] | set[str] | None = None,
) -> dict:
    """Return step-by-step knowledge engine diagnostics for coverage analysis."""
    if not search_result or not search_result.database_available:
        return {
            "historical_match_found": False,
            "top_historical_confidence": None,
            "top_historical_declarations": None,
            "top_historical_country_match": None,
            "qualified_candidate_count": 0,
            "post_taxonomy_candidate_count": 0,
            "skip_reason": "no_fts_match",
            "skip_detail": "database unavailable or no FTS matches",
        }

    top = search_result.matches[0] if search_result.matches else None
    raw_candidates = [_match_to_candidate(match) for match in search_result.matches]
    threshold_candidates = [
        candidate
        for candidate in raw_candidates
        if candidate.declaration_count >= MIN_CANDIDATE_DECLARATIONS
        and candidate.confidence >= MIN_CANDIDATE_CONFIDENCE
    ]

    if not raw_candidates:
        return {
            "historical_match_found": False,
            "top_historical_confidence": None,
            "top_historical_declarations": None,
            "top_historical_country_match": None,
            "qualified_candidate_count": 0,
            "post_taxonomy_candidate_count": 0,
            "skip_reason": "no_fts_match",
            "skip_detail": "FTS returned no aggregated CN matches",
        }

    if not any(c.declaration_count >= MIN_CANDIDATE_DECLARATIONS for c in raw_candidates):
        best = max(raw_candidates, key=lambda c: c.declaration_count)
        return {
            "historical_match_found": True,
            "top_historical_confidence": top.confidence if top else None,
            "top_historical_declarations": top.match_count if top else None,
            "top_historical_country_match": top.country_match if top else None,
            "qualified_candidate_count": 0,
            "post_taxonomy_candidate_count": 0,
            "skip_reason": "declaration_count_below_threshold",
            "skip_detail": (
                f"max declaration_count={best.declaration_count} "
                f"< {MIN_CANDIDATE_DECLARATIONS}"
            ),
        }

    pre_taxonomy = [
        c
        for c in raw_candidates
        if c.declaration_count >= MIN_CANDIDATE_DECLARATIONS
    ]
    if not threshold_candidates:
        best = max(pre_taxonomy, key=lambda c: c.confidence)
        if best.country_match < 0.5:
            reason = "country_mismatch"
            detail = (
                f"country_match={best.country_match:.2f} reduced confidence "
                f"to {best.confidence:.4f}"
            )
        else:
            reason = "confidence_below_threshold"
            detail = (
                f"max confidence={best.confidence:.4f} "
                f"< {MIN_CANDIDATE_CONFIDENCE}"
            )
        return {
            "historical_match_found": True,
            "top_historical_confidence": top.confidence if top else None,
            "top_historical_declarations": top.match_count if top else None,
            "top_historical_country_match": top.country_match if top else None,
            "qualified_candidate_count": 0,
            "post_taxonomy_candidate_count": 0,
            "skip_reason": reason,
            "skip_detail": detail,
        }

    post_taxonomy = filter_knowledge_candidates(
        threshold_candidates,
        family_ids=family_ids,
        penalized_headings=penalized_headings,
    )
    if not post_taxonomy:
        preferred, blocked = _taxonomy_heading_constraints(family_ids, penalized_headings)
        family_rejected = any(
            preferred and c.heading_code[:4] not in preferred for c in threshold_candidates
        )
        if family_rejected:
            reason = "family_mismatch"
            detail = (
                f"candidate headings blocked by narrow family preference "
                f"{sorted(preferred)}"
            )
        else:
            reason = "taxonomy_filter_rejection"
            detail = f"blocked penalized headings {sorted(blocked)}"
        return {
            "historical_match_found": True,
            "top_historical_confidence": top.confidence if top else None,
            "top_historical_declarations": top.match_count if top else None,
            "top_historical_country_match": top.country_match if top else None,
            "qualified_candidate_count": len(threshold_candidates),
            "post_taxonomy_candidate_count": 0,
            "skip_reason": reason,
            "skip_detail": detail,
        }

    existing = set(pre_existing_cn8 or ())
    if existing and all(c.cn_digits[:8] in existing for c in post_taxonomy):
        return {
            "historical_match_found": True,
            "top_historical_confidence": top.confidence if top else None,
            "top_historical_declarations": top.match_count if top else None,
            "top_historical_country_match": top.country_match if top else None,
            "qualified_candidate_count": len(threshold_candidates),
            "post_taxonomy_candidate_count": len(post_taxonomy),
            "skip_reason": "already_in_cn_pool",
            "skip_detail": (
                "all qualified CN8 already present in CN nomenclature candidate pool"
            ),
        }

    return {
        "historical_match_found": True,
        "top_historical_confidence": top.confidence if top else None,
        "top_historical_declarations": top.match_count if top else None,
        "top_historical_country_match": top.country_match if top else None,
        "qualified_candidate_count": len(threshold_candidates),
        "post_taxonomy_candidate_count": len(post_taxonomy),
        "skip_reason": "eligible_for_injection",
        "skip_detail": "candidates qualify and are not all pre-existing",
    }


def inject_historical_candidates(
    candidate_dicts: list[dict],
    *,
    knowledge: AesKnowledgeContext | None,
    nomenclature_lookup,
) -> tuple[list[dict], int]:
    """Add AES historical CN rows to the candidate pool (never replaces CN FTS results)."""
    if not knowledge or not knowledge.candidates:
        return candidate_dicts, 0

    existing = {
        "".join(ch for ch in str(row.get("cn_code", "")) if ch.isdigit())[:8]
        for row in candidate_dicts
    }
    injected = 0
    for hist in knowledge.candidates:
        digits = hist.cn_digits[:8]
        if digits in existing:
            continue
        record = nomenclature_lookup(digits)
        if record is None:
            continue
        candidate_dicts.append(
            {
                "cn_code": record.cn_code,
                "description": record.description,
                "hierarchy_path": record.hierarchy_path,
                "chapter_code": record.chapter_code,
                "heading_code": record.heading_code,
                "_aes_knowledge": True,
            }
        )
        existing.add(digits)
        injected += 1
    return candidate_dicts, injected


def summarize_aes_knowledge(
    knowledge: AesKnowledgeContext | None,
    *,
    injected_count: int = 0,
    injection_won_ranking: bool = False,
) -> AesKnowledgeSummary | None:
    if not knowledge or not knowledge.enabled:
        return None
    top = knowledge.candidates[0] if knowledge.candidates else None
    return AesKnowledgeSummary(
        enabled=True,
        database_available=knowledge.database_available,
        candidate_count=len(knowledge.candidates),
        injected_count=injected_count,
        top_candidate_cn=top.cn_code if top else None,
        top_candidate_confidence=top.confidence if top else None,
        injection_performed=injected_count > 0,
        injection_won_ranking=injection_won_ranking,
    )
