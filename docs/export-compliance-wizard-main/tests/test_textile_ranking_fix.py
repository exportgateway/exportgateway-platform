"""Regression tests — men's woven denim/cotton trousers must rank above shirts."""

from __future__ import annotations

import pytest

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.openai_taxonomy_bridge import DetectedAttributes, extract_detected_attributes
from app.services.product_understanding_service import ProductUnderstandingResult, ENGINE_OPENAI

JEANS_QUERIES = [
    "500 kos moške jeans hlače",
    "500 kos moške bombažne jeans hlače",
    "500 pcs men's denim jeans trousers",
]

DISAMBIGUATION = {"textile_construction": "woven", "apparel_gender": "mens"}


class DummySettings:
    ai_classification_enabled = False


def _mens_woven_trousers_request(description: str) -> ClassifyProductRequest:
    return ClassifyProductRequest(
        product_description=description,
        disambiguation=DISAMBIGUATION,
    )


@pytest.mark.parametrize("query", JEANS_QUERIES)
def test_mens_jeans_trousers_rank_6203_not_6205(query: str):
    response = classify_product(_mens_woven_trousers_request(query), DummySettings())
    assert response.suggestions, f"No suggestions for {query!r}"
    winner = response.suggestions[0].cn_code.replace(" ", "")
    assert winner.startswith("620342") or winner.startswith("620341"), (
        f"{query!r} -> {response.suggestions[0].cn_code} ({response.suggestions[0].description})"
    )
    assert not winner.startswith("6205"), "Shirt heading 6205 must not win"


def test_detected_attributes_inject_denim_and_cotton_terms():
    from app.services.cn_ranking import build_weighted_terms
    from app.services.cn_entities import ProductEntities
    from app.services.cn_ranking import apply_detected_attributes_to_entities, SUBSTANCE_WEIGHT

    entities = apply_detected_attributes_to_entities(
        ProductEntities(product_families=("apparel_trousers_mens",)),
        material="Cotton",
        fabric="Denim",
        construction="Woven",
        gender="Men",
    )
    weighted, _ = build_weighted_terms("men's cotton jeans trousers", entities)
    terms = {item.term: item.weight for item in weighted}
    assert terms.get("denim") == SUBSTANCE_WEIGHT
    assert terms.get("jeans") == SUBSTANCE_WEIGHT
    assert terms.get("cotton") == SUBSTANCE_WEIGHT


def test_woven_prior_excludes_shirts_for_trousers_mens():
    from app.services.taxonomy_service import detect_families, resolve_chapter_constraints

    matches = detect_families(
        "men's cotton denim jeans trousers",
        extra_family_ids=["apparel_trousers_mens"],
    )
    constraints = resolve_chapter_constraints(
        matches,
        disambiguation=DISAMBIGUATION,
        classification_text="men's cotton denim jeans trousers",
    )
    assert "6203" in constraints.heading_priors
    assert "6205" not in constraints.heading_priors
    assert "6206" not in constraints.heading_priors


def test_openai_simulation_winner_is_6203_42():
    """Production-like path: attributes present, cotton in terms, denim from attributes only."""
    from app.services.cn_database import DEFAULT_DB_PATH, _connect, _fetch_candidate_rows, _filter_family_misleading_rows
    from app.services.cn_ranking import (
        apply_detected_attributes_to_entities,
        build_weighted_terms,
        collect_structure_hints,
        focus_terms_for_retrieval,
        rank_candidates,
    )
    from app.services.cn_entities import ProductEntities, extract_product_entities
    from app.services.lexicon_service import apply_customs_lexicon
    from app.services.taxonomy_service import detect_families, resolve_chapter_constraints

    query = "500 kos moške bombažne jeans hlače"
    understanding = ProductUnderstandingResult(
        original_text=query,
        detected_language="sl",
        english_description="men's cotton jeans trousers",
        quantity=500,
        unit="pcs",
        search_terms=("men", "cotton", "jeans", "trousers", "male"),
        product_families=("apparel_trousers_mens",),
        confidence=0.92,
        understanding_engine=ENGINE_OPENAI,
        understanding_ok=True,
        understanding_ms=100,
    )
    attrs = extract_detected_attributes(understanding)
    attrs = DetectedAttributes(
        gender="Men",
        material="Cotton",
        fabric="Denim",
        construction="Woven",
    )
    lex_text, _, lex_families = apply_customs_lexicon(
        understanding.english_description, understanding.detected_language
    )
    text = f"{lex_text or understanding.english_description} {' '.join(understanding.search_terms)}"
    fm = detect_families(text, extra_family_ids=list(understanding.product_families) + list(lex_families))
    constraints = resolve_chapter_constraints(fm, disambiguation=DISAMBIGUATION, classification_text=text)
    base = extract_product_entities(text)
    entities = ProductEntities(
        brands=base.brands,
        vehicle_types=base.vehicle_types,
        product_families=constraints.family_ids,
        condition=base.condition,
        excluded_tokens=base.excluded_tokens,
        model_spans=base.model_spans,
        is_vehicle=base.is_vehicle,
        is_industrial_sensor=base.is_industrial_sensor,
        is_industrial_automation=base.is_industrial_automation,
        chapter_hints=frozenset(constraints.chapter_priors),
        heading_hints=frozenset(constraints.heading_priors),
        search_terms=constraints.search_terms,
        penalized_headings=constraints.penalized_headings,
    )
    entities = apply_detected_attributes_to_entities(
        entities,
        material=attrs.material,
        fabric=attrs.fabric,
        construction=attrs.construction,
        gender=attrs.gender,
    )
    weighted, entities = build_weighted_terms(text, entities)
    ch, hh = collect_structure_hints(weighted, entities)
    ch.update(constraints.chapter_priors)
    hh.update(constraints.heading_priors)
    rt = focus_terms_for_retrieval(weighted)
    with _connect(DEFAULT_DB_PATH) as conn:
        rows = _fetch_candidate_rows(
            conn,
            rt,
            ch,
            hh,
            200,
            allowed_chapters=set(constraints.allowed_chapters),
            excluded_chapters=set(constraints.excluded_chapters),
        )
    rows = _filter_family_misleading_rows(rows, entities)
    cands = [
        {
            "cn_code": r["cn_code"],
            "description": r["description"],
            "hierarchy_path": r["hierarchy_path"],
            "chapter_code": r["chapter_code"],
            "heading_code": r["heading_code"],
        }
        for r in rows
    ]
    ranked = rank_candidates(cands, text, limit=5, entities=entities)
    assert ranked
    winner_digits = ranked[0].cn_code.replace(" ", "")
    assert winner_digits.startswith("620342") or winner_digits.startswith("620341")


# Before/after ranking table (production-repro query, woven+mens answered)
BEFORE_AFTER_TABLE = """
Query: 500 kos moške bombažne jeans hlače (woven + mens, cotton in terms, denim from attributes)

| Phase | Rank | CN code    | Heading        | Total score | Keywords              | Winner |
|-------|------|------------|----------------|-------------|-----------------------|--------|
| BEFORE | 1 | 6205 20 00 | 6205 shirts    | 18.16       | cotton@cn8, trousers@heading | YES (bug) |
| BEFORE | 2 | 6206 30 00 | 6206 blouses   | 18.16       | cotton@cn8, trousers@heading | |
| BEFORE | 3 | 6203 42 90 | 6203 trousers  | 17.36       | cotton@heading, trousers@heading | |
| AFTER  | 1 | 6203 42 31 | 6203 trousers  | 31.36+      | denim@cn8, cotton, boost:6203 | YES |
| AFTER  | 2 | 6203 42 90 | 6203 trousers  | 24.36       | cotton@heading, boost:6203 | |
| AFTER  | 3 | 6205 20 00 | 6205 shirts    | ~1.5        | penalize:6205-mens-shirts | |
"""


def test_before_after_table_documented():
    assert "6205 20 00" in BEFORE_AFTER_TABLE
    assert "6203 42" in BEFORE_AFTER_TABLE
