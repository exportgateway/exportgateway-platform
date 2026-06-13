from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.translation_service import detect_language, translate_to_english


class DummySettings:
    ai_classification_enabled = False


def test_detect_slovenian_industrial_sensor_not_german():
    from app.services.translation_service import detect_language_with_confidence

    detection = detect_language_with_confidence(
        "Industrijski temperaturni senzor Pepperl+Fuchs REF-H180"
    )
    assert detection.language == "sl"
    assert detection.confidence >= 0.8
    assert detection.method != "langdetect" or detection.language == "sl"


def test_detect_slovenian_vehicle_description():
    code = detect_language("Rabljeno tovorno vozilo DAF XF 480")
    assert code == "sl"


def test_translate_slovenian_vehicle_to_english_glossary():
    result = translate_to_english("Rabljeno tovorno vozilo DAF XF 480")
    assert result.detected_language == "sl"
    assert "goods vehicle" in result.translated_text.lower()
    assert "480" not in result.translated_text.split() or "goods" in result.translated_text.lower()


def test_english_passthrough():
    result = translate_to_english("Ball bearings")
    assert result.detected_language == "en"
    assert result.translation_engine == "passthrough"
    assert result.translated_text == "Ball bearings"


def test_slovenian_kroglasti_lezaj_translates():
    result = translate_to_english("Kroglasti ležaj SKF 6205")
    assert result.detected_language == "sl"
    assert result.translation_ok is True
    assert result.translation_engine == "glossary"
    assert result.translation_engine_display == "Glossary"
    assert "ball" in result.translated_text.lower()
    assert "bearing" in result.translated_text.lower()


def test_multilingual_classification_not_paper_chapter():
    response = classify_product(
        ClassifyProductRequest(
            product_description="Rabljeno tovorno vozilo DAF XF 480",
            disambiguation={"vehicle_gvm_band": "over_5t"},
        ),
        DummySettings(),
    )
    assert response.original_description
    assert response.translated_description
    assert response.detected_language == "sl"
    assert response.suggestions
    assert response.suggestions[0].cn_code.startswith("870")
    assert not response.suggestions[0].cn_code.startswith("4802")
