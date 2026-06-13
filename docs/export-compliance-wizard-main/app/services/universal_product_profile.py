"""Universal product profile — industry-agnostic family/type signals for ranking."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.services.product_understanding_service import ProductUnderstandingResult
from app.services.taxonomy_service import detect_families

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "universal_family_ranking.json"


@dataclass(frozen=True)
class UniversalProductProfile:
    product_family: str | None = None
    product_type: str | None = None
    material: str | None = None
    function: str | None = None
    industry: str | None = None
    primary_taxonomy_family: str | None = None
    taxonomy_family_ids: tuple[str, ...] = ()
    confidence: float = 0.0

    def has_family_signal(self) -> bool:
        return bool(self.product_family or self.primary_taxonomy_family or self.taxonomy_family_ids)

    def to_dict(self) -> dict[str, str | float | list[str]]:
        payload: dict[str, str | float | list[str]] = {
            "confidence": round(self.confidence, 2),
        }
        if self.product_family:
            payload["product_family"] = self.product_family
        if self.product_type:
            payload["product_type"] = self.product_type
        if self.material:
            payload["material"] = self.material
        if self.function:
            payload["function"] = self.function
        if self.industry:
            payload["industry"] = self.industry
        if self.primary_taxonomy_family:
            payload["primary_taxonomy_family"] = self.primary_taxonomy_family
        if self.taxonomy_family_ids:
            payload["taxonomy_family_ids"] = list(self.taxonomy_family_ids)
        return payload


@lru_cache(maxsize=1)
def _load_config() -> dict:
    if not CONFIG_PATH.is_file():
        return {}
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def _normalize_token(value: str | None) -> str | None:
    if value is None:
        return None
    token = str(value).strip().lower()
    return token or None


def _phrase_hits(text: str, phrases: list[str]) -> bool:
    lower = text.lower()
    for phrase in phrases:
        p = phrase.lower().strip()
        if not p:
            continue
        if len(p) <= 5 and " " not in p:
            if re.search(rf"\b{re.escape(p)}\b", lower):
                return True
        elif p in lower:
            return True
    return False


def _infer_type_from_text(text: str, config: dict) -> str | None:
    for entry in config.get("product_type_rules", []):
        if _phrase_hits(text, entry.get("phrases", [])):
            return entry.get("product_type")
    return None


def _infer_family_from_type(product_type: str | None, config: dict) -> str | None:
    if not product_type:
        return None
    mapping = config.get("type_to_universal_family", {})
    return mapping.get(product_type)


def _taxonomy_for_type(product_type: str | None, config: dict) -> str | None:
    if not product_type:
        return None
    mapping = config.get("type_to_taxonomy_family", {})
    return mapping.get(product_type)


def _taxonomy_for_universal_family(universal_family: str | None, config: dict) -> list[str]:
    if not universal_family:
        return []
    mapping = config.get("universal_family_to_taxonomy", {})
    return list(mapping.get(universal_family, []))


def _universal_family_for_taxonomy(taxonomy_id: str, config: dict) -> str | None:
    for family, ids in config.get("universal_family_to_taxonomy", {}).items():
        if taxonomy_id in ids:
            return family
    return None


def _product_type_for_taxonomy(taxonomy_id: str, config: dict) -> str | None:
    mapping = config.get("type_to_taxonomy_family", {})
    for product_type, family_id in mapping.items():
        if family_id == taxonomy_id:
            return product_type
    return None


def build_universal_profile(
    understanding: ProductUnderstandingResult,
    *,
    classification_text: str = "",
    entity_family_ids: list[str] | None = None,
) -> UniversalProductProfile:
    """Build profile from OpenAI structured fields, else infer from text + taxonomy."""
    config = _load_config()
    raw = understanding.detected_attributes_raw or {}
    text = classification_text or understanding.english_description

    product_family = _normalize_token(
        understanding.universal_product_family or raw.get("product_family")
    )
    product_type = _normalize_token(
        understanding.universal_product_type or raw.get("product_type")
    )
    material = _normalize_token(understanding.universal_material or raw.get("material"))
    function = _normalize_token(understanding.universal_function or raw.get("function"))
    industry = _normalize_token(understanding.universal_industry or raw.get("industry"))

    inferred_type = _infer_type_from_text(text, config)
    if not product_type:
        product_type = inferred_type
    if not product_family:
        product_family = _infer_family_from_type(product_type, config)

    type_from_openai = bool(understanding.universal_product_type)
    type_from_phrase = bool(inferred_type)
    primary_taxonomy = (
        _taxonomy_for_type(product_type, config)
        if product_type and (type_from_openai or type_from_phrase)
        else None
    )
    taxonomy_ids: list[str] = []

    for fid in entity_family_ids or []:
        if fid not in taxonomy_ids:
            taxonomy_ids.append(fid)
    if primary_taxonomy and primary_taxonomy not in taxonomy_ids:
        taxonomy_ids.append(primary_taxonomy)
    for fid in understanding.product_families:
        if fid not in taxonomy_ids:
            taxonomy_ids.append(fid)

    extra_ids = list(understanding.product_families) + list(entity_family_ids or [])
    seen_match_ids: set[str] = set()
    for source_text in (text, understanding.original_text):
        if not source_text:
            continue
        for match in detect_families(source_text, extra_family_ids=extra_ids):
            if match.family_id not in seen_match_ids:
                seen_match_ids.add(match.family_id)
                if match.family_id not in taxonomy_ids:
                    taxonomy_ids.append(match.family_id)

    if not taxonomy_ids and product_family:
        for fid in _taxonomy_for_universal_family(product_family, config):
            if fid not in taxonomy_ids:
                taxonomy_ids.append(fid)

    if not product_family and taxonomy_ids:
        product_family = _universal_family_for_taxonomy(taxonomy_ids[0], config)
    if not product_type and taxonomy_ids:
        product_type = _product_type_for_taxonomy(taxonomy_ids[0], config)

    if entity_family_ids:
        primary_taxonomy = entity_family_ids[0]
    elif not primary_taxonomy and taxonomy_ids:
        primary_taxonomy = taxonomy_ids[0]
    elif primary_taxonomy and primary_taxonomy not in taxonomy_ids:
        taxonomy_ids.insert(0, primary_taxonomy)
    if primary_taxonomy and primary_taxonomy in taxonomy_ids:
        taxonomy_ids = [primary_taxonomy, *(fid for fid in taxonomy_ids if fid != primary_taxonomy)]

    confidence = understanding.confidence
    if product_family and product_type:
        confidence = max(confidence, 0.78)
    elif product_family or primary_taxonomy or taxonomy_ids:
        confidence = max(confidence, 0.75)
    if understanding.understanding_engine == "fallback" and not product_family:
        confidence = min(confidence, 0.68)

    return UniversalProductProfile(
        product_family=product_family,
        product_type=product_type,
        material=material,
        function=function,
        industry=industry,
        primary_taxonomy_family=primary_taxonomy,
        taxonomy_family_ids=tuple(dict.fromkeys(taxonomy_ids)),
        confidence=round(confidence, 2),
    )
