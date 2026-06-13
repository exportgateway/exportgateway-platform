from unittest.mock import patch

from app.services.translation_service import (
    ENGINE_ARGOS,
    ENGINE_GLOSSARY,
    ENGINE_ORIGINAL_FALLBACK,
    translate_to_english,
)


def test_glossary_has_priority_over_argos():
    with patch("app.services.translation_service._argos_translate") as mock_argos:
        mock_argos.return_value = "argos only translation"
        result = translate_to_english("Kugellager SKF 6205", language="de")
        mock_argos.assert_not_called()
        assert result.translation_engine == ENGINE_GLOSSARY
        assert "ball" in result.translated_text.lower()


def test_argos_used_when_glossary_misses():
    with patch("app.services.translation_service._argos_translate") as mock_argos:
        mock_argos.return_value = "industrial programmable logic controller"
        result = translate_to_english(
            "Průmyslový programovatelný automat pro výrobní linku",
            language="cs",
        )
        mock_argos.assert_called_once()
        assert result.translation_engine == ENGINE_ARGOS
        assert result.translation_ok is True


def test_original_fallback_when_glossary_and_argos_fail():
    with patch("app.services.translation_service._argos_translate", return_value=None):
        result = translate_to_english("Xyzzy neznámý výrobek bez překladu", language="cs")
        assert result.translation_engine == ENGINE_ORIGINAL_FALLBACK
        assert result.translation_ok is False
        assert result.translated_text == result.original_text
