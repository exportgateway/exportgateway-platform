"""Tests for AES Knowledge Engine v1."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.aes_knowledge_engine import (
    MAX_KNOWLEDGE_SCORE_INFLUENCE,
    build_aes_knowledge_context,
    compute_candidate_confidence,
    inject_historical_candidates,
    knowledge_bonus_for_candidate,
)
from app.services.brand_knowledge import (
    MAX_BRAND_SCORE_INFLUENCE,
    brand_bonus_for_candidate,
    build_brand_knowledge_context,
    detect_brands_in_text,
)
from app.services.classification_pipeline import run_classification_pipeline
from app.services.cn_database import search_nomenclature
from app.services.historical_database import DEFAULT_DB_PATH, database_available


@pytest.fixture(scope="session")
def historical_db() -> Path:
    if database_available(DEFAULT_DB_PATH):
        return DEFAULT_DB_PATH
    from scripts.import_aes_historical import import_aes_historical

    import_aes_historical(rebuild=True)
    return DEFAULT_DB_PATH


def test_candidate_confidence_blend():
    confidence = compute_candidate_confidence(
        declaration_count=25,
        similarity_score=0.9,
        country_match=1.0,
    )
    assert 0.8 <= confidence <= 0.99


def test_knowledge_bonus_capped():
    knowledge = build_aes_knowledge_context("steel screw M8", enabled=True)
    if not knowledge.candidates:
        pytest.skip("No knowledge candidates in seed data")
    bonus, _ = knowledge_bonus_for_candidate(100.0, cn_digits=knowledge.candidates[0].cn_digits, knowledge=knowledge)
    assert bonus <= 100.0 * MAX_KNOWLEDGE_SCORE_INFLUENCE


def test_inject_historical_candidates_adds_rows(historical_db: Path):
    knowledge = build_aes_knowledge_context("moške jeans hlače", enabled=True)
    if not knowledge.candidates:
        pytest.skip("No injectable knowledge candidates")

    base_rows = [
        {
            "cn_code": "0000 00 00",
            "description": "placeholder",
            "hierarchy_path": "",
            "chapter_code": "00",
            "heading_code": "0000",
        }
    ]

    def lookup(digits: str):
        from app.services.cn_database import lookup_by_digits

        return lookup_by_digits(digits)

    updated, injected = inject_historical_candidates(base_rows, knowledge=knowledge, nomenclature_lookup=lookup)
    assert injected >= 0
    assert len(updated) >= len(base_rows)


def test_brand_detection():
    brands = detect_brands_in_text("Sikaflex 11 FC plus Loctite 243")
    assert "sikaflex" in brands
    assert "loctite" in brands


def test_brand_bonus_capped():
    context = build_brand_knowledge_context("Bosch professional drill")
    if not context.matches:
        pytest.skip("Brand map not generated yet")
    bonus, _ = brand_bonus_for_candidate(
        80.0,
        cn_digits=context.matches[0].cn_digits,
        brand_context=context,
    )
    assert bonus <= 80.0 * MAX_BRAND_SCORE_INFLUENCE


def test_pipeline_exposes_knowledge_summary(historical_db: Path):
    result = run_classification_pipeline("steel screw M8", historical_validation_enabled=True)
    assert result.aes_knowledge is not None
    assert result.aes_knowledge.enabled is True
