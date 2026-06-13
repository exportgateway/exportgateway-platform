"""Build customer-facing CN hierarchy text from nomenclature records (presentation only)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from app.models.schemas import CnHierarchyLevel, CnSuggestion
from app.services.cn_database import CnRecord, cn_digits, lookup_by_digits

_MATERIAL_SEGMENT = re.compile(
    r"^(of\s+)?("
    r"cotton|wool|synthetic|artificial|other|man-made|polyester|silk|linen|nylon|"
    r"acrylic|elastomeric|paper|plastic|leather|wood|metal|pure|mixtures|accessories"
    r")(\s|,|$)",
    re.IGNORECASE,
)

_GENERIC_SHORT = frozenset(
    {
        "other",
        "suits",
        "ensembles",
        "jackets and blazers",
        "dresses",
        "skirts and divided skirts",
        "trousers and breeches",
        "bib and brace overalls",
        "jackets",
        "blazers",
    }
)

# Official EU chapter titles (presentation); DB paths rarely include chapter row text.
_CHAPTER_TITLES: dict[str, str] = {
    "01": "Live animals",
    "02": "Meat and edible meat offal",
    "03": "Fish and crustaceans, molluscs and other aquatic invertebrates",
    "04": "Dairy produce; birds' eggs; natural honey; edible products of animal origin, not elsewhere specified or included",
    "30": "Pharmaceutical products",
    "48": "Paper and paperboard; articles of paper pulp, of paper or of paperboard",
    "61": "Articles of apparel and clothing accessories, knitted or crocheted",
    "62": "Articles of apparel and clothing accessories, not knitted or crocheted",
    "84": "Nuclear reactors, boilers, machinery and mechanical appliances; parts thereof",
    "85": "Electrical machinery and equipment and parts thereof; sound recorders and reproducers, television image and sound recorders and reproducers, and parts and accessories of such articles",
    "87": "Vehicles other than railway or tramway rolling stock, and parts and accessories thereof",
    "90": "Optical, photographic, cinematographic, measuring, checking, precision, medical or surgical instruments and apparatus; parts and accessories thereof",
    "96": "Miscellaneous manufactured articles",
}


@dataclass(frozen=True)
class HierarchyDisplay:
    chapter_code: str
    chapter_title: str
    heading_code: str
    heading_title: str
    combined_description: str
    hierarchy_levels: tuple[CnHierarchyLevel, ...]

    def to_suggestion_fields(self) -> dict:
        return {
            "chapter_code": self.chapter_code,
            "chapter_title": self.chapter_title,
            "heading_code": self.heading_code,
            "heading_title": self.heading_title,
            "combined_description": self.combined_description,
            "hierarchy_levels": list(self.hierarchy_levels),
        }


def _is_material_segment(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if _MATERIAL_SEGMENT.match(stripped):
        return True
    return stripped.lower() in _GENERIC_SHORT and len(stripped) < 28


# Prefer / avoid path segments when CPR product family is known (A.2.1 display fix).
_FAMILY_PATH_PREFER: dict[str, tuple[str, ...]] = {
    "frequency_inverter": (
        "inverter",
        "static converter",
        "rectifier",
        "converter",
        "accumulator charger",
        "transformer",
    ),
    "ups": ("uninterruptible", "static converter", "converter", "power supply"),
    "power_supply": ("power supply", "static converter", "converter"),
    "stationery_marker": (
        "marker",
        "pen",
        "felt-tipped",
        "ball-point",
        "ballpoint",
        "writing",
    ),
    "proximity_sensor": ("proximity", "inductive", "sensor"),
    "pressure_sensor": ("pressure", "gauge", "transducer", "measuring"),
    "electronics_monitor": ("monitor", "display", "lcd"),
    "industrial_hmi": ("control", "panel", "programmable", "touch"),
    "electric_motor": ("motor", "synchronous", "universal", "dc", "ac", "generator"),
    "furniture_office_chair": ("seat", "chair", "furniture"),
    "stationery_pen": ("ballpoint", "ball-point", "pen", "writing", "liquid ink"),
    "office_printer_consumable": ("ink", "cartridge", "toner", "printing ink"),
}

_FAMILY_PATH_AVOID: dict[str, tuple[str, ...]] = {
    "frequency_inverter": (
        "diesel",
        "semi-diesel",
        "compression-ignition",
        "generating set",
        "piston engine",
        "spark-ignition",
    ),
    "ups": ("reader", "recording", "reproducing", "still image", "audio file"),
    "stationery_marker": (
        "ribbon",
        "typewriter",
        "permanently put",
        "automatic typewriters",
        "data-processing equipment and other machines",
    ),
    "proximity_sensor": (
        "regulating or controlling",
        "automatic regulating",
    ),
    "electronics_monitor": ("patient", "medical", "clinical"),
    "electric_motor": (
        "vehicle",
        "propulsion",
        "transport",
        "compression-ignition",
        "diesel",
    ),
    "furniture_office_chair": ("dentist", "dental", "barber", "medical", "surgical"),
    "stationery_pen": ("refill", "refills for ballpoint", "ink-reservoir"),
    "office_printer_consumable": ("printing machinery", "printing press", "offset printing"),
}


def _heading_title_from_path(
    hierarchy_path: str,
    product_families: tuple[str, ...] = (),
) -> str:
    """Heading text from this CN row's path only (not global heading pool)."""
    parts = [part.strip() for part in hierarchy_path.split(">") if part.strip()]
    if not parts:
        return ""

    prefer: list[str] = []
    avoid: list[str] = []
    for fam in product_families:
        prefer.extend(_FAMILY_PATH_PREFER.get(fam, ()))
        avoid.extend(_FAMILY_PATH_AVOID.get(fam, ()))

    scored: list[tuple[int, str]] = []
    for part in parts:
        if _is_material_segment(part) and part != parts[-1]:
            continue
        lower = part.lower()
        if avoid and any(token in lower for token in avoid):
            continue
        score = len(part)
        if prefer and any(token in lower for token in prefer):
            score += 800
        if len(part) >= 18:
            scored.append((score, part))

    if scored:
        return max(scored, key=lambda item: item[0])[1]

    return _best_heading_segment(hierarchy_path)


def _best_heading_segment(hierarchy_path: str) -> str:
    parts = [part.strip() for part in hierarchy_path.split(">") if part.strip()]
    if not parts:
        return ""

    candidates = [
        part
        for part in parts
        if not _is_material_segment(part)
        and (len(part) >= 40 or ("(" in part and len(part) >= 24))
    ]
    if not candidates:
        candidates = [
            part
            for part in parts
            if not _is_material_segment(part) and len(part) >= 22
        ]
    if candidates:
        return max(candidates, key=len)
    return parts[0]


@lru_cache(maxsize=512)
def _heading_title_from_db(chapter_code: str, heading_prefix: str) -> str:
    from app.services.cn_database import DEFAULT_DB_PATH, _connect

    path = DEFAULT_DB_PATH
    if not path.is_file():
        return ""
    prefix = heading_prefix[:4]
    with _connect(path) as conn:
        rows = conn.execute(
            """
            SELECT hierarchy_path FROM cn_codes
            WHERE chapter_code = ? AND heading_code LIKE ?
            ORDER BY LENGTH(hierarchy_path) DESC
            LIMIT 24
            """,
            (chapter_code, f"{prefix}%"),
        ).fetchall()
    best = ""
    for row in rows:
        segment = _best_heading_segment(row["hierarchy_path"])
        if len(segment) > len(best):
            best = segment
    return best


def chapter_title_for_code(chapter_code: str) -> str:
    code = str(chapter_code or "").zfill(2)[:2]
    return _CHAPTER_TITLES.get(code, f"Chapter {code}")


def heading_title_for_code(
    chapter_code: str,
    heading_code: str,
    *,
    hierarchy_path: str = "",
    product_families: tuple[str, ...] = (),
) -> str:
    if hierarchy_path and product_families:
        path_title = _heading_title_from_path(hierarchy_path, product_families)
        if path_title:
            return path_title
    if hierarchy_path:
        path_title = _heading_title_from_path(hierarchy_path, ())
        if path_title:
            return path_title

    prefix = str(heading_code or "")[:4]
    if not prefix:
        return ""
    if product_families:
        return f"Heading {prefix}"
    cached = _heading_title_from_db(chapter_code, prefix)
    if cached:
        return cached
    return f"Heading {prefix}"


def build_combined_description(heading_title: str, cn8_description: str, hierarchy_path: str) -> str:
    base = (heading_title or "").strip()
    if not base:
        parts = [p.strip() for p in hierarchy_path.split(">") if p.strip()]
        base = _best_heading_segment(hierarchy_path) or (parts[-1] if parts else "")

    terminal = (cn8_description or "").strip()
    if not terminal:
        return base
    if _is_material_segment(terminal):
        suffix = terminal.lower() if terminal.lower().startswith("of ") else f"of {terminal.lower()}"
        if suffix.replace("of ", "") in base.lower():
            return base
        return f"{base}, {suffix}"
    if terminal.lower() in base.lower():
        return base
    return f"{base}: {terminal}"


def build_hierarchy_display(
    record: CnRecord,
    *,
    product_families: tuple[str, ...] = (),
) -> HierarchyDisplay:
    chapter_code = str(record.chapter_code or cn_digits(record.cn_code)[:2])
    heading_code = str(record.heading_code or cn_digits(record.cn_code)[:4])
    chapter_title = chapter_title_for_code(chapter_code)
    heading_title = heading_title_for_code(
        chapter_code,
        heading_code,
        hierarchy_path=record.hierarchy_path,
        product_families=product_families,
    )
    combined = build_combined_description(
        heading_title, record.description, record.hierarchy_path
    )
    combined_lower = combined.lower()
    for fam in product_families:
        for bad in _FAMILY_PATH_AVOID.get(fam, ()):
            if bad in combined_lower:
                safe_heading = _heading_title_from_path(
                    record.hierarchy_path, product_families
                )
                combined = build_combined_description(
                    safe_heading, record.description, record.hierarchy_path
                )
                break

    levels = (
        CnHierarchyLevel(
            level="chapter",
            code=chapter_code,
            description=chapter_title,
        ),
        CnHierarchyLevel(
            level="heading",
            code=heading_code[:4],
            description=heading_title,
        ),
        CnHierarchyLevel(
            level="cn8",
            code=record.cn_code,
            description=record.description,
        ),
    )

    path_parts = [p.strip() for p in record.hierarchy_path.split(">") if p.strip()]
    if path_parts:
        extra_levels = [
            CnHierarchyLevel(level="path", code="", description=part)
            for part in path_parts
            if part != record.description
        ]
        if extra_levels:
            levels = (*levels[:2], *extra_levels, levels[2])

    return HierarchyDisplay(
        chapter_code=chapter_code,
        chapter_title=chapter_title,
        heading_code=heading_code[:4],
        heading_title=heading_title,
        combined_description=combined,
        hierarchy_levels=levels,
    )


def enrich_cn_suggestion(
    *,
    cn_code: str,
    description: str,
    confidence_level: float,
    match_explanation: str,
    matched_keywords: list[str] | None = None,
    product_families: tuple[str, ...] | None = None,
) -> CnSuggestion:
    """Attach hierarchy presentation fields; does not alter classification scores."""
    digits = cn_digits(cn_code)
    record = lookup_by_digits(digits) if len(digits) >= 8 else None
    fields: dict = {}
    if record:
        fields = build_hierarchy_display(
            record,
            product_families=tuple(product_families or ()),
        ).to_suggestion_fields()
    return CnSuggestion(
        cn_code=cn_code,
        description=description,
        confidence_level=confidence_level,
        match_explanation=match_explanation,
        matched_keywords=matched_keywords or [],
        **fields,
    )
