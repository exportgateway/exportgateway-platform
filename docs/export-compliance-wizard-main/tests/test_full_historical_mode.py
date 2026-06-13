"""Tests for full AES historical knowledge mode."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from app.services.aes_tariff_normalize import normalize_export_tariff, normalize_import_tariff
from app.services.aes_mode import get_aes_mode
from app.startup_diagnostics import probe_aes_knowledge_engine


@pytest.mark.parametrize(
    ("tariff", "expected_cn8"),
    [
        ("7318159090", "73181590"),
        ("3920102190", "39201021"),
        ("8302420090", "83024200"),
        ("62034231", "62034231"),
    ],
)
def test_import_tariff_normalization_preserves_original(tariff: str, expected_cn8: str):
    result = normalize_import_tariff(tariff)
    assert result is not None
    assert result.original_tariff == tariff
    assert result.cn8 == expected_cn8
    assert result.heading_code == expected_cn8[:4]


def test_export_tariff_normalization():
    result = normalize_export_tariff("6203 42 31")
    assert result is not None
    assert result.original_tariff == "62034231"
    assert result.cn8 == "62034231"


def test_aes_mode_defaults_to_full():
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("AES_MODE", None)
        from app.core.config import get_settings

        get_settings.cache_clear()
        assert get_aes_mode() == "full"
        get_settings.cache_clear()


def test_aes_mode_seed_override():
    with patch.dict(os.environ, {"AES_MODE": "seed"}, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        assert get_aes_mode() == "seed"
        get_settings.cache_clear()


def test_probe_aes_knowledge_engine_includes_full_mode_fields():
    payload = probe_aes_knowledge_engine()
    assert payload["aes_mode"] in {"seed", "full"}
    assert "exports_records" in payload
    assert "imports_records" in payload
    assert "exports_unique_cn8" in payload
    assert "imports_unique_cn8" in payload


def test_unified_search_seed_mode(monkeypatch):
    from scripts.import_aes_historical import import_aes_historical
    from app.services.historical_search_service import search_historical_classifications

    import_aes_historical(rebuild=True)
    monkeypatch.setenv("AES_MODE", "seed")
    from app.core.config import get_settings

    get_settings.cache_clear()
    result = search_historical_classifications("moške jeans hlače", limit=3)
    get_settings.cache_clear()
    assert result.database_available
    assert result.matches
