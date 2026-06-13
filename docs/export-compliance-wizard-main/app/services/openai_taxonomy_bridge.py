"""Map OpenAI product understanding attributes to taxonomy disambiguation answers."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.services.product_understanding_service import ProductUnderstandingResult

logger = logging.getLogger(__name__)

AUTO_ANSWER_CONFIDENCE_THRESHOLD = 0.85

_GENDER_TO_DISAMBIG: dict[str, str] = {
    "male": "mens",
    "men": "mens",
    "mens": "mens",
    "man": "mens",
    "boy": "mens",
    "boys": "mens",
    "female": "womens",
    "women": "womens",
    "womens": "womens",
    "woman": "womens",
    "girl": "womens",
    "girls": "womens",
    "ladies": "womens",
    "lady": "womens",
}

_CONSTRUCTION_TO_DISAMBIG: dict[str, str] = {
    "woven": "woven",
    "weave": "woven",
    "knitted": "knitted",
    "knit": "knitted",
    "crochet": "knitted",
    "crocheted": "knitted",
}

_GENDER_DISPLAY: dict[str, str] = {
    "male": "Men",
    "men": "Men",
    "mens": "Men",
    "man": "Men",
    "boy": "Men",
    "boys": "Men",
    "female": "Women",
    "women": "Women",
    "womens": "Women",
    "woman": "Women",
    "girl": "Women",
    "girls": "Women",
    "ladies": "Women",
    "lady": "Women",
    "unisex": "Unisex",
}

_CONSTRUCTION_DISPLAY: dict[str, str] = {
    "woven": "Woven",
    "weave": "Woven",
    "knitted": "Knitted",
    "knit": "Knitted",
    "crochet": "Knitted",
    "crocheted": "Knitted",
}

_MATERIAL_DISPLAY: dict[str, str] = {
    "cotton": "Cotton",
    "wool": "Wool",
    "polyester": "Polyester",
    "silk": "Silk",
    "linen": "Linen",
    "nylon": "Nylon",
    "viscose": "Viscose",
    "bamboo": "Bamboo",
    "cashmere": "Cashmere",
}

_FABRIC_DISPLAY: dict[str, str] = {
    "denim": "Denim",
    "jersey": "Jersey",
    "fleece": "Fleece",
    "twill": "Twill",
    "corduroy": "Corduroy",
    "velvet": "Velvet",
}

_WOVEN_SIGNALS = frozenset(
    {"jeans", "denim", "trousers", "pants", "shirt", "blouse", "jacket", "coat", "woven"}
)
_KNIT_SIGNALS = frozenset(
    {"t-shirt", "tshirt", "tee", "jersey", "polo", "sweater", "pullover", "knitted", "knit"}
)
_MALE_SIGNALS = frozenset({"men", "mens", "male", "boy", "boys", "moške", "moška", "moški"})
_FEMALE_SIGNALS = frozenset({"women", "womens", "female", "girl", "girls", "ladies", "ženske", "ženska"})


@dataclass(frozen=True)
class DetectedAttributes:
    gender: str | None = None
    material: str | None = None
    fabric: str | None = None
    construction: str | None = None

    def to_dict(self) -> dict[str, str]:
        out: dict[str, str] = {}
        if self.gender:
            out["gender"] = self.gender
        if self.material:
            out["material"] = self.material
        if self.fabric:
            out["fabric"] = self.fabric
        if self.construction:
            out["construction"] = self.construction
        return out

    def has_any(self) -> bool:
        return bool(self.gender or self.material or self.fabric or self.construction)


def _normalize_token(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = str(value).strip().lower()
    return cleaned or None


def _title_display(raw: str | None, mapping: dict[str, str]) -> str | None:
    token = _normalize_token(raw)
    if not token:
        return None
    if token in mapping:
        return mapping[token]
    return token.replace("_", " ").title()


def extract_detected_attributes(understanding: ProductUnderstandingResult) -> DetectedAttributes:
    """Build display attributes from OpenAI fields, search terms, and description."""
    raw_attrs = understanding.detected_attributes_raw or {}
    terms = set(understanding.search_terms)
    text = f"{understanding.english_description} {' '.join(understanding.search_terms)}".lower()

    gender_raw = _normalize_token(raw_attrs.get("gender"))
    material_raw = _normalize_token(raw_attrs.get("material"))
    fabric_raw = _normalize_token(raw_attrs.get("fabric"))
    construction_raw = _normalize_token(raw_attrs.get("construction"))

    if not gender_raw:
        if terms & _MALE_SIGNALS or re.search(r"\b(men'?s?|male|boys?|moške|moška|moški)\b", text):
            gender_raw = "male"
        elif terms & _FEMALE_SIGNALS or re.search(r"\b(women'?s?|female|girls?|ladies|ženske|ženska)\b", text):
            gender_raw = "female"

    if not material_raw:
        for token in ("cotton", "wool", "polyester", "silk", "linen", "nylon", "viscose", "bombaž", "bombažne"):
            if token in text:
                material_raw = "cotton" if token.startswith("bomba") else token
                break

    if not fabric_raw:
        if "denim" in text or "jeans" in terms or "jeans" in text:
            fabric_raw = "denim"
        elif "jersey" in text:
            fabric_raw = "jersey"
        elif "fleece" in text:
            fabric_raw = "fleece"

    if not construction_raw:
        if terms & _WOVEN_SIGNALS or re.search(r"\b(jeans|denim|trousers|pants|woven)\b", text):
            construction_raw = "woven"
        elif terms & _KNIT_SIGNALS or re.search(r"\b(t-?shirt|polo|sweater|knitted|knit)\b", text):
            construction_raw = "knitted"

    return DetectedAttributes(
        gender=_title_display(gender_raw, _GENDER_DISPLAY),
        material=_title_display(material_raw, _MATERIAL_DISPLAY),
        fabric=_title_display(fabric_raw, _FABRIC_DISPLAY),
        construction=_title_display(construction_raw, _CONSTRUCTION_DISPLAY),
    )


def attributes_to_disambiguation_answers(
    attributes: DetectedAttributes,
    understanding: ProductUnderstandingResult,
) -> dict[str, str]:
    """Map detected attributes and product signals to taxonomy disambiguation option ids."""
    answers: dict[str, str] = {}
    terms = set(understanding.search_terms)
    text = f"{understanding.english_description} {' '.join(understanding.search_terms)}".lower()

    construction_key = _normalize_token(attributes.construction)
    if construction_key:
        mapped = _CONSTRUCTION_TO_DISAMBIG.get(construction_key)
        if mapped:
            answers["textile_construction"] = mapped

    if "textile_construction" not in answers:
        if terms & _WOVEN_SIGNALS or re.search(r"\b(jeans|denim|trousers|pants)\b", text):
            answers["textile_construction"] = "woven"
        elif terms & _KNIT_SIGNALS or re.search(r"\b(t-?shirt|polo|sweater|knitted)\b", text):
            answers["textile_construction"] = "knitted"

    gender_key = _normalize_token(attributes.gender)
    if gender_key:
        mapped = _GENDER_TO_DISAMBIG.get(gender_key)
        if mapped:
            answers["apparel_gender"] = mapped

    if "apparel_gender" not in answers:
        if "apparel_trousers_mens" in understanding.product_families or terms & _MALE_SIGNALS:
            answers["apparel_gender"] = "mens"
        elif "apparel_trousers_womens" in understanding.product_families or terms & _FEMALE_SIGNALS:
            answers["apparel_gender"] = "womens"

    return answers


def merge_openai_taxonomy_answers(
    understanding: ProductUnderstandingResult,
    *,
    user_disambiguation: dict[str, str] | None = None,
) -> tuple[dict[str, str], list[str], DetectedAttributes]:
    """
    Merge user-provided disambiguation with high-confidence OpenAI-derived answers.

    Returns (merged_answers, auto_answered_question_ids, detected_attributes).
    """
    user_disambiguation = dict(user_disambiguation or {})
    detected = extract_detected_attributes(understanding)
    candidate_answers = attributes_to_disambiguation_answers(detected, understanding)

    auto_answered: list[str] = []
    merged = dict(user_disambiguation)

    if understanding.confidence >= AUTO_ANSWER_CONFIDENCE_THRESHOLD:
        for question_id, answer_id in candidate_answers.items():
            if question_id in merged:
                continue
            merged[question_id] = answer_id
            auto_answered.append(question_id)

    if auto_answered:
        logger.info(
            "auto_answered_questions=%s confidence=%.2f engine=%s product_families=%s",
            auto_answered,
            understanding.confidence,
            understanding.understanding_engine,
            list(understanding.product_families),
        )

    return merged, auto_answered, detected
