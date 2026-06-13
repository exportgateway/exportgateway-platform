"""Normalize AES declaration descriptions and tariff codes for historical knowledge."""

from __future__ import annotations

import json
import re
import unicodedata

from app.services.lexicon_service import apply_customs_lexicon, tokenize_for_search
from app.services.product_understanding_service import _detect_language_simple

_AES_STOPWORDS = frozenset(
    {
        "kos",
        "kosov",
        "kosova",
        "kom",
        "kpl",
        "kpli",
        "kg",
        "del",
        "deli",
        "st",
        "na",
        "za",
        "iz",
        "ali",
        "in",
        "the",
        "and",
        "pcs",
    }
)

_QUANTITY_PREFIX_RE = re.compile(r"^\s*\d+[\s,.]*", re.IGNORECASE)
_INLINE_QTY_RE = re.compile(
    r"\b\d+[\s,.]*(KOS|KOSOV|KOSOVA|KOM|KPL|KPLI|KG)\b",
    re.IGNORECASE,
)


def _ascii_fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def tariff_digits(tariff: str | float | int | None) -> str:
    if tariff is None:
        return ""
    return re.sub(r"\D", "", str(tariff).strip())


def normalize_cn8(tariff: str | float | int | None) -> str | None:
    """Normalize any tariff to 8-digit CN (exports already CN8; imports truncated)."""
    digits = tariff_digits(tariff)
    if len(digits) < 8:
        return None
    return digits[:8]


def format_cn_display(cn8: str) -> str:
    return f"{cn8[:4]} {cn8[4:6]} {cn8[6:8]}"


def normalize_country_code(value: str | float | None) -> str | None:
    if value is None:
        return None
    code = str(value).strip().upper()
    if len(code) != 2 or not code.isalpha():
        return None
    return code


def strip_aes_quantity(description: str) -> str:
    text = str(description).strip()
    text = _QUANTITY_PREFIX_RE.sub("", text)
    text = _INLINE_QTY_RE.sub("", text)
    text = re.sub(r"\s*;\s*", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" ,;:-")
    return text


def normalize_aes_description(description: str) -> tuple[str, str, str, list[str], str]:
    """Return (raw, normalized, english, search_terms, language)."""
    raw = str(description).strip()
    stripped = strip_aes_quantity(raw)
    language = _detect_language_simple(raw)
    lexicon_text, _, _ = apply_customs_lexicon(stripped or raw, language)
    normalized = (lexicon_text or stripped or raw).strip()
    description_en = normalized
    if language != "en":
        folded_en, _, _ = apply_customs_lexicon(stripped or raw, "en")
        if folded_en:
            description_en = folded_en

    tokens = tokenize_for_search(f"{normalized} {description_en}")
    terms = [token for token in tokens if token not in _AES_STOPWORDS]
    if not terms:
        terms = tokens[:8]
    return raw, normalized, description_en, terms, language


def build_quality_flags(
    *,
    raw: str,
    net_mass_kg: float | None,
    import_country: str | None,
) -> str:
    flags: list[str] = []
    if re.search(r"^\d+\s*(KOS|KOM|KOSOV)", raw, re.I):
        flags.append("has_quantity_prefix")
    if import_country == "XS":
        flags.append("statistical_destination")
    if net_mass_kg is None:
        flags.append("missing_mass")
    return json.dumps(flags)
