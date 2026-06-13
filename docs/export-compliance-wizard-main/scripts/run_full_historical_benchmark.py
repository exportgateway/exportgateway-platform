#!/usr/bin/env python3
"""Benchmark AES knowledge modes: seed vs exports vs full (exports+imports)."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from app.services.aes_knowledge_engine import build_aes_knowledge_context
from app.services.aes_mode import EXPORTS_DB_PATH, IMPORTS_DB_PATH, SEED_DB_PATH
from app.services.brand_knowledge import detect_brands_in_text
from app.services.historical_database import database_available as seed_available
from app.services.aes_dataset_database import database_available as dataset_available
from app.services.historical_search_service import search_historical_classifications
from app.services.lexicon_service import _load_industrial_lexicon, tokenize_for_search
from app.services.unified_historical_search import (
    _aggregate_weighted_rows,
    _search_dataset_rows,
    _search_seed_rows,
)

REGRESSION_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "data" / "regression_suite_v1.json"
)
REPORT_PATH = (
    Path(__file__).resolve().parent.parent / "reports" / "full_historical_comparison.json"
)


def _search_for_mode(query: str, mode: str, *, limit: int = 5):
    if mode == "seed":
        if not seed_available(SEED_DB_PATH):
            return None
        rows = _search_seed_rows(query, limit)
        return _aggregate_weighted_rows(rows, limit=limit, country_code="SI")
    rows = []
    if mode in {"exports", "full"} and dataset_available(EXPORTS_DB_PATH):
        rows.extend(_search_dataset_rows(query, limit, EXPORTS_DB_PATH, source="export"))
    if mode == "full" and dataset_available(IMPORTS_DB_PATH):
        rows.extend(_search_dataset_rows(query, limit, IMPORTS_DB_PATH, source="import"))
    if not rows:
        return None
    return _aggregate_weighted_rows(tuple(rows), limit=limit, country_code="SI")


def _lexicon_hits(query: str) -> int:
    payload = _load_industrial_lexicon()
    tokens = set(tokenize_for_search(query))
    hits = 0
    for entry in payload.get("entries", []):
        phrase_tokens = set(tokenize_for_search(entry.get("normalized_phrase", "")))
        if phrase_tokens & tokens:
            hits += 1
    return hits


def _evaluate_mode(cases: list[dict], mode: str) -> dict:
    heading_hits = 0
    cn8_hits = 0
    recall_hits = 0
    injection_hits = 0
    lexicon_cases = 0
    brand_cases = 0
    evaluated = 0

    for case in cases:
        query = str(case.get("input", "")).strip()
        expected_heading = str(case.get("expected_heading", "")).strip()
        acceptable = {expected_heading, *(case.get("acceptable_headings") or [])}
        if not query or not expected_heading:
            continue

        result = _search_for_mode(query, mode)
        evaluated += 1
        if not result or not result.matches:
            continue

        recall_hits += 1
        top = result.matches[0]
        if top.heading_code in acceptable:
            heading_hits += 1
        if top.cn_digits[:4] in acceptable:
            cn8_hits += 1

        knowledge = build_aes_knowledge_context(
            query,
            enabled=True,
            search_result=result,
        )
        if knowledge.injected_cn8:
            injection_hits += 1

        if _lexicon_hits(query) > 0:
            lexicon_cases += 1
        if detect_brands_in_text(query):
            brand_cases += 1

    denominator = evaluated or 1
    return {
        "mode": mode,
        "cases_evaluated": evaluated,
        "heading_accuracy": round(heading_hits / denominator, 4),
        "cn8_accuracy": round(cn8_hits / denominator, 4),
        "candidate_recall": round(recall_hits / denominator, 4),
        "aes_injection_rate": round(injection_hits / denominator, 4),
        "lexicon_coverage": round(lexicon_cases / denominator, 4),
        "brand_coverage": round(brand_cases / denominator, 4),
        "databases": {
            "seed": seed_available(SEED_DB_PATH),
            "exports": dataset_available(EXPORTS_DB_PATH),
            "imports": dataset_available(IMPORTS_DB_PATH),
        },
    }


def run_benchmark(*, output_path: Path | None = None) -> dict:
    with REGRESSION_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    cases = payload.get("cases", [])

    comparison = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "regression_cases": len(cases),
        "modes": {
            "seed": _evaluate_mode(cases, "seed"),
            "exports_only": _evaluate_mode(cases, "exports"),
            "full_exports_imports": _evaluate_mode(cases, "full"),
        },
    }

    path = output_path or REPORT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(comparison, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    comparison["report_path"] = str(path)
    return comparison


def main() -> int:
    parser = argparse.ArgumentParser(description="Run full historical knowledge benchmark.")
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()
    result = run_benchmark(output_path=args.output)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
