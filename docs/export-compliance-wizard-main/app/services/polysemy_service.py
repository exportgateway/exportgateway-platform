"""Context-aware polysemy resolution before taxonomy / CN retrieval (Phase A.2)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

RULES_PATH = Path(__file__).resolve().parent.parent / "data" / "cn_polysemy_rules.json"


@dataclass(frozen=True)
class PolysemyResult:
    enriched_text: str
    family_ids: tuple[str, ...]
    excluded_chapters: frozenset[str]
    penalized_headings: frozenset[str]
    matched_rule_ids: tuple[str, ...]


@lru_cache(maxsize=1)
def _load_rules() -> list[dict]:
    if not RULES_PATH.is_file():
        return []
    with RULES_PATH.open(encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("rules", [])


def _token_present(text: str, term: str) -> bool:
    term = term.lower().strip()
    if not term:
        return False
    if " " in term:
        return term in text
    return bool(re.search(rf"\b{re.escape(term)}\b", text))


def apply_polysemy_context(text: str) -> PolysemyResult:
    lower = text.lower()
    families: list[str] = []
    excluded: set[str] = set()
    penalized: set[str] = set()
    matched: list[str] = []
    enrichments: list[str] = []

    for rule in _load_rules():
        rule_id = rule.get("id", "")
        required = rule.get("required_terms", [])
        if required and not all(_token_present(lower, t) for t in required):
            continue

        any_of = rule.get("any_of_terms", [])
        if any_of and not any(_token_present(lower, t) for t in any_of):
            continue

        context = rule.get("context_terms", [])
        if context and not any(_token_present(lower, t) for t in context):
            continue

        anti = rule.get("anti_terms", [])
        if anti and any(_token_present(lower, t) for t in anti):
            continue

        blocked = False
        for term, blockers in (rule.get("anti_context") or {}).items():
            if not _token_present(lower, term):
                continue
            if any(_token_present(lower, b) for b in blockers):
                blocked = True
                break
        if blocked:
            continue

        matched.append(rule_id)
        for fid in rule.get("families", []):
            if fid not in families:
                families.append(fid)
        excluded.update(str(c) for c in rule.get("excluded_chapters", []))
        penalized.update(str(h) for h in rule.get("penalized_headings", []))
        enrichments.extend(rule.get("enrichment_phrases", []))

    enriched = text
    if enrichments:
        extra = " ".join(dict.fromkeys(enrichments))
        if extra.lower() not in lower:
            enriched = f"{text} {extra}".strip()

    return PolysemyResult(
        enriched_text=enriched,
        family_ids=tuple(families),
        excluded_chapters=frozenset(excluded),
        penalized_headings=frozenset(penalized),
        matched_rule_ids=tuple(matched),
    )
