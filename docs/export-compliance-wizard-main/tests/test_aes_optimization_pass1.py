"""Tests for AES optimization pass #1 — threshold + combined historical query."""

from __future__ import annotations

from app.services.aes_knowledge_engine import MIN_CANDIDATE_DECLARATIONS
from app.services.historical_search_service import build_historical_search_query


def test_declaration_threshold_lowered_to_two():
    assert MIN_CANDIDATE_DECLARATIONS == 2


def test_build_historical_search_query_raw_only_when_english_missing():
    assert build_historical_search_query("proximity sensor", None) == "proximity sensor"
    assert build_historical_search_query("proximity sensor", "") == "proximity sensor"


def test_build_historical_search_query_combines_raw_and_english():
    query = build_historical_search_query(
        "proximity sensor",
        "for a current not exceeding 10 a",
    )
    assert query == "proximity sensor for a current not exceeding 10 a"


def test_build_historical_search_query_skips_duplicate_english():
    assert build_historical_search_query("spaghetti", "spaghetti") == "spaghetti"
