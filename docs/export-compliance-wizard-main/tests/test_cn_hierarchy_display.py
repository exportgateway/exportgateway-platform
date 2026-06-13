from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.cn_database import lookup_by_digits
from app.services.cn_hierarchy_display import (
    build_combined_description,
    build_hierarchy_display,
    enrich_cn_suggestion,
)
from tests.test_services import DummySettings


def test_enrich_suggestion_includes_hierarchy_fields():
    suggestion = enrich_cn_suggestion(
        cn_code="6103 42 00",
        description="Of cotton",
        confidence_level=0.9,
        match_explanation="test",
    )
    assert suggestion.chapter_code == "61"
    assert suggestion.chapter_title
    assert "knitted" in suggestion.chapter_title.lower()
    assert suggestion.heading_code == "6103"
    assert suggestion.heading_title
    assert suggestion.combined_description
    assert "cotton" in suggestion.combined_description.lower()
    assert len(suggestion.hierarchy_levels) >= 3


def test_classify_response_exposes_hierarchy_on_suggestions():
    response = classify_product(
        ClassifyProductRequest(
            product_description="Men's cotton trousers",
            disambiguation={"textile_construction": "knitted"},
        ),
        DummySettings(),
    )
    assert response.suggestions
    first = response.suggestions[0]
    assert first.combined_description
    assert first.chapter_code in {"61", "62"}


def test_build_combined_description_appends_material():
    record = lookup_by_digits("61034200")
    assert record is not None
    display = build_hierarchy_display(record)
    assert "cotton" in display.combined_description.lower()
    assert display.heading_title
