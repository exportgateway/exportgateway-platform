"""OpenAI product understanding with lexicon/taxonomy fallback (replaces Argos translation)."""

from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import get_settings
from app.services.lexicon_service import apply_customs_lexicon, tokenize_for_search
from app.services.taxonomy_service import detect_families

logger = logging.getLogger(__name__)

ENGINE_OPENAI = "openai"
ENGINE_FALLBACK = "fallback"

ENGINE_DISPLAY = {
    ENGINE_OPENAI: "OpenAI Product Understanding",
    ENGINE_FALLBACK: "Keyword & Lexicon Fallback",
}

LANGUAGE_NAMES = {
    "en": "English",
    "sl": "Slovenian",
    "de": "German",
    "fr": "French",
    "it": "Italian",
    "hr": "Croatian",
    "hu": "Hungarian",
    "cs": "Czech",
    "pl": "Polish",
    "ro": "Romanian",
    "bg": "Bulgarian",
    "sr": "Serbian",
    "el": "Greek",
}

_STOPWORDS = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "from",
        "pcs",
        "piece",
        "pieces",
        "unit",
        "units",
    }
)

_QUANTITY_PREFIX_RE = re.compile(
    r"^\s*(\d+)\s*(pcs|pc|pieces|piece|units|unit|kg|kgs|lbs)\b[\s,:-]*",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ProductUnderstandingResult:
    original_text: str
    detected_language: str
    english_description: str
    quantity: int | None
    unit: str | None
    search_terms: tuple[str, ...]
    product_families: tuple[str, ...]
    confidence: float
    understanding_engine: str
    understanding_ok: bool
    understanding_ms: float
    language_detection_method: str = "openai"
    language_detection_confidence: float = 0.0
    detected_attributes_raw: dict[str, str] | None = None
    universal_product_family: str | None = None
    universal_product_type: str | None = None
    universal_material: str | None = None
    universal_function: str | None = None
    universal_industry: str | None = None

    @property
    def translated_text(self) -> str:
        return self.english_description

    @property
    def text_for_classification(self) -> str:
        return self.english_description

    @property
    def translation_engine(self) -> str:
        return self.understanding_engine

    @property
    def translation_engine_display(self) -> str:
        return ENGINE_DISPLAY.get(self.understanding_engine, self.understanding_engine)

    @property
    def translation_ok(self) -> bool:
        return self.understanding_ok

    @property
    def detected_language_name(self) -> str:
        return LANGUAGE_NAMES.get(self.detected_language, self.detected_language)

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "detected_language": self.detected_language,
            "english_description": self.english_description,
            "quantity": self.quantity,
            "unit": self.unit,
            "search_terms": list(self.search_terms),
            "product_families": list(self.product_families),
            "confidence": round(self.confidence, 2),
            "understanding_engine": self.understanding_engine,
        }
        if self.detected_attributes_raw:
            payload["attributes"] = self.detected_attributes_raw
        for key in (
            "universal_product_family",
            "universal_product_type",
            "universal_material",
            "universal_function",
            "universal_industry",
        ):
            value = getattr(self, key, None)
            if value:
                payload[key.removeprefix("universal_")] = value
        return payload


def probe_product_understanding() -> dict[str, Any]:
    settings = get_settings()
    key_present = bool(_resolve_api_key(settings))
    return {
        "openai_configured": key_present,
        "openai_enabled": settings.ai_classification_enabled,
        "openai_model": settings.openai_model,
        "fallback_available": True,
        "understanding_ready": key_present and settings.ai_classification_enabled,
    }


def understand_product(text: str) -> ProductUnderstandingResult:
    """Primary entry: OpenAI structured extraction, else keyword/lexicon fallback."""
    started = time.perf_counter()
    original = text.strip()
    settings = get_settings()
    api_key = _resolve_api_key(settings)

    if settings.ai_classification_enabled and api_key:
        try:
            result = _openai_understand(original, api_key=api_key, model=settings.openai_model)
            elapsed = (time.perf_counter() - started) * 1000
            normalized = _normalize_openai_payload(result, original=original)
            return _build_understanding_result(
                original=original,
                normalized=normalized,
                engine=ENGINE_OPENAI,
                elapsed_ms=elapsed,
                language_method="openai",
            )
        except Exception as exc:
            logger.warning("OpenAI product understanding failed, using fallback: %s", exc)

    return _fallback_understand(original, started=started)


def _resolve_api_key(settings) -> str | None:
    return settings.ai_provider_api_key or settings.openai_api_key or None


def _openai_understand(text: str, *, api_key: str, model: str) -> dict[str, Any]:
    schema_hint = {
        "detected_language": "ISO 639-1 code",
        "english_description": "normalized English product line without quantity prefix",
        "quantity": "integer or null",
        "unit": "pcs, kg, etc. or null",
        "search_terms": ["lowercase customs search keywords"],
        "product_families": ["taxonomy family ids e.g. apparel_trousers_mens, fastener_screw"],
        "product_family": "universal family: fasteners|apparel|construction_chemicals|food|electronics|furniture_hardware",
        "product_type": "specific type e.g. screw|nut|sealant|pizza|shirt|jeans|laptop|fittings",
        "material": "primary material e.g. steel|cotton|silicone|plastic",
        "function": "primary function e.g. fastening|sealing|clothing|computing",
        "industry": "industry context e.g. construction|automotive|food_service|furniture",
        "confidence": "0.0-1.0",
        "attributes": {
            "gender": "male|female|unisex|null",
            "material": "cotton|wool|polyester|silk|linen|nylon|null",
            "fabric": "denim|jersey|fleece|null",
            "construction": "woven|knitted|null",
        },
    }
    system = (
        "You extract structured customs product data from commercial descriptions in any EU language. "
        "Return JSON only. Normalize to English. "
        "Always populate product_family, product_type, material, function, industry when inferable. "
        "Examples: screws/nuts -> product_family=fasteners; sealants -> construction_chemicals; "
        "pizza -> food; shirts/jeans -> apparel; laptops/sensors -> electronics; furniture fittings -> furniture_hardware. "
        "product_families must use taxonomy ids like apparel_trousers_mens, fastener_screw, silicone_sealant. "
        "search_terms: 3-8 lowercase nouns/adjectives useful for HS/CN search. "
        "attributes: infer gender, material, fabric, construction for apparel/textiles. "
        "jeans and denim imply construction=woven. cotton->material=cotton. men's->gender=male. "
        "Strip leading quantity (e.g. 500 pcs) from english_description but populate quantity/unit."
    )
    payload = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    f"Product description:\n{text}\n\n"
                    f"Return JSON matching: {json.dumps(schema_hint)}"
                ),
            },
        ],
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        body = response.json()
    content = body["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    return _normalize_openai_payload(parsed, original=text)


def _normalize_openai_payload(raw: dict[str, Any], *, original: str) -> dict[str, Any]:
    english = str(raw.get("english_description") or original).strip()
    detected = str(raw.get("detected_language") or "en").lower()[:2]
    terms = [str(t).lower().strip() for t in (raw.get("search_terms") or []) if str(t).strip()]
    families = [str(f).strip() for f in (raw.get("product_families") or []) if str(f).strip()]
    quantity = raw.get("quantity")
    unit = raw.get("unit")
    if quantity is not None:
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            quantity = None
    if unit is not None:
        unit = str(unit).lower().strip() or None
    confidence = float(raw.get("confidence", 0.85))
    confidence = max(0.0, min(1.0, confidence))
    if not terms:
        terms = _keyword_terms(english)
    attributes_raw = _normalize_attributes_payload(raw.get("attributes"))
    universal = _normalize_universal_fields(raw, attributes_raw)
    if universal.get("material") and attributes_raw and "material" not in attributes_raw:
        attributes_raw = {**attributes_raw, "material": universal["material"]}
    return {
        "detected_language": detected,
        "english_description": english,
        "quantity": quantity,
        "unit": unit,
        "search_terms": terms,
        "product_families": families,
        "confidence": confidence,
        "attributes": attributes_raw,
        **universal,
    }


def _normalize_universal_fields(
    raw: dict[str, Any],
    attributes: dict[str, str] | None,
) -> dict[str, str | None]:
    material = raw.get("material")
    if material is None and attributes:
        material = attributes.get("material")
    return {
        "product_family": _clean_universal_token(raw.get("product_family")),
        "product_type": _clean_universal_token(raw.get("product_type")),
        "material": _clean_universal_token(material),
        "function": _clean_universal_token(raw.get("function")),
        "industry": _clean_universal_token(raw.get("industry")),
    }


def _clean_universal_token(value: Any) -> str | None:
    if value is None:
        return None
    token = str(value).strip().lower()
    if not token or token == "null":
        return None
    return token


def _build_understanding_result(
    *,
    original: str,
    normalized: dict[str, Any],
    engine: str,
    elapsed_ms: float,
    language_method: str,
) -> ProductUnderstandingResult:
    lang_conf = float(normalized.get("confidence", 0.85))
    return ProductUnderstandingResult(
        original_text=original,
        detected_language=normalized["detected_language"],
        english_description=normalized["english_description"],
        quantity=normalized.get("quantity"),
        unit=normalized.get("unit"),
        search_terms=tuple(normalized.get("search_terms") or []),
        product_families=tuple(normalized.get("product_families") or []),
        confidence=lang_conf,
        understanding_engine=engine,
        understanding_ok=engine == ENGINE_OPENAI or normalized["detected_language"] == "en",
        understanding_ms=round(elapsed_ms, 2),
        language_detection_method=language_method,
        language_detection_confidence=lang_conf,
        detected_attributes_raw=normalized.get("attributes"),
        universal_product_family=normalized.get("product_family"),
        universal_product_type=normalized.get("product_type"),
        universal_material=normalized.get("material"),
        universal_function=normalized.get("function"),
        universal_industry=normalized.get("industry"),
    )


def _normalize_attributes_payload(raw: Any) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    allowed = ("gender", "material", "fabric", "construction")
    out: dict[str, str] = {}
    for key in allowed:
        value = raw.get(key)
        if value is None:
            continue
        token = str(value).strip().lower()
        if token and token != "null":
            out[key] = token
    return out or None


def _fallback_understand(text: str, *, started: float) -> ProductUnderstandingResult:
    quantity, unit, stripped = _extract_quantity_prefix(text)
    detected = _detect_language_simple(stripped)
    lexicon_text, concepts, lexicon_families = apply_customs_lexicon(stripped, detected)
    working = lexicon_text or stripped
    if not concepts:
        for lang in ("en", "de", "fr", "sl", "hr", "it"):
            if lang == detected:
                continue
            candidate_text, candidate_concepts, candidate_families = apply_customs_lexicon(
                stripped, lang
            )
            if candidate_concepts:
                working = candidate_text
                lexicon_families = list(
                    dict.fromkeys([*lexicon_families, *candidate_families])
                )
                concepts = candidate_concepts
                if lang in {"de", "fr", "sl", "hr", "it"}:
                    detected = lang
                break

    matches = detect_families(working, extra_family_ids=list(lexicon_families))
    family_ids = tuple(
        dict.fromkeys([*(f.family_id for f in matches), *lexicon_families])
    )
    terms = tuple(dict.fromkeys([*_keyword_terms(stripped), *_keyword_terms(working)]))
    confidence = 0.52
    if lexicon_families:
        confidence = 0.58
    if family_ids:
        confidence = max(confidence, 0.62)
    if detected == "en" and len(terms) >= 3:
        confidence = max(confidence, 0.55)

    elapsed = (time.perf_counter() - started) * 1000
    normalized = {
        "detected_language": detected,
        "english_description": working,
        "quantity": quantity,
        "unit": unit,
        "search_terms": list(terms),
        "product_families": list(family_ids),
        "confidence": round(confidence, 2),
        "attributes": None,
        "product_family": None,
        "product_type": None,
        "material": None,
        "function": None,
        "industry": None,
    }
    from app.services.universal_product_profile import build_universal_profile

    interim = _build_understanding_result(
        original=text,
        normalized=normalized,
        engine=ENGINE_FALLBACK,
        elapsed_ms=elapsed,
        language_method="script-heuristic",
    )
    profile = build_universal_profile(interim, classification_text=working)
    normalized.update(
        {
            "product_family": profile.product_family,
            "product_type": profile.product_type,
            "material": profile.material,
            "function": profile.function,
            "industry": profile.industry,
            "product_families": list(profile.taxonomy_family_ids) or list(family_ids),
        }
    )
    return _build_understanding_result(
        original=text,
        normalized=normalized,
        engine=ENGINE_FALLBACK,
        elapsed_ms=elapsed,
        language_method="script-heuristic",
    )


def _extract_quantity_prefix(text: str) -> tuple[int | None, str | None, str]:
    match = _QUANTITY_PREFIX_RE.match(text)
    if not match:
        return None, None, text.strip()
    quantity = int(match.group(1))
    unit = match.group(2).lower()
    if unit == "pc":
        unit = "pcs"
    stripped = text[match.end() :].strip()
    return quantity, unit, stripped


def _detect_language_simple(text: str) -> str:
    if re.search(r"[žščŽŠČ]", text) or re.search(
        r"\b(moške|moška|ženske|hlače|kamion|senzor)\b", text, re.I
    ):
        return "sl"
    if re.search(r"[äöüÄÖÜß]", text) and re.search(r"\b(und|der|hose)\b", text, re.I):
        return "de"
    if re.search(r"[àâçéèêëïîôùûü]", text, re.I):
        return "fr"
    if text.isascii():
        return "en"
    decomposed = unicodedata.normalize("NFD", text)
    if all(unicodedata.category(c) != "Mn" for c in decomposed if c.isalpha()):
        return "en"
    return "en"


def _keyword_terms(text: str) -> list[str]:
    tokens = tokenize_for_search(text)
    terms: list[str] = []
    for token in tokens:
        if len(token) < 3 and token not in {"ups"}:
            continue
        if token in _STOPWORDS:
            continue
        if token not in terms:
            terms.append(token)
    return terms[:8]


@lru_cache(maxsize=1)
def legacy_argos_memory_estimate_mb() -> float:
    """Documented RSS delta from Argos/torch translation_init (local measurement)."""
    return 262.0
