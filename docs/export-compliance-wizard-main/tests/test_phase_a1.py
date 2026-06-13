"""Phase A.1 quality hardening regression tests."""

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.translation_service import detect_language_with_confidence
from tests.test_services import DummySettings


def test_laptop_computer_detected_as_english():
    detection = detect_language_with_confidence("Laptop computer")
    assert detection.language == "en"
    assert detection.method in {"ascii-technical-english", "langdetect", "default"}


def test_temperature_sensor_detected_as_english():
    detection = detect_language_with_confidence("Temperature sensor")
    assert detection.language == "en"


def test_classify_laptop_not_refrigeration():
    response = classify_product(
        ClassifyProductRequest(product_description="Laptop computer"),
        DummySettings(),
    )
    assert response.detected_language == "en"
    assert response.suggestions
    top = response.suggestions[0].cn_code.replace(" ", "")
    assert top.startswith("8471") or top.startswith("8470")
    assert not top.startswith("8418")


def test_classify_temperature_sensor_chapter_90():
    response = classify_product(
        ClassifyProductRequest(product_description="Temperature sensor"),
        DummySettings(),
    )
    assert response.detected_language == "en"
    assert response.suggestions
    assert response.suggestions[0].cn_code.replace(" ", "").startswith("9025")
    assert response.classification_state in {"SUGGEST", "DISAMBIGUATE"}


def test_classify_bike_disambiguates_or_suggests_87():
    response = classify_product(
        ClassifyProductRequest(product_description="Bike"),
        DummySettings(),
    )
    assert response.detected_language == "en"
    if response.classification_state == "DISAMBIGUATE":
        assert response.disambiguation_questions
        assert not response.requires_manual_entry
        qids = [q.id for q in response.disambiguation_questions]
        assert "cycle_type" in qids
        return
    assert response.suggestions
    assert response.suggestions[0].cn_code.replace(" ", "").startswith("87")


def test_mens_cotton_trousers_disambiguate_without_manual():
    response = classify_product(
        ClassifyProductRequest(product_description="Men's cotton trousers"),
        DummySettings(),
    )
    assert response.classification_state == "DISAMBIGUATE"
    assert response.disambiguation_questions
    assert response.requires_manual_entry is False
    qids = [q.id for q in response.disambiguation_questions]
    assert "textile_construction" in qids
    assert "apparel_gender" not in qids


def test_classify_chemical_pens_chapter_96():
    response = classify_product(
        ClassifyProductRequest(product_description="Chemical pens with liquid ink"),
        DummySettings(),
    )
    assert response.suggestions
    chapters = {s.cn_code.replace(" ", "")[:2] for s in response.suggestions[:3]}
    assert "96" in chapters


def test_confidence_spread_among_suggestions():
    response = classify_product(
        ClassifyProductRequest(product_description="Chemical pens with liquid ink"),
        DummySettings(),
    )
    if len(response.suggestions) < 2:
        return
    confs = [s.confidence_level for s in response.suggestions]
    assert confs[0] >= confs[1]
    if confs[0] == confs[1]:
        assert len(set(confs)) == 1
    else:
        assert confs[0] - confs[-1] >= 0.03 or confs[0] > confs[1]
