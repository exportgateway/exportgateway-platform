"""OpenAI → taxonomy auto-answer bridge tests."""

from unittest.mock import patch

import pytest

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.openai_taxonomy_bridge import (
    AUTO_ANSWER_CONFIDENCE_THRESHOLD,
    DetectedAttributes,
    attributes_to_disambiguation_answers,
    extract_detected_attributes,
    merge_openai_taxonomy_answers,
)
from app.services.product_understanding_service import (
    ENGINE_OPENAI,
    ProductUnderstandingResult,
)


def _understanding(
    *,
    text: str,
    english: str,
    confidence: float = 0.92,
    terms: tuple[str, ...] = (),
    families: tuple[str, ...] = (),
    attributes: dict[str, str] | None = None,
) -> ProductUnderstandingResult:
    return ProductUnderstandingResult(
        original_text=text,
        detected_language="sl",
        english_description=english,
        quantity=500,
        unit="pcs",
        search_terms=terms,
        product_families=families,
        confidence=confidence,
        understanding_engine=ENGINE_OPENAI,
        understanding_ok=True,
        understanding_ms=12.0,
        language_detection_method="openai",
        language_detection_confidence=confidence,
        detected_attributes_raw=attributes,
    )


class DummySettings:
    ai_classification_enabled = False


def test_extract_attributes_slovenian_jeans():
    understanding = _understanding(
        text="500 kos moške bombažne jeans hlače",
        english="men's cotton denim jeans trousers",
        terms=("jeans", "trousers", "men", "cotton", "denim"),
        families=("apparel_trousers_mens",),
        attributes={
            "gender": "male",
            "material": "cotton",
            "fabric": "denim",
            "construction": "woven",
        },
    )
    detected = extract_detected_attributes(understanding)
    assert detected.gender == "Men"
    assert detected.material == "Cotton"
    assert detected.fabric == "Denim"
    assert detected.construction == "Woven"


def test_auto_answer_textile_construction_when_confidence_high():
    understanding = _understanding(
        text="500 kos moške bombažne jeans hlače",
        english="men's cotton denim jeans trousers",
        terms=("jeans", "trousers", "men", "cotton", "denim"),
        families=("apparel_trousers_mens",),
        attributes={
            "gender": "male",
            "material": "cotton",
            "fabric": "denim",
            "construction": "woven",
        },
    )
    merged, auto_answered, detected = merge_openai_taxonomy_answers(understanding)
    assert "textile_construction" in auto_answered
    assert merged["textile_construction"] == "woven"
    assert detected.fabric == "Denim"


def test_no_auto_answer_when_confidence_below_threshold():
    understanding = _understanding(
        text="Men's cotton trousers",
        english="men's cotton trousers",
        confidence=0.72,
        terms=("trousers", "cotton", "men"),
        families=("apparel_trousers_mens",),
        attributes={"material": "cotton", "construction": "woven", "gender": "male"},
    )
    merged, auto_answered, _ = merge_openai_taxonomy_answers(understanding)
    assert auto_answered == []
    assert "textile_construction" not in merged


def test_user_disambiguation_not_overwritten():
    understanding = _understanding(
        text="Men's jeans",
        english="men's jeans",
        terms=("jeans", "men"),
        families=("apparel_trousers_mens",),
        attributes={"construction": "woven", "gender": "male"},
    )
    merged, auto_answered, _ = merge_openai_taxonomy_answers(
        understanding,
        user_disambiguation={"textile_construction": "knitted"},
    )
    assert merged["textile_construction"] == "knitted"
    assert "textile_construction" not in auto_answered


def test_attributes_to_disambiguation_jeans_implies_woven():
    attrs = DetectedAttributes(fabric="Denim", construction="Woven", gender="Men")
    understanding = _understanding(
        text="Men's jeans",
        english="men's jeans",
        terms=("jeans", "denim", "men"),
        families=("apparel_trousers_mens",),
    )
    answers = attributes_to_disambiguation_answers(attrs, understanding)
    assert answers["textile_construction"] == "woven"


@patch("app.services.classification_pipeline.understand_product")
def test_classify_auto_answers_and_suggests(mock_understand):
    mock_understand.return_value = _understanding(
        text="500 kos moške bombažne jeans hlače",
        english="men's cotton denim jeans trousers",
        terms=("jeans", "trousers", "men", "cotton", "denim"),
        families=("apparel_trousers_mens",),
        attributes={
            "gender": "male",
            "material": "cotton",
            "fabric": "denim",
            "construction": "woven",
        },
    )
    response = classify_product(
        ClassifyProductRequest(product_description="500 kos moške bombažne jeans hlače"),
        DummySettings(),
    )
    assert response.classification_state == "SUGGEST"
    assert response.suggestions
    assert "textile_construction" in response.auto_answered_questions
    assert response.detected_attributes is not None
    assert response.detected_attributes.gender == "Men"
    assert response.detected_attributes.material == "Cotton"
    assert response.detected_attributes.fabric == "Denim"
    assert response.detected_attributes.construction == "Woven"
    assert not response.disambiguation_questions


@patch("app.services.classification_pipeline.understand_product")
def test_classify_low_confidence_still_disambiguates(mock_understand):
    mock_understand.return_value = _understanding(
        text="Men's cotton trousers",
        english="men's cotton trousers",
        confidence=0.70,
        terms=("trousers", "cotton", "men"),
        families=("apparel_trousers_mens",),
        attributes={"material": "cotton", "gender": "male"},
    )
    response = classify_product(
        ClassifyProductRequest(product_description="Men's cotton trousers"),
        DummySettings(),
    )
    assert response.classification_state == "DISAMBIGUATE"
    assert response.auto_answered_questions == []
    assert any(q.id == "textile_construction" for q in response.disambiguation_questions)


def test_confidence_threshold_constant():
    assert AUTO_ANSWER_CONFIDENCE_THRESHOLD == 0.85
