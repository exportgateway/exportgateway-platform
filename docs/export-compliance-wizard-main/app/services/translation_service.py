"""EU multilingual layer — detect language and translate product text to English (offline-first)."""

from __future__ import annotations

import json
import logging
import os
import re
import time
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.argos_install_config import (
    BUILD_REPORT_PATH,
    CORE_LANG_PAIRS,
    INSTALL_SCRIPT_VERSION,
    PRODUCTION_LANGS,
    expected_model_pairs,
    read_build_report,
)

logger = logging.getLogger(__name__)

LANGUAGES_PATH = Path(__file__).resolve().parent.parent / "data" / "eu_supported_languages.json"
PHRASES_PATH = Path(__file__).resolve().parent.parent / "data" / "multilingual_phrases.json"
WORDS_PATH = Path(__file__).resolve().parent.parent / "data" / "multilingual_words.json"
APP_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = APP_ROOT.parent
DEFAULT_ARGOS_PACKAGES_DIR = APP_ROOT / "data" / "argos_packages"

# Internal engine identifiers (API + logs)
ENGINE_GLOSSARY = "glossary"
ENGINE_ARGOS = "argos"
ENGINE_ORIGINAL_FALLBACK = "original-fallback"
ENGINE_PASSTHROUGH = "passthrough"

# Legacy aliases still accepted in UI mapping
_LEGACY_ENGINE_ALIASES = {
    "glossary-fallback": ENGINE_GLOSSARY,
    "argos-translate": ENGINE_ARGOS,
    "unavailable": ENGINE_ORIGINAL_FALLBACK,
}

ENGINE_DISPLAY_LABELS = {
    ENGINE_GLOSSARY: "Glossary",
    ENGINE_ARGOS: "Argos Translate",
    ENGINE_ORIGINAL_FALLBACK: "Original Text Fallback",
    ENGINE_PASSTHROUGH: "English (no translation)",
}

_ARGOS_READY = False
_ARGOS_INIT_ATTEMPTED = False


@dataclass(frozen=True)
class LanguageDetection:
    language: str
    method: str
    confidence: float


@dataclass(frozen=True)
class TranslationResult:
    original_text: str
    translated_text: str
    detected_language: str
    detected_language_name: str
    language_detection_method: str
    language_detection_confidence: float
    translation_engine: str
    translation_engine_display: str
    translation_ok: bool
    translation_ms: float

    @property
    def text_for_classification(self) -> str:
        """English (or best-effort) text used for CN search and entity extraction."""
        if self.detected_language == "en":
            return self.original_text
        if self.translation_ok:
            return self.translated_text
        return self.original_text


@dataclass(frozen=True)
class TranslationStartupStatus:
    argos_installed: bool
    argos_packages_dir: str
    argos_language_pairs: tuple[str, ...]
    glossary_phrase_languages: int
    glossary_word_languages: int


def normalize_engine_id(engine: str) -> str:
    return _LEGACY_ENGINE_ALIASES.get(engine, engine)


def translation_engine_display(engine: str) -> str:
    return ENGINE_DISPLAY_LABELS.get(normalize_engine_id(engine), engine)


def resolve_argos_packages_dir(raw: str | Path | None = None) -> Path:
    """Resolve Argos package storage against repo root (not process CWD)."""
    if raw is None:
        raw = os.getenv("ARGOS_PACKAGES_DIR", str(DEFAULT_ARGOS_PACKAGES_DIR))
    path = Path(raw)
    if not path.is_absolute():
        path = REPO_ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    resolved = path.resolve()
    os.environ["ARGOS_PACKAGES_DIR"] = str(resolved)
    return resolved


def configure_argos_packages_dir() -> Path:
    """Pin Argos packages inside the app so Render build artifacts include models."""
    return resolve_argos_packages_dir()


def iter_argos_package_artifacts(packages_dir: Path) -> list[Path]:
    """List on-disk Argos package files/directories under the configured root."""
    if not packages_dir.is_dir():
        return []
    artifacts: list[Path] = []
    for item in packages_dir.iterdir():
        if item.suffix == ".argosmodel":
            artifacts.append(item)
        elif item.is_dir() and (item / "metadata.json").is_file():
            artifacts.append(item)
    return sorted(artifacts, key=lambda p: p.name)


def collect_argos_language_pairs() -> tuple[bool, list[str], list[str], str | None]:
    """
    Inspect Argos at runtime.

    Returns (importable, available_pairs, installed_package_labels, error).
    """
    configure_argos_packages_dir()
    if not _init_argos():
        return False, [], [], "argostranslate is not installed"

    pairs: list[str] = []
    installed_labels: list[str] = []
    try:
        import argostranslate.package
        import argostranslate.translate

        for package in argostranslate.package.get_installed_packages():
            label = f"{package.from_code}->{package.to_code}"
            installed_labels.append(label)

        installed = argostranslate.translate.get_installed_languages()
        en_lang = next((lang for lang in installed if lang.code == "en"), None)
        for lang in installed:
            code = getattr(lang, "code", None)
            if not code or code == "en" or en_lang is None:
                continue
            if lang.get_translation(en_lang) is not None:
                pairs.append(f"{code}->en")
    except Exception as exc:
        logger.warning("Argos language pair inspection failed: %s", exc)
        return True, [], [], str(exc)

    return True, sorted(pairs), sorted(set(installed_labels)), None


def get_translation_health() -> dict:
    """Live diagnostics for Argos deployment troubleshooting."""
    packages_dir = configure_argos_packages_dir()
    artifacts = iter_argos_package_artifacts(packages_dir)
    argos_installed, pairs, installed_packages, error = collect_argos_language_pairs()

    return {
        "argos_directory": str(packages_dir),
        "directory_exists": packages_dir.is_dir(),
        "package_artifacts_on_disk": len(artifacts),
        "package_artifact_names": [artifact.name for artifact in artifacts[:32]],
        "argos_importable": argos_installed,
        "installed_packages": installed_packages,
        "available_pairs": pairs,
        "translation_ready": bool(pairs),
        "error": error,
    }


def get_translation_debug() -> dict:
    """Deep Argos install diagnostics (runtime + last build report)."""
    health = get_translation_health()
    report = read_build_report()
    settings_dir = None
    index_url = None
    settings_aligned = None
    detected_codes: list[str] = []

    if health["argos_importable"]:
        try:
            import argostranslate.settings as argos_settings
            import argostranslate.translate

            settings_dir = str(argos_settings.package_data_dir)
            index_url = str(getattr(argos_settings, "package_index", ""))
            settings_aligned = (
                Path(settings_dir).resolve() == Path(health["argos_directory"]).resolve()
            )
            detected_codes = sorted(
                {
                    getattr(lang, "code", "")
                    for lang in argostranslate.translate.get_installed_languages()
                    if getattr(lang, "code", None)
                }
            )
        except Exception as exc:
            health["error"] = str(exc)

    download_errors: list[str] = []
    if report:
        download_errors = list(report.get("download_errors") or [])
    elif health["package_artifacts_on_disk"] == 0:
        download_errors.append(
            "No argos_build_report.json and zero package artifacts — "
            "install_translation_models.py likely did not run successfully during build/startup."
        )

    return {
        "install_script_version": INSTALL_SCRIPT_VERSION,
        "expected_models": expected_model_pairs(PRODUCTION_LANGS),
        "core_models_required": list(CORE_LANG_PAIRS),
        "detected_models": health["available_pairs"],
        "detected_language_codes": detected_codes,
        "installed_packages": health["installed_packages"],
        "download_errors": download_errors,
        "package_artifacts_on_disk": health["package_artifacts_on_disk"],
        "argos_directory": health["argos_directory"],
        "argostranslate_settings_dir": settings_dir,
        "package_index_url": index_url,
        "settings_dir_aligned": settings_aligned,
        "build_report_present": report is not None,
        "build_report_path": str(BUILD_REPORT_PATH),
        "last_build_report": report,
        "translation_ready": health["translation_ready"],
    }


def validate_translation_startup() -> TranslationStartupStatus:
    """Called at app startup to log translation layer readiness."""
    packages_dir = configure_argos_packages_dir()
    artifacts = iter_argos_package_artifacts(packages_dir)
    argos_installed, pairs, _, error = collect_argos_language_pairs()
    if argos_installed and not pairs:
        logger.error(
            "Argos importable but no language pairs loaded (dir=%s, artifacts=%s, error=%s). "
            "Run `python scripts/install_translation_models.py --production` during build.",
            packages_dir,
            len(artifacts),
            error,
        )

    phrase_langs = len(_load_phrase_tables())
    word_langs = len(_load_word_tables())
    status = TranslationStartupStatus(
        argos_installed=argos_installed,
        argos_packages_dir=os.environ.get("ARGOS_PACKAGES_DIR", ""),
        argos_language_pairs=tuple(pairs),
        glossary_phrase_languages=phrase_langs,
        glossary_word_languages=word_langs,
    )
    logger.info(
        "Translation layer: glossary=%s+%s languages, argos=%s, pairs=%s, artifacts=%s, dir=%s",
        status.glossary_phrase_languages,
        status.glossary_word_languages,
        status.argos_installed,
        len(status.argos_language_pairs),
        len(artifacts),
        status.argos_packages_dir,
    )
    return status


@lru_cache(maxsize=1)
def supported_languages() -> dict[str, str]:
    if not LANGUAGES_PATH.is_file():
        return {"en": "English"}
    with LANGUAGES_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _load_phrase_tables() -> dict[str, list[tuple[str, str]]]:
    if not PHRASES_PATH.is_file():
        return {}
    with PHRASES_PATH.open(encoding="utf-8") as handle:
        raw = json.load(handle)
    tables: dict[str, list[tuple[str, str]]] = {}
    for lang, phrases in raw.items():
        ordered = sorted(phrases.items(), key=lambda item: len(item[0]), reverse=True)
        tables[lang] = ordered
    return tables


@lru_cache(maxsize=1)
def _load_word_tables() -> dict[str, list[tuple[str, str]]]:
    if not WORDS_PATH.is_file():
        return {}
    with WORDS_PATH.open(encoding="utf-8") as handle:
        raw = json.load(handle)
    tables: dict[str, list[tuple[str, str]]] = {}
    for lang, words in raw.items():
        ordered = sorted(words.items(), key=lambda item: len(item[0]), reverse=True)
        tables[lang] = ordered
    return tables


def _normalize_for_match(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def _apply_replacements(
    text: str,
    replacements: list[tuple[str, str]],
    *,
    whole_words: bool = False,
) -> tuple[str, bool]:
    result = text
    changed = False
    normalized = _normalize_for_match(result)

    for source, english in replacements:
        source_norm = _normalize_for_match(source)
        if whole_words:
            if not re.search(rf"\b{re.escape(source_norm)}\b", normalized):
                continue
            pattern = re.compile(rf"\b{re.escape(source)}\b", re.IGNORECASE)
        else:
            if source_norm not in normalized:
                continue
            pattern = re.compile(re.escape(source), re.IGNORECASE)
        result = pattern.sub(english, result)
        changed = True
        normalized = _normalize_for_match(result)

    return result.strip(), changed


def _script_language_hint(text: str) -> str | None:
    if re.search(r"[\u0400-\u04FF]", text):
        if re.search(r"[ъЪѝЍ]", text):
            return "bg"
        if re.search(r"[ђћџЂЋЏ]", text):
            return "sr"
        return "bg"
    if re.search(r"[\u0370-\u03FF]", text):
        return "el"
    if re.search(r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]", text):
        return "pl"
    if re.search(r"[ăâîșțĂÂÎȘȚ]", text):
        return "ro"
    if re.search(r"[äöüõÄÖÜÕ]", text) and re.search(
        r"\b(tarv|veoauto|sülearvuti|paratsetamool)\b", text, re.I
    ):
        return "et"
    if re.search(r"[žščŽŠČ]", text) or re.search(
        r"\b(rabljeno|tovorno|vozilo|polpriklopnik|kamion|kroglasti|industrijski|senzor|temperaturni|tlaka|induktivni)\b",
        text,
        re.I,
    ):
        return "sl"
    if re.search(r"[åäöÅÄÖ]", text):
        return "sv"
    if re.search(r"[æøåÆØÅ]", text):
        return "da"
    return None


_ASCII_PHRASE_RE = re.compile(r"^[a-z0-9\s\-]+$")

# Tokens common on English product lines; used to avoid langdetect false positives (pt/pl/ro).
_EN_TECHNICAL_TOKENS = frozenset(
    {
        "laptop",
        "computer",
        "notebook",
        "portable",
        "temperature",
        "sensor",
        "sensors",
        "pressure",
        "proximity",
        "bearing",
        "bearings",
        "trousers",
        "pants",
        "cotton",
        "shirt",
        "bicycle",
        "bike",
        "pen",
        "pens",
        "ink",
        "liquid",
        "chemical",
        "chemicals",
        "valve",
        "tablet",
        "tablets",
        "vehicle",
        "truck",
        "industrial",
        "hydraulic",
        "ball",
        "point",
    }
)


def _phrase_indicates_foreign_language(phrase: str) -> bool:
    """ASCII-only glossary keys duplicated under locale tables are not language signals."""
    phrase_norm = _normalize_for_match(phrase)
    if not phrase_norm:
        return False
    if not _ASCII_PHRASE_RE.fullmatch(phrase_norm):
        return True
    return False


def _ascii_technical_english(text: str) -> bool:
    stripped = text.strip()
    if not stripped.isascii():
        return False
    tokens = re.findall(r"[a-z0-9]+", stripped.lower())
    if not tokens or len(tokens) > 8:
        return False
    return all(token in _EN_TECHNICAL_TOKENS for token in tokens)


def _detect_from_phrase_tables(text: str) -> str | None:
    normalized = _normalize_for_match(text)
    best_lang: str | None = None
    best_len = 0
    for code, table in _load_phrase_tables().items():
        if code == "en":
            continue
        for phrase, _ in table:
            if not _phrase_indicates_foreign_language(phrase):
                continue
            phrase_norm = _normalize_for_match(phrase)
            if len(phrase_norm) < 8:
                continue
            if phrase_norm in normalized and len(phrase_norm) > best_len:
                best_lang = code
                best_len = len(phrase_norm)
    if best_lang:
        return best_lang
    for code, table in _load_word_tables().items():
        for word, _ in table:
            if not _phrase_indicates_foreign_language(word):
                continue
            word_norm = _normalize_for_match(word)
            if word_norm in normalized and len(word_norm) > best_len:
                best_lang = code
                best_len = len(word_norm)
    return best_lang


def _slovenian_industrial_markers(text: str) -> bool:
    return bool(
        re.search(
            r"\b(industrijski|senzor|temperaturni|tlaka|induktivni|senzorji)\b",
            text,
            re.I,
        )
    )


def detect_language_with_confidence(text: str) -> LanguageDetection:
    stripped = text.strip()
    if not stripped:
        return LanguageDetection("en", "empty", 1.0)

    if _ascii_technical_english(stripped):
        return LanguageDetection("en", "ascii-technical-english", 0.88)

    phrase_lang = _detect_from_phrase_tables(stripped)
    if phrase_lang:
        confidence = 0.80 if len(_normalize_for_match(stripped)) < 24 else 0.95
        return LanguageDetection(phrase_lang, "phrase-table", confidence)

    if _slovenian_industrial_markers(stripped):
        return LanguageDetection("sl", "slovenian-markers", 0.88)

    hint = _script_language_hint(stripped)
    if hint:
        return LanguageDetection(hint, "script-hint", 0.85)

    try:
        from langdetect import DetectorFactory, detect_langs

        DetectorFactory.seed = 0
        guesses = detect_langs(stripped)
        if guesses:
            top = guesses[0]
            code = top.lang
            if code == "de" and _slovenian_industrial_markers(stripped):
                return LanguageDetection("sl", "slovenian-markers-override", 0.82)
            if code in supported_languages():
                confidence = round(float(top.prob), 2)
                if (
                    stripped.isascii()
                    and code != "en"
                    and confidence < 0.92
                    and _ascii_technical_english(stripped)
                ):
                    return LanguageDetection("en", "ascii-technical-fallback", 0.78)
                return LanguageDetection(code, "langdetect", max(0.55, confidence))
    except Exception:
        try:
            from langdetect import DetectorFactory, detect

            DetectorFactory.seed = 0
            code = detect(stripped)
            if code == "de" and _slovenian_industrial_markers(stripped):
                return LanguageDetection("sl", "slovenian-markers-override", 0.82)
            if code in supported_languages():
                return LanguageDetection(code, "langdetect", 0.7)
        except Exception as exc:
            logger.debug("langdetect failed: %s", exc)

    return LanguageDetection("en", "default", 0.5)


def detect_language(text: str) -> str:
    return detect_language_with_confidence(text).language


def _init_argos() -> bool:
    global _ARGOS_READY, _ARGOS_INIT_ATTEMPTED
    if _ARGOS_INIT_ATTEMPTED:
        return _ARGOS_READY
    _ARGOS_INIT_ATTEMPTED = True
    configure_argos_packages_dir()
    try:
        import argostranslate.translate  # noqa: F401

        _ARGOS_READY = True
    except ImportError:
        logger.info("argostranslate not installed; Argos step will be skipped.")
        _ARGOS_READY = False
    return _ARGOS_READY


def argos_has_language(from_code: str) -> bool:
    if not _init_argos():
        return False
    try:
        import argostranslate.translate

        installed = argostranslate.translate.get_installed_languages()
        from_lang = next((lang for lang in installed if lang.code == from_code), None)
        to_lang = next((lang for lang in installed if lang.code == "en"), None)
        if not from_lang or not to_lang:
            return False
        return from_lang.get_translation(to_lang) is not None
    except Exception:
        return False


def _argos_translate(from_code: str, text: str) -> str | None:
    if not _init_argos():
        return None
    try:
        import argostranslate.translate

        if from_code == "en":
            return text
        installed = argostranslate.translate.get_installed_languages()
        from_lang = next((lang for lang in installed if lang.code == from_code), None)
        to_lang = next((lang for lang in installed if lang.code == "en"), None)
        if not from_lang or not to_lang:
            return None
        translation = from_lang.get_translation(to_lang)
        if translation is None:
            return None
        result = translation.translate(text)
        if not result or not result.strip():
            return None
        return result.strip()
    except Exception as exc:
        logger.warning("Argos translation failed (%s -> en): %s", from_code, exc)
        return None


def _glossary_translate(from_code: str, text: str) -> tuple[str, bool]:
    phrase_table = _load_phrase_tables().get(from_code, [])
    word_table = _load_word_tables().get(from_code, [])

    if not phrase_table and not word_table:
        return text, False

    result, phrase_changed = _apply_replacements(text, phrase_table)
    result, word_changed = _apply_replacements(result, word_table, whole_words=True)
    return result, phrase_changed or word_changed


def _build_result(
    *,
    original: str,
    translated: str,
    detected: str,
    language_name: str,
    engine: str,
    ok: bool,
    started: float,
    detection: LanguageDetection | None = None,
) -> TranslationResult:
    engine_norm = normalize_engine_id(engine)
    elapsed = (time.perf_counter() - started) * 1000
    detection = detection or detect_language_with_confidence(original)
    return TranslationResult(
        original_text=original,
        translated_text=translated,
        detected_language=detected,
        detected_language_name=language_name,
        language_detection_method=detection.method,
        language_detection_confidence=detection.confidence,
        translation_engine=engine_norm,
        translation_engine_display=translation_engine_display(engine_norm),
        translation_ok=ok,
        translation_ms=round(elapsed, 2),
    )


def translate_to_english(text: str, language: str | None = None) -> TranslationResult:
    """
    Production flow:
    1. Detect language
    2. Glossary (phrases + words) — highest priority
    3. Argos Translate — when glossary produces no match
    4. Original text — last resort
    """
    started = time.perf_counter()
    original = text.strip()
    langs = supported_languages()
    detection = detect_language_with_confidence(original)
    detected = (language or detection.language).lower()
    if detected not in langs:
        detection = detect_language_with_confidence(original)
        detected = detection.language
    language_name = langs.get(detected, detected)

    if detected == "en" or not original:
        return _build_result(
            original=original,
            translated=original,
            detected="en",
            language_name=langs.get("en", "English"),
            engine=ENGINE_PASSTHROUGH,
            ok=True,
            started=started,
            detection=detection,
        )

    # Step 2: Glossary (priority)
    glossary_text, glossary_changed = _glossary_translate(detected, original)
    if glossary_changed and glossary_text:
        return _build_result(
            original=original,
            translated=glossary_text,
            detected=detected,
            language_name=language_name,
            engine=ENGINE_GLOSSARY,
            ok=True,
            started=started,
            detection=detection,
        )

    # Step 3: Argos Translate
    argos_text = _argos_translate(detected, original)
    if argos_text:
        return _build_result(
            original=original,
            translated=argos_text,
            detected=detected,
            language_name=language_name,
            engine=ENGINE_ARGOS,
            ok=True,
            started=started,
            detection=detection,
        )

    # Step 4: Original text fallback
    logger.info(
        "No glossary or Argos translation for '%s'; using original text for classification.",
        detected,
    )
    return _build_result(
        original=original,
        translated=original,
        detected=detected,
        language_name=language_name,
        engine=ENGINE_ORIGINAL_FALLBACK,
        ok=False,
        started=started,
        detection=detection,
    )
