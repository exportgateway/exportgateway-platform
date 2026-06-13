"""OpenAI product understanding service and fallback."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.product_understanding_service import (
    ENGINE_FALLBACK,
    ENGINE_OPENAI,
    ProductUnderstandingResult,
    _extract_quantity_prefix,
    _fallback_understand,
    understand_product,
)


def test_extract_quantity_prefix():
    qty, unit, stripped = _extract_quantity_prefix("500 pcs men's blue cotton jeans trousers")
    assert qty == 500
    assert unit == "pcs"
    assert "jeans" in stripped


def test_fallback_english_jeans_trousers():
    import time

    result = _fallback_understand(
        "500 pcs men's blue cotton jeans trousers",
        started=time.perf_counter(),
    )
    assert result.understanding_engine == ENGINE_FALLBACK
    assert result.quantity == 500
    assert result.unit == "pcs"
    assert "trouser" in result.english_description.lower() or "jeans" in result.search_terms
    assert result.detected_language == "en"
    assert "jeans" in result.search_terms
    assert len(result.search_terms) >= 3
    assert result.confidence <= 0.7


def test_fallback_slovenian_jeans_routes_taxonomy():
    result = _fallback_understand("Moške jeans hlače", started=0.0)
    assert result.understanding_engine == ENGINE_FALLBACK
    assert "apparel_trousers_mens" in result.product_families or any(
        "apparel" in f for f in result.product_families
    )


@patch("app.services.product_understanding_service._openai_understand")
@patch("app.services.product_understanding_service.get_settings")
def test_openai_path_when_enabled(mock_settings, mock_openai):
    settings = MagicMock()
    settings.ai_classification_enabled = True
    settings.ai_provider_api_key = "sk-test"
    settings.openai_api_key = None
    settings.openai_model = "gpt-4o-mini"
    mock_settings.return_value = settings
    mock_openai.return_value = {
        "detected_language": "en",
        "english_description": "men's blue cotton jeans trousers",
        "quantity": 500,
        "unit": "pcs",
        "search_terms": ["jeans", "trousers", "men", "cotton"],
        "product_families": ["apparel_trousers_mens"],
        "confidence": 0.92,
    }

    result = understand_product("500 pcs men's blue cotton jeans trousers")
    assert result.understanding_engine == ENGINE_OPENAI
    assert result.confidence == 0.92
    assert result.quantity == 500
    assert "apparel_trousers_mens" in result.product_families
    assert result.to_dict()["detected_language"] == "en"


@patch("app.services.product_understanding_service.get_settings")
def test_openai_failure_falls_back(mock_settings):
    settings = MagicMock()
    settings.ai_classification_enabled = True
    settings.ai_provider_api_key = "sk-test"
    settings.openai_api_key = None
    settings.openai_model = "gpt-4o-mini"
    mock_settings.return_value = settings

    with patch(
        "app.services.product_understanding_service._openai_understand",
        side_effect=RuntimeError("api down"),
    ):
        result = understand_product("Men's cotton trousers")
    assert result.understanding_engine == ENGINE_FALLBACK
    assert result.confidence < 0.7


def test_result_translation_compat_properties():
    result = ProductUnderstandingResult(
        original_text="test",
        detected_language="en",
        english_description="men's jeans",
        quantity=None,
        unit=None,
        search_terms=("jeans",),
        product_families=("apparel_trousers_mens",),
        confidence=0.9,
        understanding_engine=ENGINE_OPENAI,
        understanding_ok=True,
        understanding_ms=12.0,
    )
    assert result.text_for_classification == "men's jeans"
    assert result.translation_engine == ENGINE_OPENAI
    assert result.translation_ok is True
