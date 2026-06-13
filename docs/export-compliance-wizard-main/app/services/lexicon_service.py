"""Customs lexicon — normalize commercial terms to English concepts (Phase A)."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

LEXICON_PATH = Path(__file__).resolve().parent.parent / "data" / "customs_lexicon.json"
INDUSTRIAL_LEXICON_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "generated_industrial_lexicon.json"
)

TOKEN_WHITELIST_SHORT = frozenset(
    {"ball", "bearing", "bearings", "plc", "api", "led", "ic", "gas", "air"}
)
MIN_TOKEN_LENGTH = 4


@lru_cache(maxsize=1)
def _load_lexicon() -> dict:
    if not LEXICON_PATH.is_file():
        return {"concepts": []}
    with LEXICON_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _load_industrial_lexicon() -> dict:
    if not INDUSTRIAL_LEXICON_PATH.is_file():
        return {"entries": []}
    with INDUSTRIAL_LEXICON_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def _industrial_en_normalized(cn8: str, phrase: str) -> str:
    try:
        from app.services.cn_database import lookup_by_digits

        record = lookup_by_digits(cn8)
        if record and record.description:
            return record.description.lower()
    except Exception:
        pass
    return phrase


def _normalize_for_match(text: str) -> str:
    import unicodedata

    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def apply_customs_lexicon(text: str, language: str) -> tuple[str, list[str], list[str]]:
    """
    Longest-phrase replacement per language.
    Returns (normalized_text, concept_ids, family_ids from lexicon).
    """
    config = _load_lexicon()
    lang = (language or "en").lower()
    result = text
    concepts_hit: list[str] = []
    families_hit: list[str] = []

    replacements: list[tuple[str, str, str, list[str]]] = []
    for concept in config.get("concepts", []):
        cid = concept.get("id", "")
        en = concept.get("en_normalized", "")
        families = concept.get("families", [])
        for phrase_lang, phrases in concept.get("phrases", {}).items():
            if phrase_lang != lang and phrase_lang != "en":
                continue
            for phrase in phrases:
                replacements.append((phrase, en, cid, families))

    for entry in _load_industrial_lexicon().get("entries", []):
        phrase = str(entry.get("phrase", "")).strip()
        cn8 = str(entry.get("cn8", "")).strip()
        if not phrase or len(cn8) < 8:
            continue
        en = _industrial_en_normalized(cn8, phrase)
        cid = f"industrial_{entry.get('normalized_phrase', phrase).replace(' ', '_')}"
        replacements.append((phrase, en, cid, []))

    replacements.sort(key=lambda item: len(_normalize_for_match(item[0])), reverse=True)
    normalized_full = _normalize_for_match(result)

    for phrase, en, cid, families in replacements:
        phrase_norm = _normalize_for_match(phrase)
        if not phrase_norm or phrase_norm not in normalized_full:
            continue
        pattern = re.compile(re.escape(phrase), re.IGNORECASE)
        result = pattern.sub(en, result)
        if cid not in concepts_hit:
            concepts_hit.append(cid)
        for family in families:
            if family not in families_hit:
                families_hit.append(family)
        normalized_full = _normalize_for_match(result)

    return result.strip(), concepts_hit, families_hit


def tokenize_for_search(text: str) -> list[str]:
    """Unicode-aware tokens; minimum length unless whitelisted."""
    pattern = re.compile(
        r"[a-z0-9]+",
        re.IGNORECASE,
    )
    raw = pattern.findall(text.lower())
    tokens: list[str] = []
    for token in raw:
        if len(token) >= MIN_TOKEN_LENGTH or token in TOKEN_WHITELIST_SHORT:
            tokens.append(token)
    return tokens


def term_matches_text(term: str, text: str) -> bool:
    """Word-boundary aware matching for short terms."""
    if not term or not text:
        return False
    term = term.lower()
    text = text.lower()
    if len(term) < 5:
        return bool(re.search(rf"\b{re.escape(term)}\b", text))
    if term in text:
        return True
    return bool(re.search(rf"\b{re.escape(term)}", text))


def compute_lexicon_quality_boost(
    *,
    lexicon_concepts: list[str],
    translation_ok: bool,
    language_confidence: float,
) -> float:
    boost = 0.0
    if lexicon_concepts:
        boost += 0.25
    if translation_ok:
        boost += 0.35
    boost += 0.2 * min(1.0, language_confidence)
    return min(1.0, boost)
