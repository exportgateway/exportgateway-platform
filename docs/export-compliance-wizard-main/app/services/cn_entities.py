"""CN Classification V2.2/V2.5 — product entity recognition (vehicles, industrial, brands, models)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
VEHICLE_ENTITIES_PATH = DATA_DIR / "cn_vehicle_entities.json"
INDUSTRIAL_ENTITIES_PATH = DATA_DIR / "cn_industrial_entities.json"

# Vehicle model / trim codes — must not be used as CN search tokens.
VEHICLE_MODEL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b([a-z]{2,5})\s+(\d{2,4})\b", re.IGNORECASE),
    re.compile(r"\b([a-z]{2,5})\s*[-]?\s*(\d{2,4})\s*(\d{2,4})?\b", re.IGNORECASE),
    re.compile(r"\b(\d{2})\.(\d{3})\b"),
    re.compile(r"\b(actros|tgx|xf|stralis|eurocargo|megaspace)\s*(\d{2,4})\b", re.IGNORECASE),
    re.compile(r"\b(\d{4})\b"),
]

# Industrial / automation catalogue codes (must not drive CN ranking).
INDUSTRIAL_MODEL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b([A-Z]{2,5})-([A-Z0-9]{1,8})\b"),
    re.compile(r"\b([A-Z]{2,4}\d{2,4}[A-Z0-9-]*)\b"),
    re.compile(r"\b(6ES[0-9A-Z-]+)\b", re.IGNORECASE),
    re.compile(r"\b(3RT\d+[A-Z0-9-]*)\b", re.IGNORECASE),
    re.compile(r"\b([A-Z]{2,5})(\d{4,6})\b"),
    re.compile(r"\b([A-Z]{2,6}-\d{2,6}[A-Z0-9]*)\b"),
]

PURE_NUMERIC_TOKEN = re.compile(r"^\d{3,4}$")
MODEL_ALPHA_FRAGMENT = re.compile(r"^[a-z]{2,5}$", re.IGNORECASE)


@dataclass(frozen=True)
class ProductEntities:
    brands: tuple[str, ...] = ()
    vehicle_types: tuple[str, ...] = ()
    product_families: tuple[str, ...] = ()
    condition: str | None = None
    excluded_tokens: frozenset[str] = field(default_factory=frozenset)
    model_spans: tuple[str, ...] = ()
    is_vehicle: bool = False
    is_industrial_sensor: bool = False
    is_industrial_automation: bool = False
    chapter_hints: frozenset[str] = field(default_factory=frozenset)
    heading_hints: frozenset[str] = field(default_factory=frozenset)
    search_terms: tuple[str, ...] = ()
    search_enrichment: str = ""
    penalized_headings: frozenset[str] = field(default_factory=frozenset)
    attribute_material: str | None = None
    attribute_fabric: str | None = None
    attribute_construction: str | None = None
    attribute_gender: str | None = None
    universal_product_family: str | None = None
    universal_product_type: str | None = None
    universal_material: str | None = None
    universal_function: str | None = None
    universal_industry: str | None = None

    @property
    def is_industrial(self) -> bool:
        return self.is_industrial_sensor or self.is_industrial_automation

    def summary(self) -> str:
        parts: list[str] = []
        if self.brands:
            parts.append(f"brand={', '.join(self.brands)}")
        if self.product_families:
            parts.append(f"family={', '.join(self.product_families)}")
        if self.vehicle_types:
            parts.append(f"vehicle_type={', '.join(self.vehicle_types)}")
        if self.condition:
            parts.append(f"condition={self.condition}")
        if self.model_spans:
            parts.append(f"model={', '.join(self.model_spans)}")
        return "; ".join(parts) if parts else "none"


@lru_cache(maxsize=1)
def _load_vehicle_config() -> dict:
    if not VEHICLE_ENTITIES_PATH.is_file():
        return {}
    with VEHICLE_ENTITIES_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _load_industrial_config() -> dict:
    if not INDUSTRIAL_ENTITIES_PATH.is_file():
        return {}
    with INDUSTRIAL_ENTITIES_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def _find_vehicle_brands(text: str, config: dict) -> list[str]:
    found: list[str] = []
    lower = text.lower()
    for brand in sorted(config.get("brands", []), key=len, reverse=True):
        pattern = rf"\b{re.escape(brand)}\b"
        if re.search(pattern, lower, re.IGNORECASE):
            found.append(brand)
    return found


def _find_industrial_brands(text: str, config: dict) -> list[str]:
    found: list[str] = []
    for entry in config.get("brands", []):
        brand_id = entry.get("id", "")
        for pattern in entry.get("patterns", []):
            if re.search(pattern, text, re.IGNORECASE):
                if brand_id and brand_id not in found:
                    found.append(brand_id)
                break
    return found


def _find_condition(text: str, config: dict) -> str | None:
    lower = text.lower()
    for term, value in config.get("condition_terms", {}).items():
        if re.search(rf"\b{re.escape(term)}\b", lower):
            return value
    return None


def _find_vehicle_phrases(text: str, config: dict) -> list[dict]:
    lower = text.lower()
    matches: list[dict] = []
    for entry in config.get("vehicle_phrases", []):
        for phrase in entry.get("phrases", []):
            if phrase.lower() in lower:
                matches.append(entry)
                break
    return matches


def _find_manufacturer_series(text: str, config: dict) -> list[dict]:
    """Map brand + model series (e.g. IFM PN7094) to product families."""
    matches: list[dict] = []
    seen: set[str] = set()
    brand_ids = _find_industrial_brands(text, config)
    if not brand_ids:
        return matches

    for entry in config.get("manufacturer_series", []):
        family = entry.get("family", "")
        if not family or family in seen:
            continue
        entry_brands = {b.lower() for b in entry.get("brands", [])}
        if not entry_brands.intersection({b.lower() for b in brand_ids}):
            continue
        pattern = entry.get("model_pattern", "")
        if not pattern:
            continue
        if not re.search(pattern, text, re.IGNORECASE):
            continue
        matches.append(entry)
        seen.add(family)
    return matches


def _find_product_families(text: str, config: dict) -> list[dict]:
    lower = text.lower()
    matches: list[dict] = []
    seen: set[str] = set()
    for entry in sorted(
        config.get("product_families", []),
        key=lambda item: max(len(p) for p in item.get("phrases", [""])),
        reverse=True,
    ):
        family = entry.get("family", "")
        if family in seen:
            continue
        for phrase in entry.get("phrases", []):
            if phrase.lower() in lower:
                matches.append(entry)
                seen.add(family)
                break
    return matches


def _tokens_from_model_span(span: str, never_rank: set[str]) -> set[str]:
    excluded: set[str] = set()
    for token in re.findall(r"[a-z0-9]+", span.lower()):
        if PURE_NUMERIC_TOKEN.match(token) or (token.isdigit() and len(token) >= 2):
            excluded.add(token)
        if token in never_rank:
            excluded.add(token)
        if MODEL_ALPHA_FRAGMENT.match(token) and len(token) <= 5:
            excluded.add(token)
    return excluded


def _extract_model_spans(
    text: str,
    *,
    patterns: list[re.Pattern[str]],
    never_rank: set[str],
) -> tuple[list[str], set[str]]:
    spans: list[str] = []
    excluded: set[str] = set()
    seen_span: set[str] = set()

    for pattern in patterns:
        for match in pattern.finditer(text):
            span = match.group(0).strip()
            key = span.lower()
            if key in seen_span:
                continue
            seen_span.add(key)
            spans.append(span)
            excluded.update(_tokens_from_model_span(span, never_rank))

    return spans, excluded


def _brand_implies_vehicle(brand: str, vehicle_matches: list[dict]) -> list[dict]:
    if vehicle_matches:
        return vehicle_matches
    truck_brands = {
        "daf",
        "man",
        "volvo",
        "scania",
        "mercedes-benz",
        "mercedes",
        "iveco",
        "renault trucks",
        "renault",
    }
    trailer_brands = {"schmitz", "krone"}
    passenger_brands = {"bmw"}
    config = _load_vehicle_config()
    if brand in truck_brands:
        for entry in config.get("vehicle_phrases", []):
            if entry.get("vehicle_type") == "goods_vehicle":
                return [entry]
        return []
    if brand in trailer_brands:
        for entry in config.get("vehicle_phrases", []):
            if entry.get("vehicle_type") == "trailer":
                return [entry]
    if brand in passenger_brands:
        for entry in config.get("vehicle_phrases", []):
            if entry.get("vehicle_type") == "passenger_vehicle":
                return [entry]
    return []


def _config_for_family(family_id: str, industrial_config: dict) -> dict | None:
    for entry in industrial_config.get("product_families", []):
        if entry.get("family") == family_id:
            return entry
    return None


def _collect_penalized_headings(families: list[str], industrial_config: dict) -> set[str]:
    penalized: set[str] = set()
    rules = industrial_config.get("penalize_headings_when_families", {})
    family_set = set(families)
    for heading, trigger_families in rules.items():
        if family_set.intersection(trigger_families):
            penalized.add(heading)
    return penalized


def extract_product_entities(product_description: str) -> ProductEntities:
    vehicle_config = _load_vehicle_config()
    industrial_config = _load_industrial_config()
    text = product_description.strip()

    vehicle_brands = _find_vehicle_brands(text, vehicle_config)
    industrial_brands = _find_industrial_brands(text, industrial_config)
    brands = tuple(dict.fromkeys([*vehicle_brands, *industrial_brands]))

    condition = _find_condition(text, vehicle_config)
    vehicle_entries = _find_vehicle_phrases(text, vehicle_config)
    family_entries = _find_product_families(text, industrial_config)
    series_entries = _find_manufacturer_series(text, industrial_config)
    for series in series_entries:
        family = series.get("family", "")
        if family and not any(e.get("family") == family for e in family_entries):
            family_entries.append(
                {
                    "family": family,
                    "chapters": [],
                    "headings": [],
                    "search_terms": series.get("search_terms", []),
                }
            )

    if vehicle_brands and not vehicle_entries:
        vehicle_entries = _brand_implies_vehicle(vehicle_brands[0], vehicle_entries)

    never_rank = {p.lower() for p in industrial_config.get("model_prefixes_never_rank", [])}
    vehicle_spans, vehicle_excluded = _extract_model_spans(
        text, patterns=VEHICLE_MODEL_PATTERNS, never_rank=never_rank
    )
    industrial_spans, industrial_excluded = _extract_model_spans(
        text, patterns=INDUSTRIAL_MODEL_PATTERNS, never_rank=never_rank
    )
    model_spans = tuple(dict.fromkeys([*vehicle_spans, *industrial_spans]))
    excluded = vehicle_excluded | industrial_excluded

    for brand in brands:
        for part in re.split(r"[\s+/&]+", brand.lower()):
            if len(part) >= 3 and not series_entries:
                excluded.add(part.replace("+", ""))

    is_vehicle = bool(vehicle_entries) or bool(
        vehicle_brands
        and vehicle_brands[0]
        in {
            "daf",
            "man",
            "volvo",
            "scania",
            "mercedes",
            "mercedes-benz",
            "iveco",
            "renault",
            "bmw",
            "schmitz",
            "krone",
        }
    )

    if is_vehicle:
        for token in re.findall(r"\b\d{3,4}\b", text):
            excluded.add(token)

    sensor_families = {
        "sensor",
        "temperature_sensor",
        "pressure_sensor",
        "proximity_sensor",
    }
    drive_families = {"frequency_inverter", "power_supply", "ups", "electric_motor"}
    families = [entry.get("family", "") for entry in family_entries]
    is_industrial_sensor = bool(families) and any(f in sensor_families for f in families)
    is_industrial_automation = "industrial_automation" in families or bool(
        series_entries
        and any(s.get("family") == "industrial_automation" for s in series_entries)
    )
    if any(f in drive_families for f in families):
        is_industrial_automation = True
    if industrial_brands and not is_industrial_sensor and not is_industrial_automation:
        lower = text.lower()
        if re.search(r"\b(sensor|senzor|transducer|transmitter|plc|automation)\b", lower):
            is_industrial_sensor = bool(re.search(r"\b(sensor|senzor)\b", lower))
            is_industrial_automation = bool(re.search(r"\b(plc|automation|controller)\b", lower))

    chapters: set[str] = set()
    headings: set[str] = set()
    search_terms: set[str] = set()
    vehicle_types: list[str] = []

    if is_vehicle:
        chapters.add(vehicle_config.get("chapter", "87"))
        for heading in vehicle_config.get("default_headings", []):
            headings.add(heading)

    for entry in vehicle_entries:
        vehicle_types.append(entry.get("vehicle_type", "vehicle"))
        for heading in entry.get("headings", []):
            headings.add(heading)
        for term in entry.get("search_terms", []):
            search_terms.add(term.lower())

    for entry in family_entries:
        for chapter in entry.get("chapters", []):
            chapters.add(str(chapter))
        for heading in entry.get("headings", []):
            headings.add(heading)
        for term in entry.get("search_terms", []):
            search_terms.add(term.lower())

    for family_id in dict.fromkeys(families):
        cfg = _config_for_family(family_id, industrial_config)
        if not cfg:
            continue
        for chapter in cfg.get("chapters", []):
            chapters.add(str(chapter))
        for heading in cfg.get("headings", []):
            headings.add(heading)
        for term in cfg.get("search_terms", []):
            search_terms.add(term.lower())

    for series in series_entries:
        for term in series.get("search_terms", []):
            search_terms.add(term.lower())
        enrichment = series.get("enrichment", "")
        if enrichment:
            for term in re.findall(r"[a-z0-9]+", enrichment.lower()):
                if len(term) >= 4:
                    search_terms.add(term)

    penalized = _collect_penalized_headings(families, industrial_config)

    enrichments = [
        series.get("enrichment", "")
        for series in series_entries
        if series.get("enrichment")
    ]
    search_enrichment = " ".join(dict.fromkeys(enrichments))

    return ProductEntities(
        brands=tuple(brands),
        vehicle_types=tuple(dict.fromkeys(vehicle_types)),
        product_families=tuple(dict.fromkeys(families)),
        condition=condition,
        excluded_tokens=frozenset(excluded),
        model_spans=model_spans,
        is_vehicle=is_vehicle,
        is_industrial_sensor=is_industrial_sensor,
        is_industrial_automation=is_industrial_automation,
        chapter_hints=frozenset(chapters),
        heading_hints=frozenset(headings),
        search_terms=tuple(search_terms),
        search_enrichment=search_enrichment,
        penalized_headings=frozenset(penalized),
    )


def sanitize_description_for_tokenize(text: str, entities: ProductEntities) -> str:
    cleaned = text
    for span in entities.model_spans:
        cleaned = re.sub(re.escape(span), " ", cleaned, flags=re.IGNORECASE)
    for brand in entities.brands:
        cleaned = re.sub(rf"\b{re.escape(brand)}\b", " ", cleaned, flags=re.IGNORECASE)
        if "+" in brand:
            cleaned = re.sub(
                brand.replace("+", r"\s*\+\s*"),
                " ",
                cleaned,
                flags=re.IGNORECASE,
            )
    return cleaned
