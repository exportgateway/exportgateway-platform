"""CN Classification V2.1 — product-aware re-ranking over nomenclature candidates."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.services.cn_entities import ProductEntities, extract_product_entities, sanitize_description_for_tokenize
from app.services.family_ranking import FamilyRankingContext, compute_universal_layer_scores
from app.services.lexicon_service import (
    MIN_TOKEN_LENGTH,
    TOKEN_WHITELIST_SHORT,
    term_matches_text,
    tokenize_for_search,
)

SYNONYMS_PATH = Path(__file__).resolve().parent.parent / "data" / "cn_synonyms.json"

VEHICLE_CHAPTER_BONUS = 10.0
VEHICLE_HEADING_BONUS = 7.0
NON_VEHICLE_CHAPTER_PENALTY = 0.04

INDUSTRIAL_SENSOR_CHAPTER_BONUS = 9.0
INDUSTRIAL_SENSOR_HEADING_BONUS = 6.5
INDUSTRIAL_AUTOMATION_HEADING_BONUS = 7.0
FALSE_POSITIVE_HEADING_PENALTY = 0.03
MODEL_ONLY_MATCH_PENALTY = 0.05

# Low-weight generic nomenclature terms (must not drive retrieval alone).
GENERIC_TERMS = frozenset(
    {
        "tablets",
        "tablet",
        "parts",
        "part",
        "accessories",
        "accessory",
        "other",
        "machine",
        "machines",
        "item",
        "items",
        "articles",
        "goods",
        "products",
        "equipment",
        "devices",
        "device",
        "components",
        "component",
        "including",
        "excluding",
        "whether",
        "presented",
        "forms",
        "form",
    }
)

STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
        "than",
        "not",
        "unknown",
        "product",
        "category",
    }
)

FOCUS_WEIGHT = 1.0
SUBSTANCE_WEIGHT = 2.8
GENERIC_WEIGHT = 0.1
SYNONYM_WEIGHT_FACTOR = 0.85

CN8_LAYER_WEIGHT = 3.0
HEADING_LAYER_WEIGHT = 2.2
CHAPTER_LAYER_WEIGHT = 1.4
CHAPTER_HINT_BONUS = 4.0
HEADING_HINT_BONUS = 5.0

MIN_FOCUS_SCORE = 1.5
MIN_TOTAL_SCORE = 2.0

TROUSERS_HEADINGS = frozenset({"6103", "6104", "6203", "6204"})
TROUSERS_GARMENT_TERMS = frozenset({"trousers", "pants", "breeches", "jeans", "denim"})
APPAREL_TROUSERS_MENS_PENALIZE_HEADINGS = frozenset({"6205", "6206"})


@dataclass(frozen=True)
class WeightedTerm:
    term: str
    weight: float
    origin: str  # query | synonym | phrase


@dataclass(frozen=True)
class RankedMatch:
    term: str
    layer: str  # cn8 | heading | chapter | hint


@dataclass(frozen=True)
class RankedCandidate:
    cn_code: str
    description: str
    score: float
    confidence_level: float
    match_reason: str
    matched_keywords: tuple[str, ...]
    matched_layers: tuple[str, ...]


@lru_cache(maxsize=1)
def _load_synonym_config() -> dict:
    if not SYNONYMS_PATH.is_file():
        return {}
    with SYNONYMS_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def _tokenize(text: str) -> list[str]:
    return tokenize_for_search(text)


def _term_weight(term: str, config: dict) -> float:
    if term in GENERIC_TERMS:
        return GENERIC_WEIGHT
    if term in config:
        return SUBSTANCE_WEIGHT
    if len(term) >= 7:
        return SUBSTANCE_WEIGHT
    return FOCUS_WEIGHT


def _display_attribute_token(value: str | None) -> str | None:
    if not value:
        return None
    return str(value).strip().lower() or None


def apply_detected_attributes_to_entities(
    entities: ProductEntities,
    *,
    material: str | None = None,
    fabric: str | None = None,
    construction: str | None = None,
    gender: str | None = None,
) -> ProductEntities:
    if not any((material, fabric, construction, gender)):
        return entities
    return ProductEntities(
        brands=entities.brands,
        vehicle_types=entities.vehicle_types,
        product_families=entities.product_families,
        condition=entities.condition,
        excluded_tokens=entities.excluded_tokens,
        model_spans=entities.model_spans,
        is_vehicle=entities.is_vehicle,
        is_industrial_sensor=entities.is_industrial_sensor,
        is_industrial_automation=entities.is_industrial_automation,
        chapter_hints=entities.chapter_hints,
        heading_hints=entities.heading_hints,
        search_terms=entities.search_terms,
        search_enrichment=entities.search_enrichment,
        penalized_headings=entities.penalized_headings,
        attribute_material=_display_attribute_token(material),
        attribute_fabric=_display_attribute_token(fabric),
        attribute_construction=_display_attribute_token(construction),
        attribute_gender=_display_attribute_token(gender),
    )


def _inject_detected_attribute_terms(
    weighted: list[WeightedTerm],
    *,
    add,
    upsert,
    entities: ProductEntities,
) -> None:
    fabric = entities.attribute_fabric
    material = entities.attribute_material
    if fabric == "denim":
        upsert("denim", SUBSTANCE_WEIGHT, "attribute")
        upsert("jeans", SUBSTANCE_WEIGHT, "attribute")
    if material == "cotton":
        upsert("cotton", SUBSTANCE_WEIGHT, "attribute")


def build_weighted_terms(
    product_description: str,
    entities: ProductEntities | None = None,
) -> tuple[list[WeightedTerm], ProductEntities]:
    entities = entities or extract_product_entities(product_description)
    config = _load_synonym_config()
    seen: set[str] = set()
    weighted: list[WeightedTerm] = []

    def add(term: str, weight: float, origin: str) -> None:
        term = term.lower().strip()
        if len(term) < MIN_TOKEN_LENGTH and term not in TOKEN_WHITELIST_SHORT:
            return
        if term in STOPWORDS:
            return
        if term in entities.excluded_tokens:
            return
        if term in seen:
            return
        seen.add(term)
        weighted.append(WeightedTerm(term=term, weight=weight, origin=origin))

    def upsert(term: str, weight: float, origin: str) -> None:
        term = term.lower().strip()
        if term in entities.excluded_tokens:
            return
        for index, item in enumerate(weighted):
            if item.term == term:
                if item.weight < weight:
                    weighted[index] = WeightedTerm(term=term, weight=weight, origin=origin)
                return
        if term not in seen:
            seen.add(term)
            weighted.append(WeightedTerm(term=term, weight=weight, origin=origin))

    text = sanitize_description_for_tokenize(product_description, entities).lower()
    for phrase, expansion in (
        ("ball bearing", ("ball", "bearing", "bearings")),
        ("ball bearings", ("ball", "bearing", "bearings")),
        ("roller bearing", ("roller", "bearing", "bearings")),
        ("air rifle", ("air", "rifle", "rifles")),
        ("laptop computer", ("laptop", "computer", "portable")),
        ("steel screw", ("steel", "screw", "screws")),
        ("steel screws", ("steel", "screw", "screws")),
        ("hydraulic valve", ("hydraulic", "valve", "oleohydraulic")),
        ("temperature sensor", ("temperature", "sensor", "thermometer", "measuring", "instruments")),
        ("pressure sensor", ("pressure", "sensor", "gauge", "measuring", "instruments")),
        ("proximity sensor", ("proximity", "sensor", "inductive", "detector")),
        ("inductive sensor", ("inductive", "proximity", "sensor", "detector")),
    ):
        if phrase in text:
            for token in expansion:
                add(token, _term_weight(token, config), "phrase")

    for token in _tokenize(text):
        add(token, _term_weight(token, config), "query")
        entry = config.get(token, {})
        for syn in entry.get("synonyms", []):
            add(syn, _term_weight(token, config) * SYNONYM_WEIGHT_FACTOR, "synonym")

    if entities.is_vehicle:
        for term in entities.search_terms:
            add(term, SUBSTANCE_WEIGHT, "entity")
        for heading_term in ("vehicle", "vehicles", "motor", "transport"):
            add(heading_term, FOCUS_WEIGHT, "entity")

    if entities.is_industrial_sensor or entities.is_industrial_automation:
        for term in entities.search_terms:
            add(term, SUBSTANCE_WEIGHT, "entity")

    _inject_detected_attribute_terms(weighted, add=add, upsert=upsert, entities=entities)

    return weighted, entities


def collect_structure_hints(
    weighted_terms: list[WeightedTerm],
    entities: ProductEntities | None = None,
) -> tuple[set[str], set[str]]:
    config = _load_synonym_config()
    chapters: set[str] = set()
    headings: set[str] = set()
    for item in weighted_terms:
        if item.origin not in ("query", "phrase", "entity"):
            continue
        entry = config.get(item.term, {})
        chapters.update(entry.get("chapters", []))
        headings.update(entry.get("headings", []))
    if entities:
        chapters.update(entities.chapter_hints)
        headings.update(entities.heading_hints)
    return chapters, headings


def focus_terms_for_retrieval(weighted_terms: list[WeightedTerm]) -> list[str]:
    """Terms used for FTS — excludes low-weight generic tokens."""
    focus = [t.term for t in weighted_terms if t.weight >= 0.5]
    if focus:
        return focus
    return [t.term for t in weighted_terms if t.weight == max(x.weight for x in weighted_terms)]


def split_hierarchy(hierarchy_path: str) -> tuple[str, str, str]:
    parts = [part.strip() for part in hierarchy_path.split(">") if part.strip()]
    if not parts:
        return "", "", ""
    cn8 = parts[-1]
    heading = parts[-2] if len(parts) >= 2 else ""
    chapter = parts[0] if len(parts) >= 1 else ""
    return chapter.lower(), heading.lower(), cn8.lower()


def _term_in_text(term: str, text: str) -> bool:
    return term_matches_text(term, text)


def _requires_co_match(weighted_terms: list[WeightedTerm]) -> list[frozenset[str]]:
    """When both terms appear in the query, both should match (e.g. ball + bearing)."""
    query_terms = {t.term for t in weighted_terms if t.origin in ("query", "phrase")}
    rules: list[frozenset[str]] = []
    if {"ball", "bearing"}.issubset(query_terms) or {"ball", "bearings"}.issubset(query_terms):
        rules.append(frozenset({"ball", "bearing", "bearings", "roller"}))
    if {"pellet", "rifle"}.issubset(query_terms) or {"pellets", "rifle"}.issubset(query_terms):
        rules.append(frozenset({"cartridge", "cartridges", "ammunition", "shot", "projectile", "9306"}))
    if {"air", "pellet"}.issubset(query_terms) or {"air", "pellets"}.issubset(query_terms):
        rules.append(frozenset({"cartridge", "cartridges", "ammunition", "9306", "9304"}))
    return rules


def score_candidate(
    *,
    cn_code: str,
    description: str,
    hierarchy_path: str,
    chapter_code: str,
    heading_code: str,
    weighted_terms: list[WeightedTerm],
    chapter_hints: set[str],
    heading_hints: set[str],
    entities: ProductEntities | None = None,
    family_ranking_context: FamilyRankingContext | None = None,
    aes_knowledge: object | None = None,
    brand_knowledge: object | None = None,
) -> tuple[float, list[RankedMatch]] | None:
    chapter_text, heading_text, cn8_text = split_hierarchy(hierarchy_path)
    cn8_desc = description.lower()
    full_hierarchy = hierarchy_path.lower()

    matches: list[RankedMatch] = []
    score = 0.0
    focus_score = 0.0

    heading_prefix = heading_code[:4] if heading_code else ""

    universal_score, universal_signals = compute_universal_layer_scores(
        chapter_code=chapter_code,
        heading_code=heading_code,
        cn8_description=description.lower(),
        combined_text=hierarchy_path.lower(),
        context=family_ranking_context,
    )
    if universal_score > 0:
        score += universal_score
        for signal in universal_signals:
            matches.append(RankedMatch(term=signal, layer="family"))

    for item in weighted_terms:
        term = item.term
        layer = None
        if _term_in_text(term, cn8_desc):
            layer = "cn8"
        elif _term_in_text(term, heading_text) or _term_in_text(term, full_hierarchy):
            if term in TROUSERS_GARMENT_TERMS and heading_prefix not in TROUSERS_HEADINGS:
                layer = None
            else:
                layer = "heading"
        elif _term_in_text(term, chapter_text):
            layer = "chapter"

        keyword_scale = (
            family_ranking_context.weights.get("keyword", 1.0)
            if family_ranking_context
            else 1.0
        )
        if layer == "cn8":
            score += item.weight * CN8_LAYER_WEIGHT * keyword_scale
        elif layer == "heading":
            score += item.weight * HEADING_LAYER_WEIGHT * keyword_scale
        elif layer == "chapter":
            score += item.weight * CHAPTER_LAYER_WEIGHT * keyword_scale

        if layer:
            matches.append(RankedMatch(term=term, layer=layer))
            if item.weight >= FOCUS_WEIGHT:
                focus_score += item.weight * (CN8_LAYER_WEIGHT if layer == "cn8" else HEADING_LAYER_WEIGHT)

    if chapter_code in chapter_hints:
        score += CHAPTER_HINT_BONUS
        matches.append(RankedMatch(term=f"chapter:{chapter_code}", layer="hint"))
        focus_score += 1.0

    if heading_prefix in heading_hints or heading_code in heading_hints:
        score += HEADING_HINT_BONUS
        matches.append(RankedMatch(term=f"heading:{heading_prefix}", layer="hint"))
        focus_score += 1.5

    co_rules = _requires_co_match(weighted_terms)
    if co_rules:
        combined = f"{cn8_desc} {heading_text} {full_hierarchy} {cn_code}"
        for required_set in co_rules:
            if not any(_term_in_text(req, combined) for req in required_set):
                score *= 0.15
                focus_score *= 0.15

    # Penalise matches driven only by generic words (e.g. "tablets" → confectionery).
    if focus_score < MIN_FOCUS_SCORE:
        generic_only = all(m.term in GENERIC_TERMS for m in matches if not m.term.startswith("chapter:"))
        if generic_only or not matches:
            return None

    score = _apply_query_context_penalties(
        score=score,
        weighted_terms=weighted_terms,
        chapter_code=chapter_code,
        heading_code=heading_code,
        cn8_description=cn8_desc,
        combined_text=f"{cn8_desc} {full_hierarchy}",
    )

    if entities:
        score = _apply_vehicle_entity_scoring(
            score=score,
            entities=entities,
            chapter_code=chapter_code,
            heading_code=heading_code,
            cn8_description=cn8_desc,
            matches=matches,
        )
        score = _apply_industrial_entity_scoring(
            score=score,
            entities=entities,
            chapter_code=chapter_code,
            heading_code=heading_code,
            cn8_description=cn8_desc,
            matches=matches,
            weighted_terms=weighted_terms,
        )
        score = _apply_apparel_entity_scoring(
            score=score,
            entities=entities,
            heading_code=heading_code,
            matches=matches,
        )
        score = _apply_family_cn8_tuning(
            score=score,
            entities=entities,
            chapter_code=chapter_code,
            heading_code=heading_code,
            cn8_description=cn8_desc,
            combined_text=f"{cn8_desc} {full_hierarchy}",
            weighted_terms=weighted_terms,
        )

    cn_digits_value = re.sub(r"\D", "", cn_code)[:8]
    if aes_knowledge is not None:
        from app.services.aes_knowledge_engine import knowledge_bonus_for_candidate

        knowledge_bonus, hist = knowledge_bonus_for_candidate(
            score,
            cn_digits=cn_digits_value,
            knowledge=aes_knowledge,
        )
        if knowledge_bonus > 0 and hist is not None:
            score += knowledge_bonus
            matches.append(
                RankedMatch(
                    term=f"aes_knowledge:{hist.cn_digits}:{knowledge_bonus:.2f}",
                    layer="knowledge",
                )
            )

    if brand_knowledge is not None:
        from app.services.brand_knowledge import brand_bonus_for_candidate

        brand_bonus, brand_match = brand_bonus_for_candidate(
            score,
            cn_digits=cn_digits_value,
            brand_context=brand_knowledge,
        )
        if brand_bonus > 0 and brand_match is not None:
            score += brand_bonus
            matches.append(
                RankedMatch(
                    term=f"brand:{brand_match.brand}:{brand_bonus:.2f}",
                    layer="knowledge",
                )
            )

    if score < MIN_TOTAL_SCORE:
        return None

    return score, matches


def _apply_apparel_entity_scoring(
    *,
    score: float,
    entities: ProductEntities,
    heading_code: str,
    matches: list[RankedMatch],
) -> float:
    families = set(entities.product_families)
    heading_prefix = heading_code[:4] if heading_code else ""
    if "apparel_tshirt_mens" in families:
        if heading_prefix == "6109":
            score += VEHICLE_HEADING_BONUS
            matches.append(RankedMatch(term="heading:6109-mens-tee", layer="entity"))
        if heading_prefix in {"6106", "6206"}:
            score *= 0.12
            matches.append(RankedMatch(term=f"penalize:{heading_prefix}-womens-blouse", layer="entity"))
    if "apparel_tshirt_womens" in families:
        if heading_prefix == "6109":
            score += VEHICLE_HEADING_BONUS
            matches.append(RankedMatch(term="heading:6109-womens-tee", layer="entity"))
        if heading_prefix in {"6104", "6204", "6206", "6106"}:
            score *= 0.08
            matches.append(RankedMatch(term=f"penalize:{heading_prefix}-womens-tee-mismatch", layer="entity"))
    if "apparel_blouse_womens" in families:
        if heading_prefix in {"6206", "6106"}:
            score += VEHICLE_HEADING_BONUS
            matches.append(RankedMatch(term=f"heading:{heading_prefix}-womens-blouse", layer="entity"))
        if heading_prefix in {"6105", "6205"}:
            score *= 0.1
            matches.append(RankedMatch(term=f"penalize:{heading_prefix}-blouse-vs-shirt", layer="entity"))
    if "apparel_polo_mens" in families:
        if heading_prefix in {"6105", "6110"}:
            score += VEHICLE_HEADING_BONUS
            matches.append(RankedMatch(term=f"heading:{heading_prefix}-mens-polo", layer="entity"))
        if heading_prefix in {"6205", "6206"}:
            score *= 0.1
            matches.append(RankedMatch(term=f"penalize:{heading_prefix}-mens-polo-woven", layer="entity"))
    mens_trousers_context = "apparel_trousers_mens" in families or (
        families.intersection({"apparel_trousers", "apparel_general_mens"})
        and (entities.attribute_gender or "").lower() in {"men", "mens", "male", "man", "boy", "boys"}
    )
    if mens_trousers_context:
        is_woven = (entities.attribute_construction or "").lower() == "woven"
        if heading_prefix == "6203":
            score += VEHICLE_HEADING_BONUS
            matches.append(RankedMatch(term="boost:6203-mens-trousers", layer="entity"))
        elif heading_prefix == "6103" and not is_woven:
            score += VEHICLE_HEADING_BONUS * 0.6
            matches.append(RankedMatch(term="boost:6103-mens-knit-trousers", layer="entity"))
        elif heading_prefix == "6103" and is_woven:
            score *= 0.05
            matches.append(RankedMatch(term="penalize:6103-woven-mismatch", layer="entity"))
        if heading_prefix in APPAREL_TROUSERS_MENS_PENALIZE_HEADINGS:
            score *= 0.08
            matches.append(RankedMatch(term=f"penalize:{heading_prefix}-mens-shirts", layer="entity"))
        if heading_prefix in {"6204", "6104"}:
            score *= 0.06
            matches.append(RankedMatch(term=f"penalize:{heading_prefix}-womens-trousers", layer="entity"))
    return score


def _apply_vehicle_entity_scoring(
    *,
    score: float,
    entities: ProductEntities,
    chapter_code: str,
    heading_code: str,
    cn8_description: str,
    matches: list[RankedMatch],
) -> float:
    if not entities.is_vehicle:
        return score

    if chapter_code != "87":
        return score * NON_VEHICLE_CHAPTER_PENALTY

    score += VEHICLE_CHAPTER_BONUS
    matches.append(RankedMatch(term="chapter:87", layer="entity"))

    heading_prefix = heading_code[:4] if heading_code else ""
    if heading_prefix in entities.heading_hints:
        score += VEHICLE_HEADING_BONUS
        matches.append(RankedMatch(term=f"heading:{heading_prefix}", layer="entity"))

    if entities.condition == "used" and "used" in cn8_description:
        score *= 1.3
        matches.append(RankedMatch(term="condition:used", layer="entity"))
    elif entities.condition == "new" and re.search(r"\bnew\b", cn8_description):
        score *= 1.2
        matches.append(RankedMatch(term="condition:new", layer="entity"))

    if "goods_vehicle" in entities.vehicle_types and heading_prefix in {"8704", "8701"}:
        score *= 1.15
    if "tractor_unit" in entities.vehicle_types and heading_prefix == "8701":
        score *= 1.2
    if "passenger_vehicle" in entities.vehicle_types and heading_prefix == "8703":
        score *= 1.25
    if "trailer" in entities.vehicle_types and heading_prefix == "8716":
        score *= 1.3

    return score


def _apply_industrial_entity_scoring(
    *,
    score: float,
    entities: ProductEntities,
    chapter_code: str,
    heading_code: str,
    cn8_description: str,
    matches: list[RankedMatch],
    weighted_terms: list[WeightedTerm],
) -> float:
    if not entities.is_industrial:
        return score

    heading_prefix = heading_code[:4] if heading_code else ""

    if entities.is_industrial_sensor:
        if chapter_code == "90":
            score += INDUSTRIAL_SENSOR_CHAPTER_BONUS
            matches.append(RankedMatch(term="chapter:90", layer="entity"))
        if heading_prefix in entities.heading_hints:
            score += INDUSTRIAL_SENSOR_HEADING_BONUS
            matches.append(RankedMatch(term=f"heading:{heading_prefix}", layer="entity"))
        if "thermometer" in cn8_description or "pyrometer" in cn8_description:
            if "temperature_sensor" in entities.product_families:
                score *= 1.25
            elif "proximity_sensor" in entities.product_families and "clinical" in cn8_description:
                score *= 0.45
        if "pressure" in cn8_description and "gauge" in cn8_description:
            if "pressure_sensor" in entities.product_families:
                score *= 1.2
        if "proximity_sensor" in entities.product_families:
            if heading_prefix.startswith("8536"):
                score += INDUSTRIAL_SENSOR_HEADING_BONUS * 1.85
                matches.append(RankedMatch(term=f"proximity:{heading_prefix}", layer="entity"))
            elif heading_prefix.startswith("9032"):
                if "inductive" in cn8_description or "proximity" in cn8_description:
                    score += INDUSTRIAL_SENSOR_HEADING_BONUS
                else:
                    score *= 0.22
            elif heading_prefix.startswith(("9025", "9026")):
                if "inductive" not in cn8_description and "proximity" not in cn8_description:
                    score *= 0.1
            if "inductive" in cn8_description or "proximity" in cn8_description:
                score *= 1.25

    if entities.is_industrial_automation and heading_prefix == "8537":
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS
        matches.append(RankedMatch(term="heading:8537", layer="entity"))
        if "programmable" in cn8_description or "controller" in cn8_description:
            score *= 1.2

    families = set(entities.product_families)
    if "frequency_inverter" in families and heading_prefix.startswith("8504"):
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.2
        matches.append(RankedMatch(term="heading:8504-inverter", layer="entity"))
    if "power_supply" in families and heading_prefix.startswith("8504"):
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS
    if "ups" in families:
        if heading_prefix.startswith("8543"):
            score *= 0.05
        elif heading_prefix.startswith("8536"):
            score *= 0.04
            if "battery" in cn8_description or "clamp" in cn8_description:
                score *= 0.15
        elif heading_prefix.startswith("8504"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.55
            if (
                "uninterruptible" in cn8_description
                or "static" in cn8_description
                or "converter" in cn8_description
            ):
                score *= 1.35
    if "electronics_monitor" in families and heading_prefix.startswith("8528"):
        score += INDUSTRIAL_SENSOR_HEADING_BONUS * 1.2

    if "stationery_marker" in families:
        if heading_prefix.startswith("9608"):
            if "marker" in cn8_description or "pen" in cn8_description:
                score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.3
        if heading_prefix.startswith("9612") or "ribbon" in cn8_description:
            score *= 0.06

    if "frequency_inverter" in families:
        combined_inv = f"{cn8_description} {heading_prefix}".lower()
        if "diesel" in combined_inv or "compression-ignition" in combined_inv:
            if "inverter" not in combined_inv and "static" not in combined_inv:
                score *= 0.08

    if "electric_motor" in families:
        if heading_prefix.startswith("8501"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.3
        if heading_prefix.startswith("87"):
            score *= 0.05

    if "furniture_office_chair" in families and heading_prefix == "9401":
        score += INDUSTRIAL_SENSOR_HEADING_BONUS

    if "office_printer_consumable" in families:
        if heading_prefix.startswith("3215"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS
        if heading_prefix.startswith("8443"):
            score *= 0.05

    if heading_prefix in entities.penalized_headings:
        score *= FALSE_POSITIVE_HEADING_PENALTY
        matches.append(RankedMatch(term=f"penalize:{heading_prefix}", layer="entity"))

    query_terms = {t.term for t in weighted_terms if t.origin in ("query", "phrase", "entity")}
    substantive = query_terms - set(entities.excluded_tokens)
    match_terms = {
        m.term
        for m in matches
        if m.layer in ("cn8", "heading", "chapter")
        and not m.term.startswith("chapter:")
        and not m.term.startswith("heading:")
        and not m.term.startswith("penalize:")
    }
    if not substantive and match_terms and match_terms <= set(entities.excluded_tokens):
        score *= MODEL_ONLY_MATCH_PENALTY
        matches.append(RankedMatch(term="model-only-match", layer="entity"))
    elif substantive:
        model_only_hits = match_terms & set(entities.excluded_tokens)
        if model_only_hits and not (match_terms - set(entities.excluded_tokens)):
            score *= MODEL_ONLY_MATCH_PENALTY
            matches.append(RankedMatch(term="model-only-match", layer="entity"))

    return score


def _apply_query_context_penalties(
    *,
    score: float,
    weighted_terms: list[WeightedTerm],
    chapter_code: str,
    heading_code: str,
    cn8_description: str,
    combined_text: str,
) -> float:
    query_terms = {t.term for t in weighted_terms if t.origin in ("query", "phrase")}

    if ("pellet" in query_terms or "pellets" in query_terms) and heading_code.startswith("9304"):
        score *= 0.12

    if ("pellet" in query_terms or "pellets" in query_terms) and heading_code.startswith("9306"):
        score *= 1.35
        if "cartridge" in combined_text:
            score *= 1.2
        if cn8_description.strip() == "cartridges":
            score *= 1.6
        if "revolvers" in combined_text and "rifle" not in query_terms:
            score *= 0.55

    if ("laptop" in query_terms or "computer" in query_terms) and not heading_code.startswith("8471"):
        if heading_code.startswith("9612"):
            score *= 0.2

    if "ibuprofen" in query_terms or "paracetamol" in query_terms:
        if chapter_code != "30":
            score *= 0.15

    if ("pen" in query_terms or "pens" in query_terms) and heading_code.startswith("3824"):
        score *= 0.12

    if ("marker" in query_terms or "permanent" in query_terms) and heading_code.startswith("9612"):
        score *= 0.08

    if ("marker" in query_terms) and heading_code.startswith("9608"):
        score *= 1.35

    if "ups" in query_terms and heading_code.startswith("8543"):
        score *= 0.05

    if ("ups" in query_terms or "backup" in query_terms) and heading_code.startswith("8536"):
        score *= 0.06

    if ("ups" in query_terms or "backup" in query_terms) and heading_code.startswith("8504"):
        score *= 1.4

    if ("proximity" in query_terms or "inductive" in query_terms) and heading_code.startswith(
        "9026"
    ):
        score *= 0.1

    if ("proximity" in query_terms or "inductive" in query_terms) and heading_code.startswith(
        "8536"
    ):
        score *= 1.45

    if ("laptop" in query_terms or "notebook" in query_terms) and heading_code.startswith("8418"):
        score *= 0.15

    if ("motor" in query_terms or "motors" in query_terms) and (
        "electric" in query_terms
        or "electrical" in query_terms
        or "servo" in query_terms
        or "induction" in query_terms
    ):
        if chapter_code == "87":
            score *= 0.05
        if heading_code.startswith("8501"):
            score *= 1.45

    if "chair" in query_terms and "office" in query_terms:
        if heading_code.startswith("9402"):
            score *= 0.05
        if heading_code.startswith("9401"):
            score *= 1.4

    if "pen" in query_terms and "refill" not in query_terms:
        if "refill" in cn8_description and "refills for" in combined_text:
            score *= 0.06
        if heading_code.startswith("9608") and "liquid ink" in combined_text:
            score *= 1.35

    if "refill" in query_terms and ("pen" in query_terms or "ink" in query_terms):
        if heading_code.startswith("9608") and "refill" in cn8_description:
            score *= 1.4

    if "cartridge" in query_terms and (
        "printer" in query_terms or "toner" in query_terms or "ink" in query_terms
    ):
        if heading_code.startswith("8443"):
            score *= 0.05
        if heading_code.startswith("3215"):
            score *= 1.45

    return score


def _apply_family_cn8_tuning(
    *,
    score: float,
    entities: ProductEntities,
    chapter_code: str,
    heading_code: str,
    cn8_description: str,
    combined_text: str,
    weighted_terms: list[WeightedTerm],
) -> float:
    """A.2.2 — within-heading CN8 precision for production validation gaps."""
    families = set(entities.product_families)
    if not families:
        return score

    heading_prefix = heading_code[:4] if heading_code else ""
    query_terms = {t.term for t in weighted_terms if t.origin in ("query", "phrase", "entity")}
    blob = f"{cn8_description} {combined_text}".lower()

    if "electric_motor" in families:
        if chapter_code == "87" or heading_prefix.startswith("87"):
            score *= 0.04
        if heading_prefix.startswith("8501"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.5
            if "motor" in cn8_description:
                score *= 1.35

    motor_ctx = {"electric", "electrical", "induction", "servo", "synchronous", "phase"}
    if ({"motor", "motors"} & query_terms) and (motor_ctx & query_terms):
        if chapter_code == "87":
            score *= 0.05
        if heading_prefix.startswith("8501"):
            score *= 1.4

    if families.intersection(
        {
            "furniture_office_chair",
            "furniture_office_desk",
            "furniture_cabinet",
            "furniture_shelving",
            "furniture_workstation",
        }
    ):
        if heading_prefix == "9402":
            score *= 0.04
        if heading_prefix == "9401":
            score += INDUSTRIAL_SENSOR_HEADING_BONUS
            if "seat" in blob or "chair" in cn8_description:
                score *= 1.35

    if "stationery_pen" in families and "stationery_pen_refill" not in families:
        if cn8_description.startswith("refill") or "refills for ballpoint" in blob:
            score *= 0.06
        if "rolling ball" in blob or "liquid ink" in cn8_description or "ball-point" in blob:
            score *= 1.45

    if "stationery_pen_refill" in families:
        if "refill" in cn8_description:
            score *= 1.4

    if "office_printer_consumable" in families:
        if heading_prefix.startswith("3215"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.25
        if heading_prefix.startswith("8443"):
            score *= 0.04

    if families.intersection({"power_supply", "ups"}):
        if "exceeding 500" in blob or ("500" in cn8_description and "kva" in cn8_description):
            score *= 0.1
        if "24v" in query_terms or "24vdc" in query_terms or "smps" in query_terms or "ups" in query_terms:
            if (
                "not exceeding 7" in blob
                or "rectifier" in cn8_description
                or "accumulator charger" in cn8_description
                or "static converter" in cn8_description
            ):
                score *= 1.35
            if "exceeding 500" in blob:
                score *= 0.12

    if "pressure_sensor" in families and heading_prefix.startswith("9026"):
        if "pressure" in cn8_description:
            score *= 1.55
        elif "flow meter" in cn8_description:
            score *= 0.28
        elif "electronic" in cn8_description and "pressure" not in blob:
            score *= 0.6

    if "proximity_sensor" in families and heading_prefix.startswith("8536"):
        if "proximity" in cn8_description or "inductive" in cn8_description:
            score *= 1.6
        elif "rotary switch" in cn8_description or "push-button" in cn8_description:
            score *= 0.7

    if "photoelectric_sensor" in families and heading_prefix.startswith("9031"):
        score *= 1.35
    if "photoelectric_sensor" in families and heading_prefix.startswith("8536"):
        score *= 0.35

    if "fastener_threaded_rod" in families:
        if heading_prefix.startswith("7318"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.4
        if heading_prefix.startswith("7307"):
            score *= 0.05

    if "food_prepared_meal" in families:
        if heading_prefix.startswith(("2106", "1905")):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.3
        if heading_prefix.startswith("2004"):
            score *= 0.05

    if "food_prepared_pizza" in families and (
        "bakery" in query_terms or "bakery" in blob or "bakers" in blob
    ):
        if heading_prefix.startswith("1905"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.5
        if heading_prefix.startswith("2106"):
            score *= 0.12

    if "electrical_insulation_tester" in families and heading_prefix.startswith(("9030", "9031")):
        score += INDUSTRIAL_SENSOR_HEADING_BONUS * 1.2
        if "insulation" in cn8_description or "resistance" in cn8_description:
            score *= 1.35
    if "micro_ohmmeter" in families and heading_prefix.startswith(("9030", "9031")):
        score += INDUSTRIAL_SENSOR_HEADING_BONUS
        if "resistance" in cn8_description or "ohm" in cn8_description:
            score *= 1.3
    if "shipping_container" in families:
        if heading_prefix.startswith("8609"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.3
        if heading_prefix.startswith("87"):
            score *= 0.05
    if "food_pasta" in families and heading_prefix.startswith("1902"):
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.25
    if "polyurethane_compound" in families and heading_prefix.startswith("3909"):
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS
    if "silicone_sealant" in families and heading_prefix.startswith("3214"):
        score += INDUSTRIAL_SENSOR_HEADING_BONUS
    if "protective_coating_paint" in families and heading_prefix.startswith("3209"):
        score += INDUSTRIAL_SENSOR_HEADING_BONUS

    if "silicone_sealant" in families:
        if heading_prefix.startswith("3214"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.2
        if heading_prefix.startswith("3506"):
            score *= 0.15

    if "wire_rope" in families:
        if heading_prefix.startswith("7312"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.35
        if heading_prefix.startswith("7313"):
            score *= 0.12

    if "earth_resistance_tester" in families and heading_prefix.startswith(("9030", "9031")):
        score += INDUSTRIAL_SENSOR_HEADING_BONUS * 1.3
        if "earth" in cn8_description or "ground" in cn8_description or "resistance" in cn8_description:
            score *= 1.25

    if "tool_steel_bars" in families and heading_prefix.startswith(("7228", "7224")):
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.25

    if "food_aromatized_syrup" in families and heading_prefix.startswith("2106"):
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.3

    if "furniture_fittings" in families:
        if heading_prefix.startswith(("8302", "8308")):
            score += INDUSTRIAL_SENSOR_HEADING_BONUS * 1.6
            if any(token in blob for token in ("hinge", "bracket", "fitting", "mounting", "okovje")):
                score *= 1.35
        if heading_prefix.startswith(("7318", "9403", "9405", "8304", "3926", "9401")):
            score *= 0.03

    if "industrial_adhesive" in families:
        if heading_prefix.startswith("3506"):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.4
        if heading_prefix.startswith("4821"):
            score *= 0.04

    if "protective_coating_paint" in families:
        if heading_prefix.startswith(("3209", "3210")):
            score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.35
        if heading_prefix.startswith(("4810", "9701", "3212", "4821")):
            score *= 0.05

    if "silicone_sealant" in families:
        if heading_prefix.startswith("3006"):
            score *= 0.04

    if "software_media_disc" in families and heading_prefix.startswith("8523"):
        score += INDUSTRIAL_AUTOMATION_HEADING_BONUS * 1.2

    return score


def confidence_from_scores(
    score: float,
    best_score: float,
    focus_term_count: int,
    *,
    rank_index: int = 0,
    heading_prior_match: bool = False,
) -> float:
    if best_score <= 0:
        return 0.35
    relative = score / best_score
    coverage = min(1.0, focus_term_count / 4.0)
    prior_boost = 0.12 if heading_prior_match else 0.0
    combined = 0.55 * relative + 0.33 * coverage + prior_boost
    base = min(0.97, max(0.38, combined * 0.94))
    if rank_index > 0:
        decay = max(0.78, 1.0 - 0.11 * rank_index)
        if relative > 0.95:
            decay = max(0.72, decay - 0.05)
        base *= decay
    return round(base, 2)


def build_match_reason(
    matches: list[RankedMatch],
    cn_code: str,
    entities: ProductEntities | None = None,
) -> tuple[str, tuple[str, ...]]:
    keywords: list[str] = []
    layers_used: list[str] = []
    for match in matches:
        if match.term.startswith("chapter:") or match.term.startswith("heading:"):
            keywords.append(match.term)
            layers_used.append("structure hint")
            continue
        keywords.append(match.term)
        if match.layer == "cn8":
            layers_used.append("CN8 description")
        elif match.layer == "heading":
            layers_used.append("heading text")
        elif match.layer == "chapter":
            layers_used.append("chapter text")
        elif match.layer == "hint":
            layers_used.append("synonym chapter/heading")

    unique_keywords = tuple(dict.fromkeys(keywords))
    layer_summary = ", ".join(dict.fromkeys(layers_used))
    entity_prefix = ""
    if entities and entities.summary() != "none":
        entity_prefix = f"Entities: {entities.summary()}. "

    reason = (
        f"{entity_prefix}"
        f"Ranked CN {cn_code} using product-aware matching ({layer_summary}). "
        f"Key terms: {', '.join(unique_keywords[:8])}."
    )
    return reason, unique_keywords


def rank_candidates(
    rows: list[dict],
    product_description: str,
    limit: int = 5,
    entities: ProductEntities | None = None,
    family_ranking_context: FamilyRankingContext | None = None,
    aes_knowledge: object | None = None,
    brand_knowledge: object | None = None,
) -> list[RankedCandidate]:
    weighted_terms, entities = build_weighted_terms(product_description, entities)
    if not weighted_terms and not entities.is_vehicle and not entities.is_industrial:
        return []

    chapter_hints, heading_hints = collect_structure_hints(weighted_terms, entities)
    focus_count = sum(1 for t in weighted_terms if t.weight >= FOCUS_WEIGHT)

    scored: list[tuple[float, dict, list[RankedMatch]]] = []
    for row in rows:
        result = score_candidate(
            cn_code=row["cn_code"],
            description=row["description"],
            hierarchy_path=row.get("hierarchy_path", ""),
            chapter_code=row.get("chapter_code", ""),
            heading_code=row.get("heading_code", ""),
            weighted_terms=weighted_terms,
            chapter_hints=chapter_hints,
            heading_hints=heading_hints,
            entities=entities,
            family_ranking_context=family_ranking_context,
            aes_knowledge=aes_knowledge,
            brand_knowledge=brand_knowledge,
        )
        if result is None:
            continue
        score, matches = result
        scored.append((score, row, matches))

    if not scored:
        return []

    scored.sort(key=lambda item: item[0], reverse=True)
    best_score = scored[0][0]
    results: list[RankedCandidate] = []

    heading_priors = set(entities.heading_hints) if entities else set()
    for rank_index, (score, row, matches) in enumerate(scored[:limit]):
        reason, keywords = build_match_reason(matches, row["cn_code"], entities)
        heading = str(row.get("heading_code", ""))[:4]
        prior_match = bool(heading_priors and heading and heading in heading_priors)
        confidence = confidence_from_scores(
            score,
            best_score,
            focus_count,
            rank_index=rank_index,
            heading_prior_match=prior_match,
        )
        layers = tuple(dict.fromkeys(m.layer for m in matches))
        results.append(
            RankedCandidate(
                cn_code=row["cn_code"],
                description=row["description"],
                score=score,
                confidence_level=confidence,
                match_reason=reason,
                matched_keywords=keywords,
                matched_layers=layers,
            )
        )

    return results
