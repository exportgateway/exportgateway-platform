"""CPR v2 — commercial invoice / trade name / catalogue model recognition (Phase A.3)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "cn_commercial_products.json"


@dataclass(frozen=True)
class CommercialRecognition:
    product_ids: tuple[str, ...] = ()
    trade_names: tuple[str, ...] = ()
    brands: tuple[str, ...] = ()
    family_ids: tuple[str, ...] = ()
    excluded_tokens: frozenset[str] = field(default_factory=frozenset)
    model_spans: tuple[str, ...] = ()
    text_enrichment: str = ""
    search_terms: tuple[str, ...] = ()
    chapter_hints: frozenset[str] = field(default_factory=frozenset)
    heading_hints: frozenset[str] = field(default_factory=frozenset)
    penalized_headings: frozenset[str] = field(default_factory=frozenset)
    excluded_chapters: frozenset[str] = field(default_factory=frozenset)
    lexicon_concept_ids: tuple[str, ...] = ()


@lru_cache(maxsize=1)
def _load_config() -> dict:
    if not DATA_PATH.is_file():
        return {"trade_names": [], "invoice_phrases": [], "model_prefixes_never_rank": []}
    with DATA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def _has_context(text: str, terms: list[str]) -> bool:
    if not terms:
        return True
    lower = text.lower()
    return any(t.lower() in lower for t in terms)


def _compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    compiled: list[re.Pattern[str]] = []
    for raw in patterns:
        safe = raw.strip().lower()
        if not safe:
            continue
        compiled.append(re.compile(rf"\b{re.escape(safe)}\b", re.IGNORECASE))
    return compiled


def _find_model_spans(text: str, patterns: list[str], never_rank: set[str]) -> tuple[list[str], set[str]]:
    spans: list[str] = []
    excluded: set[str] = set()
    for pat in patterns:
        for match in re.finditer(rf"\b{re.escape(pat)}\b", text, re.IGNORECASE):
            span = match.group(0).strip()
            spans.append(span)
            for token in re.findall(r"[a-z0-9]+", span.lower()):
                if len(token) >= 3:
                    excluded.add(token)
    for prefix in never_rank:
        if re.search(rf"\b{re.escape(prefix)}\b", text, re.IGNORECASE):
            excluded.add(prefix.lower())
    return spans, excluded


def recognize_commercial_products(
    *,
    commercial_description: str,
    english_text: str,
) -> CommercialRecognition:
    """
    Match trade names, invoice phrases, and catalogue models on commercial + English text.
    """
    config = _load_config()
    never_rank = {p.lower() for p in config.get("model_prefixes_never_rank", [])}
    blob = f"{commercial_description} {english_text}"
    norm = _normalize(blob)

    product_ids: list[str] = []
    trade_hits: list[str] = []
    brands: list[str] = []
    families: list[str] = []
    enrichments: list[str] = []
    search_terms: set[str] = set()
    chapters: set[str] = set()
    headings: set[str] = set()
    penalized: set[str] = set()
    excluded_chapters: set[str] = set()
    model_spans: list[str] = []
    excluded_tokens: set[str] = set()

    for entry in config.get("trade_names", []):
        pid = entry.get("id", "")
        if not pid:
            continue
        matched = False
        for pattern in _compile_patterns(entry.get("patterns", [])):
            if pattern.search(blob):
                matched = True
                break
        if not matched:
            continue
        if not _has_context(blob, entry.get("context_terms", [])):
            continue
        product_ids.append(pid)
        trade_hits.append(pid)
        families.append(entry.get("family", ""))
        for brand in entry.get("brands", []):
            brands.append(brand)
        enrichment = entry.get("enrichment", "")
        if enrichment:
            enrichments.append(enrichment)
        for term in entry.get("search_terms", []):
            search_terms.add(term.lower())
        for ch in entry.get("chapters", []):
            chapters.add(str(ch))
        for h in entry.get("headings", []):
            headings.add(h)
        for h in entry.get("penalized_headings", []):
            penalized.add(h)
        spans, ex = _find_model_spans(blob, entry.get("model_patterns", []), never_rank)
        model_spans.extend(spans)
        excluded_tokens |= ex

    for entry in config.get("invoice_phrases", []):
        pid = entry.get("id", "")
        matched = False
        for pattern in _compile_patterns(entry.get("patterns", [])):
            if pattern.search(norm) or pattern.search(blob):
                matched = True
                break
        if not matched:
            continue
        if not _has_context(blob, entry.get("context_terms", [])):
            continue
        product_ids.append(pid)
        families.append(entry.get("family", ""))
        enrichment = entry.get("enrichment", "")
        if enrichment:
            enrichments.append(enrichment)
        for term in entry.get("search_terms", []):
            search_terms.add(term.lower())
        for ch in entry.get("chapters", []):
            chapters.add(str(ch))
        for h in entry.get("headings", []):
            headings.add(h)
        for h in entry.get("penalized_headings", []):
            penalized.add(h)
        for ch in entry.get("excluded_chapters", []):
            excluded_chapters.add(str(ch))

    families_clean = tuple(dict.fromkeys(f for f in families if f))
    enrichment_text = " ".join(dict.fromkeys(enrichments))

    return CommercialRecognition(
        product_ids=tuple(dict.fromkeys(product_ids)),
        trade_names=tuple(dict.fromkeys(trade_hits)),
        brands=tuple(dict.fromkeys(brands)),
        family_ids=families_clean,
        excluded_tokens=frozenset(excluded_tokens),
        model_spans=tuple(dict.fromkeys(model_spans)),
        text_enrichment=enrichment_text,
        search_terms=tuple(search_terms),
        chapter_hints=frozenset(chapters),
        heading_hints=frozenset(headings),
        penalized_headings=frozenset(penalized),
        excluded_chapters=frozenset(excluded_chapters),
        lexicon_concept_ids=tuple(f"commercial:{pid}" for pid in product_ids),
    )
