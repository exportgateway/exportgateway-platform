"""Product family taxonomy v1 — chapter constraints (Phase A)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "data" / "cn_taxonomy_v1.json"


@dataclass(frozen=True)
class TaxonomyMatch:
    family_id: str
    label: str


@dataclass(frozen=True)
class ChapterConstraints:
    allowed_chapters: frozenset[str]
    excluded_chapters: frozenset[str]
    chapter_priors: frozenset[str]
    heading_priors: frozenset[str]
    search_terms: tuple[str, ...]
    penalized_headings: frozenset[str]
    pending_disambiguation: tuple[str, ...]
    family_ids: tuple[str, ...]


@lru_cache(maxsize=1)
def _load_taxonomy() -> dict:
    if not TAXONOMY_PATH.is_file():
        return {"families": [], "disambiguation_questions": {}}
    with TAXONOMY_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def _phrase_in_text(phrase: str, lower: str) -> bool:
    """Whole-word match for short tokens (e.g. ups must not match syrups)."""
    p = phrase.lower().strip()
    if not p:
        return False
    if len(p) <= 5 and " " not in p:
        return bool(re.search(rf"\b{re.escape(p)}\b", lower))
    return p in lower


def detect_families(text: str, extra_family_ids: list[str] | None = None) -> list[TaxonomyMatch]:
    lower = text.lower()
    matches: list[TaxonomyMatch] = []
    seen: set[str] = set()
    config = _load_taxonomy()

    for entry in sorted(
        config.get("families", []),
        key=lambda e: max(len(p) for p in e.get("phrases", [""])),
        reverse=True,
    ):
        fid = entry.get("id", "")
        if fid in seen:
            continue
        for phrase in entry.get("phrases", []):
            if _phrase_in_text(phrase, lower):
                matches.append(TaxonomyMatch(family_id=fid, label=entry.get("label", fid)))
                seen.add(fid)
                break

    for fid in extra_family_ids or []:
        if fid not in seen:
            for entry in config.get("families", []):
                if entry.get("id") == fid:
                    matches.append(TaxonomyMatch(family_id=fid, label=entry.get("label", fid)))
                    seen.add(fid)
                    break

    return matches


def _woven_heading_priors_for_families(family_ids: list[str], option_headings: list[str]) -> list[str]:
    """Trousers families should not inherit shirt headings from the woven disambiguation option."""
    ids = set(family_ids)
    if "apparel_trousers_mens" in ids:
        return [h for h in option_headings if h == "6203"]
    if "apparel_trousers_womens" in ids:
        return [h for h in option_headings if h == "6204"]
    if ids.intersection({"apparel_trousers", "apparel_trousers_mens", "apparel_trousers_womens"}):
        return [h for h in option_headings if h in {"6203", "6204"}]
    return option_headings


def resolve_chapter_constraints(
    family_matches: list[TaxonomyMatch],
    *,
    disambiguation: dict[str, str] | None = None,
    classification_text: str = "",
) -> ChapterConstraints:
    config = _load_taxonomy()
    disambiguation = disambiguation or {}
    family_ids: list[str] = []
    allowed: set[str] = set()
    excluded: set[str] = set()
    priors: set[str] = set()
    headings: set[str] = set()
    search_terms: list[str] = []
    penalized: set[str] = set()
    pending: set[str] = set()
    text_lower = (classification_text or "").lower()

    entries_by_id = {e["id"]: e for e in config.get("families", [])}

    for match in family_matches:
        family_ids.append(match.family_id)
        entry = entries_by_id.get(match.family_id, {})
        for ch in entry.get("chapters", []):
            priors.add(str(ch))
        for ch in entry.get("excluded_chapters", []):
            excluded.add(str(ch))
        for h in entry.get("headings", []):
            headings.add(h)
        for term in entry.get("search_terms", []):
            search_terms.append(term.lower())
        for h in entry.get("penalized_headings", []):
            penalized.add(h)
        for key in entry.get("disambiguation", []):
            if key not in disambiguation:
                pending.add(key)

    if family_ids:
        allowed = set(priors) - excluded
        if not allowed:
            allowed = set(priors)

    _specific_sensor_families = {
        "temperature_sensor",
        "pressure_sensor",
        "proximity_sensor",
        "photoelectric_sensor",
    }
    if _specific_sensor_families.intersection(family_ids):
        pending.discard("sensor_measurement_type")
    if "apparel_trousers_mens" in family_ids:
        pending.discard("apparel_gender")
    if "apparel_trousers_womens" in family_ids:
        pending.discard("apparel_gender")
    if "apparel_tshirt_mens" in family_ids:
        pending.discard("apparel_gender")
    if "apparel_tshirt_womens" in family_ids:
        pending.discard("apparel_gender")
    if "apparel_polo_mens" in family_ids:
        pending.discard("apparel_gender")
    if "apparel_blouse_womens" in family_ids:
        pending.discard("apparel_gender")
    if "apparel_jacket_womens" in family_ids:
        pending.discard("apparel_gender")
    if "hydraulic_pressure_valve" in family_ids or "industrial_valve" in family_ids:
        pending.discard("valve_type")
    _suppress = {
        "apparel_trousers_mens": {"apparel_trousers"},
        "apparel_trousers_womens": {"apparel_trousers"},
        "apparel_polo_mens": {"apparel_shirts"},
        "apparel_tshirt_mens": {"apparel_shirts"},
        "apparel_tshirt_womens": {"apparel_general_womens", "apparel_shirts"},
        "apparel_blouse_womens": {"apparel_shirts"},
        "apparel_jacket_womens": {"apparel_jacket"},
        "temperature_sensor": {"sensor"},
        "pressure_sensor": {"sensor"},
        "proximity_sensor": {"sensor"},
        "photoelectric_sensor": {"sensor"},
        "ups": {"power_supply"},
        "electric_motor": {"vehicle_goods", "vehicle_goods_used"},
        "stationery_pen_refill": {"stationery_pen"},
        "stationery_pen": {"stationery_pen_refill"},
        "furniture_fittings": {
            "furniture_cabinet",
            "furniture_office_desk",
            "furniture_shelving",
            "fastener_screw",
            "fastener_nut",
            "fastener_bolt",
        },
        "protective_coating_paint": {"apparel_jacket", "apparel_jacket_womens"},
        "food_pasta": {"food_prepared_pizza"},
        "food_aromatized_syrup": {"food_prepared_pizza", "food_pasta"},
        "polyurethane_compound": {"silicone_sealant", "industrial_adhesive", "protective_coating_paint"},
    }
    for primary, secondary in _suppress.items():
        if primary in family_ids:
            family_ids = [fid for fid in family_ids if fid not in secondary]

    if "protective_coating_paint" in family_ids and not re.search(
        r"\b(jacket|coat|anorak|blazer)\b", text_lower
    ):
        family_ids = [
            fid
            for fid in family_ids
            if fid not in {"apparel_jacket", "apparel_jacket_womens"}
        ]
        pending.discard("textile_construction")
        pending.discard("apparel_gender")

    questions = config.get("disambiguation_questions", {})
    for key, answer in disambiguation.items():
        q = questions.get(key, {})
        for opt in q.get("options", []):
            if opt.get("id") == answer:
                option_headings = list(opt.get("heading_priors", []))
                if key == "textile_construction" and answer == "woven":
                    option_headings = _woven_heading_priors_for_families(family_ids, option_headings)
                for h in option_headings:
                    headings.add(h)
                for term in opt.get("search_terms", []):
                    search_terms.append(term.lower())
                pending.discard(key)

    if "apparel_trousers_mens" in family_ids:
        headings.discard("6104")
        headings.discard("6204")
    if "apparel_trousers_womens" in family_ids:
        headings.discard("6103")
        headings.discard("6203")

    return ChapterConstraints(
        allowed_chapters=frozenset(allowed),
        excluded_chapters=frozenset(excluded),
        chapter_priors=frozenset(priors),
        heading_priors=frozenset(headings),
        search_terms=tuple(dict.fromkeys(search_terms)),
        penalized_headings=frozenset(penalized),
        pending_disambiguation=tuple(sorted(pending)),
        family_ids=tuple(dict.fromkeys(family_ids)),
    )


def get_disambiguation_questions(question_ids: list[str]) -> list[dict]:
    config = _load_taxonomy()
    questions = config.get("disambiguation_questions", {})
    result: list[dict] = []
    for qid in question_ids:
        q = questions.get(qid)
        if not q:
            continue
        result.append(
            {
                "id": qid,
                "prompt": q.get("prompt", ""),
                "options": [
                    {"id": o.get("id"), "label": o.get("label")}
                    for o in q.get("options", [])
                ],
            }
        )
    return result


def global_excluded_tokens() -> frozenset[str]:
    config = _load_taxonomy()
    return frozenset(t.lower() for t in config.get("global_excluded_tokens", []))
