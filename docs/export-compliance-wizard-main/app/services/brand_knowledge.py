"""Historical brand knowledge — capped ranking signal from AES declarations."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

BRAND_MAP_PATH = Path(__file__).resolve().parent.parent / "data" / "historical_brand_map.json"
MAX_BRAND_SCORE_INFLUENCE = 0.10

KNOWN_BRANDS = (
    "sika",
    "sikaflex",
    "loctite",
    "bosch",
    "makita",
    "hilti",
    "wurth",
    "würth",
    "henkel",
    "festool",
    "dewalt",
    "metabo",
)


@dataclass(frozen=True)
class BrandKnowledgeMatch:
    brand: str
    cn_digits: str
    cn_code: str
    heading_code: str
    frequency: int
    confidence: float


@dataclass(frozen=True)
class BrandKnowledgeContext:
    matches: tuple[BrandKnowledgeMatch, ...]

    @property
    def detected_brands(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(match.brand for match in self.matches))


@lru_cache(maxsize=1)
def _load_brand_map() -> dict:
    if not BRAND_MAP_PATH.is_file():
        return {"brands": []}
    with BRAND_MAP_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def detect_brands_in_text(text: str) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for brand in KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", lower):
            canonical = "wurth" if brand == "würth" else brand
            if canonical not in found:
                found.append(canonical)
    return found


def build_brand_knowledge_context(text: str) -> BrandKnowledgeContext:
    config = _load_brand_map()
    detected = detect_brands_in_text(text)
    if not detected:
        return BrandKnowledgeContext(matches=())

    entries_by_brand: dict[str, list[dict]] = {}
    for entry in config.get("brands", []):
        brand_key = str(entry.get("brand", "")).lower()
        entries_by_brand.setdefault(brand_key, []).append(entry)

    matches: list[BrandKnowledgeMatch] = []
    for brand in detected:
        for entry in entries_by_brand.get(brand, []):
            freq = int(entry.get("frequency", 0))
            if freq <= 0:
                continue
            cn_code = str(entry.get("cn8", ""))
            digits = re.sub(r"\D", "", cn_code)[:8]
            if len(digits) < 8:
                continue
            confidence = min(0.99, 0.55 + 0.45 * min(1.0, freq / 20.0))
            matches.append(
                BrandKnowledgeMatch(
                    brand=brand,
                    cn_digits=digits,
                    cn_code=cn_code,
                    heading_code=digits[:4],
                    frequency=freq,
                    confidence=round(confidence, 4),
                )
            )
    matches.sort(key=lambda item: (item.frequency, item.confidence), reverse=True)
    return BrandKnowledgeContext(matches=tuple(matches))


def brand_bonus_for_candidate(
    base_score: float,
    *,
    cn_digits: str,
    brand_context: BrandKnowledgeContext | None,
) -> tuple[float, BrandKnowledgeMatch | None]:
    if not brand_context or base_score <= 0:
        return 0.0, None
    target = cn_digits[:8]
    for match in brand_context.matches:
        if match.cn_digits == target:
            bonus = base_score * MAX_BRAND_SCORE_INFLUENCE * match.confidence
            return bonus, match
    return 0.0, None
