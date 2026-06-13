"""Tests for AES historical validation layer."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.models.schemas import ClassifyProductRequest
from app.services.classification_pipeline import run_classification_pipeline
from app.services.classification_service import classify_product
from app.services.historical_database import DEFAULT_DB_PATH, database_available
from app.services.historical_search_service import search_historical_classifications
from app.services.historical_validation import (
    MAX_SCORE_INFLUENCE,
    MIN_HISTORICAL_CONFIDENCE,
    MIN_HISTORICAL_DECLARATIONS,
    apply_historical_validation_to_ranked,
    build_validation_context,
)
from app.services.cn_ranking import RankedCandidate


class DummySettings:
    ai_classification_enabled = False


@pytest.fixture(scope="session")
def historical_db() -> Path:
    if database_available(DEFAULT_DB_PATH):
        return DEFAULT_DB_PATH
    from scripts.import_aes_historical import import_aes_historical

    import_aes_historical(rebuild=True)
    return DEFAULT_DB_PATH


def test_historical_search_returns_results(historical_db: Path):
    result = search_historical_classifications("moške jeans hlače", limit=5)
    assert result.database_available is True
    assert result.matches_found > 0
    assert result.matches
    top = result.matches[0]
    assert len(top.cn_digits) == 8
    assert top.match_count > 0


def test_strong_match_thresholds(historical_db: Path):
    result = search_historical_classifications("steel screw M8", limit=5)
    assert result.matches
    strong = [
        match
        for match in result.matches
        if match.confidence > MIN_HISTORICAL_CONFIDENCE
        and match.match_count > MIN_HISTORICAL_DECLARATIONS
    ]
    assert strong, "Expected at least one strong AES match in seed data"


def test_validation_bonus_is_capped():
    validation = build_validation_context("steel screw M8", enabled=True)
    ranked = [
        RankedCandidate(
            cn_code="7318 15 90",
            description="screws",
            score=100.0,
            confidence_level=0.8,
            match_reason="base",
            matched_keywords=("screw",),
            matched_layers=("cn8",),
        ),
        RankedCandidate(
            cn_code="7307 99 10",
            description="tube",
            score=95.0,
            confidence_level=0.75,
            match_reason="base",
            matched_keywords=("steel",),
            matched_layers=("cn8",),
        ),
    ]
    updated = apply_historical_validation_to_ranked(ranked, validation=validation)
    if validation.strong_matches:
        bonus = updated[0].score - 100.0
        assert bonus <= 100.0 * MAX_SCORE_INFLUENCE * 1.01
        assert "AES validation bonus" in updated[0].match_reason


def test_validation_can_improve_classification(historical_db: Path):
    without = run_classification_pipeline(
        "steel screw M8",
        historical_validation_enabled=False,
    )
    with_validation = run_classification_pipeline(
        "steel screw M8",
        historical_validation_enabled=True,
    )
    assert with_validation.historical_validation is not None
    if with_validation.historical_validation.validation_applied:
        assert with_validation.suggestions
        if without.suggestions:
            assert with_validation.suggestions[0].cn_code[:4] in {
                without.suggestions[0].cn_code[:4],
                "7318",
            }


def test_validation_reorders_when_exact_cn8_in_pool(historical_db: Path):
    without = run_classification_pipeline(
        "Moške jeans hlače",
        disambiguation={"textile_construction": "woven", "apparel_gender": "mens"},
        historical_validation_enabled=False,
    )
    with_validation = run_classification_pipeline(
        "Moške jeans hlače",
        disambiguation={"textile_construction": "woven", "apparel_gender": "mens"},
        historical_validation_enabled=True,
    )
    assert without.suggestions and with_validation.suggestions
    if with_validation.historical_validation.validation_applied:
        assert with_validation.suggestions[0].cn_code in {
            s.cn_code for s in without.suggestions
        }


def test_include_historical_evidence_response(historical_db: Path):
    response = classify_product(
        ClassifyProductRequest(
            product_description="pohištveno okovje",
            include_historical_evidence=True,
        ),
        DummySettings(),
    )
    assert response.historical_evidence is not None
    assert response.historical_evidence.matches_found > 0
    assert response.historical_evidence.matches
