"""Universal product family ranking — family-first candidate restriction and layered scoring."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from app.services.cn_entities import ProductEntities
from app.services.taxonomy_service import _load_taxonomy
from app.services.universal_product_profile import UniversalProductProfile

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "universal_family_ranking.json"


@dataclass(frozen=True)
class FamilyRankingContext:
    profile: UniversalProductProfile
    taxonomy_family_ids: tuple[str, ...] = ()
    allowed_chapters: frozenset[str] = frozenset()
    heading_priors: frozenset[str] = frozenset()
    penalized_headings: frozenset[str] = frozenset()
    historical_headings: frozenset[str] = frozenset()
    restrict_to_family_space: bool = False

    @property
    def weights(self) -> dict[str, float]:
        return _load_config().get("weights", {})


def _load_config() -> dict:
    return _load_config_cached()


@lru_cache(maxsize=1)
def _load_config_cached() -> dict:
    if not CONFIG_PATH.is_file():
        return {}
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_family_ranking_context(
    *,
    profile: UniversalProductProfile,
    entities: ProductEntities,
    allowed_chapters: set[str] | frozenset[str] | None = None,
    heading_priors: set[str] | frozenset[str] | None = None,
    penalized_headings: set[str] | frozenset[str] | None = None,
) -> FamilyRankingContext:
    config = _load_config()
    primary_ids = (profile.primary_taxonomy_family,) if profile.primary_taxonomy_family else ()
    taxonomy_ids = tuple(
        dict.fromkeys(
            [
                *(profile.taxonomy_family_ids or ()),
                *(entities.product_families or ()),
                *primary_ids,
            ]
        )
    )

    priors: set[str] = set(heading_priors or ())
    priors.update(entities.heading_hints)
    allowed: set[str] = set(allowed_chapters or ())
    penalized: set[str] = set(penalized_headings or ())
    penalized.update(entities.penalized_headings)

    historical: set[str] = set()
    hist_map = config.get("historical_heading_priors", {})
    for fid in taxonomy_ids:
        historical.update(hist_map.get(fid, []))

    taxonomy = _load_taxonomy()
    entries = {entry["id"]: entry for entry in taxonomy.get("families", [])}
    constraint_families = taxonomy_ids[:1] if profile.primary_taxonomy_family else taxonomy_ids
    for fid in constraint_families:
        entry = entries.get(fid, {})
        for chapter in entry.get("chapters", []):
            allowed.add(str(chapter))
        for heading in entry.get("headings", []):
            priors.add(str(heading)[:4])
        for heading in entry.get("penalized_headings", []):
            penalized.add(str(heading)[:4])

    restrict = bool(
        taxonomy_ids
        and profile.confidence >= 0.62
        and (priors or allowed)
    )

    return FamilyRankingContext(
        profile=profile,
        taxonomy_family_ids=taxonomy_ids,
        allowed_chapters=frozenset(allowed),
        heading_priors=frozenset(priors),
        penalized_headings=frozenset(penalized),
        historical_headings=frozenset(historical),
        restrict_to_family_space=restrict,
    )


def row_in_family_space(
    *,
    chapter_code: str,
    heading_code: str,
    context: FamilyRankingContext,
) -> bool:
    heading_prefix = (heading_code or "")[:4]
    chapter = chapter_code or ""

    if heading_prefix and heading_prefix in context.penalized_headings:
        return False

    if context.heading_priors:
        if heading_prefix in context.heading_priors:
            return True
        if context.restrict_to_family_space:
            return False

    if context.allowed_chapters:
        return chapter in context.allowed_chapters

    return True


def restrict_candidates_to_family_space(
    rows: list[dict],
    context: FamilyRankingContext | None,
) -> list[dict]:
    if context is None or not context.restrict_to_family_space:
        return rows

    restricted = [
        row
        for row in rows
        if row_in_family_space(
            chapter_code=str(row.get("chapter_code", "")),
            heading_code=str(row.get("heading_code", "")),
            context=context,
        )
    ]
    return restricted or rows


def compute_universal_layer_scores(
    *,
    chapter_code: str,
    heading_code: str,
    cn8_description: str,
    combined_text: str,
    context: FamilyRankingContext | None,
) -> tuple[float, list[str]]:
    """Return additive score from family > type > historical > material layers."""
    if context is None:
        return 0.0, []

    weights = context.weights
    heading_prefix = (heading_code or "")[:4]
    blob = f"{cn8_description} {combined_text}".lower()
    signals: list[str] = []
    score = 0.0

    family_match = False
    if context.taxonomy_family_ids and heading_prefix:
        taxonomy = _load_taxonomy()
        entries = {entry["id"]: entry for entry in taxonomy.get("families", [])}
        for fid in context.taxonomy_family_ids:
            entry = entries.get(fid, {})
            headings = {str(h)[:4] for h in entry.get("headings", [])}
            chapters = {str(c) for c in entry.get("chapters", [])}
            if heading_prefix in headings or chapter_code in chapters:
                family_match = True
                signals.append(f"family:{fid}")
                break
    if context.profile.product_family and family_match:
        score += weights.get("product_family", 50.0)
        signals.append(f"universal_family:{context.profile.product_family}")

    type_match = False
    if context.profile.product_type and context.profile.primary_taxonomy_family:
        entry = _load_taxonomy().get("families", [])
        entries = {item["id"]: item for item in entry}
        primary = entries.get(context.profile.primary_taxonomy_family, {})
        headings = {str(h)[:4] for h in primary.get("headings", [])}
        if heading_prefix in headings:
            type_match = True
            score += weights.get("product_type", 30.0)
            signals.append(f"type:{context.profile.product_type}")

    if context.historical_headings and heading_prefix in context.historical_headings:
        score += weights.get("historical_evidence", 20.0)
        signals.append(f"historical:{heading_prefix}")

    material = (context.profile.material or "").lower()
    if material:
        config = _load_config()
        material_hints = list(config.get("material_heading_hints", {}).get(material, []))
        exclusions = config.get("material_heading_exclusions", {}).get(
            context.profile.product_family or "", []
        )
        if exclusions:
            material_hints = [hint for hint in material_hints if str(hint)[:4] not in exclusions]
        if heading_prefix in {str(h)[:4] for h in material_hints}:
            score += weights.get("material", 10.0)
            signals.append(f"material:{material}")
        elif material in blob:
            score += weights.get("material", 10.0) * 0.35
            signals.append(f"material_text:{material}")

    if context.heading_priors and heading_prefix in context.heading_priors:
        score += weights.get("product_family", 50.0) * 0.15

    return score, signals
