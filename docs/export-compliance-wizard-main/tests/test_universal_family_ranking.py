"""Universal product family ranking — cross-industry regression tests."""

from __future__ import annotations

import pytest

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.cn_database import search_nomenclature
from app.services.cn_ranking import rank_candidates
from app.services.cn_entities import ProductEntities
from app.services.family_ranking import (
    build_family_ranking_context,
    compute_universal_layer_scores,
    restrict_candidates_to_family_space,
    row_in_family_space,
)
from app.services.taxonomy_service import detect_families, resolve_chapter_constraints
from app.services.universal_product_profile import UniversalProductProfile, build_universal_profile
from app.services.product_understanding_service import (
    ENGINE_FALLBACK,
    ProductUnderstandingResult,
)


class DummySettings:
    ai_classification_enabled = False


def _classify(description: str, disambiguation: dict | None = None):
    payload = ClassifyProductRequest(
        product_description=description,
        disambiguation=disambiguation or {},
    )
    return classify_product(payload, DummySettings())


def _winner_cn(response) -> str:
    assert response.suggestions, "Expected classification suggestions"
    return response.suggestions[0].cn_code.replace(" ", "")


# --- Textiles ---


def test_textiles_jeans_family_first_ranking():
    response = _classify(
        "500 pcs men's denim jeans trousers",
        {"textile_construction": "woven", "apparel_gender": "mens"},
    )
    winner = _winner_cn(response)
    assert winner.startswith("6203"), f"Expected trousers heading 6203, got {winner}"


def test_textiles_shirt_family_first_ranking():
    response = _classify(
        "men's cotton dress shirt",
        {"textile_construction": "woven", "apparel_gender": "mens"},
    )
    winner = _winner_cn(response)
    assert winner.startswith("6205") or winner.startswith("6201") or winner.startswith("6105"), (
        f"Expected apparel shirt heading, got {winner}"
    )


# --- Fasteners ---


@pytest.mark.parametrize(
    "query",
    [
        "steel screws M8",
        "500 pcs hex head screws",
        "vijaki iz jekla",
    ],
)
def test_fasteners_screws_rank_7318(query: str):
    response = _classify(query)
    winner = _winner_cn(response)
    assert winner.startswith("7318"), f"Screws should rank in 7318, got {winner}"


@pytest.mark.parametrize(
    "query",
    [
        "hex nuts M10",
        "steel nuts zinc plated",
    ],
)
def test_fasteners_nuts_rank_7318(query: str):
    response = _classify(query)
    winner = _winner_cn(response)
    assert winner.startswith("7318"), f"Nuts should rank in 7318, got {winner}"


# --- Construction chemicals ---


def test_chemicals_sealant_rank_3214():
    response = _classify("silicone sealant tube 300ml")
    winner = _winner_cn(response)
    assert winner.startswith("3214"), f"Sealant should rank in 3214, got {winner}"


# --- Food ---


def test_food_pizza_rank_prepared_food_heading():
    response = _classify("frozen pizza margherita")
    winner = _winner_cn(response)
    assert winner.startswith("1905") or winner.startswith("2106"), (
        f"Pizza should rank in prepared food headings, got {winner}"
    )


# --- Electronics ---


def test_electronics_laptop_rank_8471():
    response = _classify("laptop computer 15 inch")
    winner = _winner_cn(response)
    assert winner.startswith("8471"), f"Laptop should rank in 8471, got {winner}"


def test_electronics_temperature_sensor_rank_chapter_90():
    response = _classify("industrial temperature sensor PT100")
    winner = _winner_cn(response)
    assert winner.startswith("9025") or winner.startswith("9026"), (
        f"Temperature sensor should rank in ch.90 headings, got {winner}"
    )


# --- Furniture hardware ---


def test_furniture_fittings_rank_8302():
    response = _classify("pohištveno okovje za omare")
    winner = _winner_cn(response)
    assert winner.startswith("8302") or winner.startswith("8308"), (
        f"Furniture fittings should rank in 8302/8308, got {winner}"
    )


# --- Architecture unit tests ---


def test_universal_profile_inference_screws():
    understanding = ProductUnderstandingResult(
        original_text="steel screws",
        detected_language="en",
        english_description="steel screws",
        quantity=None,
        unit=None,
        search_terms=("steel", "screws"),
        product_families=(),
        confidence=0.7,
        understanding_engine=ENGINE_FALLBACK,
        understanding_ok=True,
        understanding_ms=1.0,
    )
    profile = build_universal_profile(understanding)
    assert profile.product_family == "fasteners"
    assert profile.product_type in {"screw", "screws"}
    assert "fastener_screw" in profile.taxonomy_family_ids


def test_family_layer_outranks_keyword_layer():
    profile = UniversalProductProfile(
        product_family="fasteners",
        product_type="screw",
        material="steel",
        primary_taxonomy_family="fastener_screw",
        taxonomy_family_ids=("fastener_screw",),
        confidence=0.85,
    )
    entities = ProductEntities(
        product_families=("fastener_screw",),
        heading_hints=frozenset({"7318"}),
    )
    context = build_family_ranking_context(profile=profile, entities=entities)

    family_score, _ = compute_universal_layer_scores(
        chapter_code="73",
        heading_code="7318",
        cn8_description="screws of iron or steel",
        combined_text="screws",
        context=context,
    )
    keyword_only_score, _ = compute_universal_layer_scores(
        chapter_code="96",
        heading_code="9608",
        cn8_description="ball-point pens",
        combined_text="pens",
        context=context,
    )
    assert family_score > keyword_only_score


def test_candidate_space_restricted_to_family_headings():
    profile = UniversalProductProfile(
        product_family="fasteners",
        product_type="screw",
        primary_taxonomy_family="fastener_screw",
        taxonomy_family_ids=("fastener_screw",),
        confidence=0.85,
    )
    entities = ProductEntities(product_families=("fastener_screw",))
    context = build_family_ranking_context(profile=profile, entities=entities)
    assert context.restrict_to_family_space is True

    rows = [
        {"cn_code": "7318 15 95", "chapter_code": "73", "heading_code": "7318"},
        {"cn_code": "9608 10 10", "chapter_code": "96", "heading_code": "9608"},
    ]
    restricted = restrict_candidates_to_family_space(rows, context)
    assert len(restricted) == 1
    assert restricted[0]["heading_code"].startswith("7318")
    assert row_in_family_space(
        chapter_code="73",
        heading_code="7318",
        context=context,
    )
    assert not row_in_family_space(
        chapter_code="96",
        heading_code="9608",
        context=context,
    )


def test_openai_universal_fields_mapped_to_profile():
    understanding = ProductUnderstandingResult(
        original_text="silicone sealant",
        detected_language="en",
        english_description="silicone sealant",
        quantity=None,
        unit=None,
        search_terms=("silicone", "sealant"),
        product_families=("silicone_sealant",),
        confidence=0.9,
        understanding_engine="openai",
        understanding_ok=True,
        understanding_ms=10.0,
        universal_product_family="construction_chemicals",
        universal_product_type="sealant",
        universal_material="silicone",
        universal_function="sealing",
        universal_industry="construction",
    )
    profile = build_universal_profile(understanding)
    assert profile.product_family == "construction_chemicals"
    assert profile.product_type == "sealant"
    assert profile.material == "silicone"
    assert "silicone_sealant" in profile.taxonomy_family_ids
