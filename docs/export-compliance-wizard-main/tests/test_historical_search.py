"""Tests for AES historical evidence search and API."""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _seed_aes_mode_for_historical_tests(monkeypatch):
    """These tests target the seed/historical fixture DB, not full exports+imports."""
    monkeypatch.setenv("AES_MODE", "seed")
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import ClassifyProductRequest, HistorySearchRequest


class DummySettings:
    ai_classification_enabled = False
from app.services.classification_service import classify_product
from app.services.historical_database import DEFAULT_DB_PATH, database_available
from app.services.historical_search_service import search_historical_classifications

TEST_QUERIES = [
    "moške jeans hlače",
    "pohištveno okovje",
    "robni trak ABS",
    "industrijsko lepilo",
]

AES_XLSX = Path(__file__).resolve().parent.parent.parent / "grdAes2Report_DocAndItem-export_full_list.xlsx"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def historical_db() -> Path:
    if database_available(DEFAULT_DB_PATH):
        return DEFAULT_DB_PATH
    if not AES_XLSX.is_file():
        pytest.skip(f"AES dataset missing: {AES_XLSX}")
    from scripts.import_aes_historical import import_aes_historical

    import_aes_historical(input_path=AES_XLSX, db_path=DEFAULT_DB_PATH, rebuild=True)
    return DEFAULT_DB_PATH


@pytest.mark.parametrize("query", TEST_QUERIES)
def test_historical_search_returns_results(query: str, historical_db: Path):
    result = search_historical_classifications(query, limit=5, db_path=historical_db)
    assert result.database_available is True
    assert result.matches_found > 0, f"No FTS hits for {query!r}"
    assert result.matches, f"No aggregated CN matches for {query!r}"
    top = result.matches[0]
    assert len(top.cn_digits) == 8
    assert top.match_count > 0
    assert top.top_descriptions


@pytest.mark.parametrize("query", TEST_QUERIES)
def test_historical_search_performance_under_500ms(query: str, historical_db: Path):
    started = time.perf_counter()
    result = search_historical_classifications(query, limit=5, db_path=historical_db)
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert result.matches_found >= 0
    assert elapsed_ms < 500, f"Search took {elapsed_ms:.1f} ms for {query!r}"


@pytest.mark.parametrize("query", TEST_QUERIES)
def test_historical_evidence_attached_without_changing_when_validation_off(query: str, historical_db: Path):
    settings = DummySettings()
    without = classify_product(
        ClassifyProductRequest(
            product_description=query,
            include_historical_evidence=False,
            historical_validation_enabled=False,
        ),
        settings,
    )
    with_evidence = classify_product(
        ClassifyProductRequest(
            product_description=query,
            include_historical_evidence=True,
            historical_validation_enabled=False,
        ),
        settings,
    )

    assert without.classification_state == with_evidence.classification_state
    assert (without.suggestions[0].cn_code if without.suggestions else None) == (
        with_evidence.suggestions[0].cn_code if with_evidence.suggestions else None
    )
    assert with_evidence.historical_evidence is not None
    assert with_evidence.historical_evidence.matches_found > 0


def test_history_search_api(client, historical_db: Path):
    for query in TEST_QUERIES[:1]:
        response = client.post(
            "/api/history/search",
            json=HistorySearchRequest(product_description=query, limit=5).model_dump(),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["matches_found"] > 0
        assert body["matches"]
