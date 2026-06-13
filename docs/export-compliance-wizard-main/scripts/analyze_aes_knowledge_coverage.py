#!/usr/bin/env python3
"""Analyze AES Knowledge Engine coverage over benchmark records."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.services.aes_knowledge_engine import (
    build_aes_knowledge_context,
    diagnose_knowledge_pipeline,
)
from app.services.classification_pipeline import run_classification_pipeline
from app.services.cn_database import search_nomenclature
from app.services.historical_database import DEFAULT_DB_PATH, database_available, sample_records
from app.services.historical_search_service import search_historical_classifications
from app.services.historical_validation import build_validation_context
from app.services.taxonomy_service import detect_families
from scripts.import_aes_historical import import_aes_historical

REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "aes_knowledge_coverage.json"

SKIP_INJECTED = "injected"
SKIP_NO_FTS = "no_fts_match"
SKIP_DECLARATION = "declaration_count_below_threshold"
SKIP_CONFIDENCE = "confidence_below_threshold"
SKIP_COUNTRY = "country_mismatch"
SKIP_FAMILY = "family_mismatch"
SKIP_TAXONOMY = "taxonomy_filter_rejection"
SKIP_ALREADY_IN_POOL = "already_in_cn_pool"
SKIP_CN_SEARCH_EMPTY = "cn_search_empty"


@dataclass
class RecordCoverage:
    description: str
    expected_cn8: str
    historical_match_found: bool
    top_historical_confidence: float | None
    top_historical_declarations: int | None
    top_historical_country_match: float | None
    knowledge_candidate_count: int
    injected_count: int
    injection_skip_reason: str
    injection_skip_detail: str


def diagnose_record(description: str, expected_cn8: str) -> RecordCoverage:
    result = run_classification_pipeline(description, historical_validation_enabled=True)
    historical_query = result.understanding.english_description or description
    taxonomy_family_ids = tuple(m.family_id for m in detect_families(historical_query))
    search = result.historical_evidence or search_historical_classifications(historical_query)
    validation = build_validation_context(historical_query, search_result=search)
    knowledge = build_aes_knowledge_context(
        historical_query,
        search_result=search,
        family_ids=taxonomy_family_ids,
        penalized_headings=frozenset(result.cpr.penalized_headings),
    )

    search_metrics: dict = {}
    hits = search_nomenclature(
        result.classification_text,
        cpr=result.cpr,
        historical_validation=validation if validation.enabled else None,
        aes_knowledge=knowledge,
        search_metrics=search_metrics,
    )
    injected = search_metrics.get("historical_injected_count", 0)

    if injected > 0:
        return RecordCoverage(
            description=description[:120],
            expected_cn8=expected_cn8,
            historical_match_found=bool(search.matches),
            top_historical_confidence=search.matches[0].confidence if search.matches else None,
            top_historical_declarations=search.matches[0].match_count if search.matches else None,
            top_historical_country_match=search.matches[0].country_match if search.matches else None,
            knowledge_candidate_count=len(knowledge.candidates),
            injected_count=injected,
            injection_skip_reason=SKIP_INJECTED,
            injection_skip_detail=f"injected {injected} CN8 candidate(s)",
        )

    pre_existing = set(search_metrics.get("cn_pool_cn8", []))

    diagnosis = diagnose_knowledge_pipeline(
        search,
        family_ids=taxonomy_family_ids,
        penalized_headings=frozenset(result.cpr.penalized_headings),
        pre_existing_cn8=pre_existing,
    )

    reason = diagnosis["skip_reason"]
    detail = diagnosis["skip_detail"]
    if not hits and reason == "eligible_for_injection":
        reason = SKIP_CN_SEARCH_EMPTY
        detail = "CN nomenclature search returned no candidate pool"
    elif reason == "eligible_for_injection":
        reason = SKIP_ALREADY_IN_POOL
        detail = "qualified candidates present but CN pool already contained all CN8"

    if reason == "already_in_cn_pool":
        reason = SKIP_ALREADY_IN_POOL

    return RecordCoverage(
        description=description[:120],
        expected_cn8=expected_cn8,
        historical_match_found=diagnosis["historical_match_found"],
        top_historical_confidence=diagnosis["top_historical_confidence"],
        top_historical_declarations=diagnosis["top_historical_declarations"],
        top_historical_country_match=diagnosis["top_historical_country_match"],
        knowledge_candidate_count=len(knowledge.candidates),
        injected_count=0,
        injection_skip_reason=reason,
        injection_skip_detail=detail,
    )


def analyze_coverage(*, sample_size: int = 1000, seed: int = 49) -> dict:
    if not database_available(DEFAULT_DB_PATH):
        import_aes_historical(rebuild=True)

    records = sample_records(limit=sample_size, seed=seed)
    cases = [diagnose_record(r.item_description, r.cn_digits[:8]) for r in records]

    total = len(cases)
    reason_counts = Counter(case.injection_skip_reason for case in cases)
    historical_found = sum(1 for case in cases if case.historical_match_found)

    confidence_buckets: Counter[str] = Counter()
    for case in cases:
        if case.top_historical_confidence is None:
            confidence_buckets["no_match"] += 1
        elif case.top_historical_confidence < 0.35:
            confidence_buckets["0.00-0.34"] += 1
        elif case.top_historical_confidence < 0.55:
            confidence_buckets["0.35-0.54"] += 1
        elif case.top_historical_confidence < 0.75:
            confidence_buckets["0.55-0.74"] += 1
        else:
            confidence_buckets["0.75+"] += 1

    ordered_reasons = [
        SKIP_INJECTED,
        SKIP_NO_FTS,
        SKIP_DECLARATION,
        SKIP_CONFIDENCE,
        SKIP_COUNTRY,
        SKIP_FAMILY,
        SKIP_TAXONOMY,
        SKIP_ALREADY_IN_POOL,
        SKIP_CN_SEARCH_EMPTY,
    ]

    matched_not_injected = sum(
        1
        for case in cases
        if case.historical_match_found and case.injection_skip_reason != SKIP_INJECTED
    )
    matched_total = historical_found or 1

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sample_size": total,
        "historical_match_found_pct": round(historical_found / total * 100, 2),
        "injection_rate_pct": round(reason_counts.get(SKIP_INJECTED, 0) / total * 100, 2),
        "when_historical_match_found": {
            "count": historical_found,
            "injected_pct": round(reason_counts.get(SKIP_INJECTED, 0) / matched_total * 100, 2),
            "skipped_pct": round(matched_not_injected / matched_total * 100, 2),
            "skip_breakdown_pct": {
                reason: round(
                    sum(
                        1
                        for case in cases
                        if case.historical_match_found and case.injection_skip_reason == reason
                    )
                    / matched_total
                    * 100,
                    2,
                )
                for reason in ordered_reasons
                if reason != SKIP_INJECTED
            },
        },
        "confidence_distribution_pct": {
            bucket: round(count / total * 100, 2)
            for bucket, count in sorted(confidence_buckets.items())
        },
        "injection_skip_reasons": {
            reason: {
                "count": reason_counts.get(reason, 0),
                "pct": round(reason_counts.get(reason, 0) / total * 100, 2),
            }
            for reason in ordered_reasons
        },
        "examples_by_reason": {
            reason: [
                {
                    "description": case.description,
                    "detail": case.injection_skip_detail,
                    "top_confidence": case.top_historical_confidence,
                    "declarations": case.top_historical_declarations,
                }
                for case in cases
                if case.injection_skip_reason == reason
            ][:5]
            for reason in ordered_reasons
        },
        "records_sample": [asdict(case) for case in cases[:100]],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze AES Knowledge Engine coverage.")
    parser.add_argument("--sample-size", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=49)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    report = analyze_coverage(sample_size=args.sample_size, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")

    print(f"Report written: {args.output}")
    print(f"Sample size: {report['sample_size']}")
    print(f"Historical match found: {report['historical_match_found_pct']}%")
    print(f"Injection rate: {report['injection_rate_pct']}%")
    print("\nTop historical confidence distribution:")
    for bucket, pct in report["confidence_distribution_pct"].items():
        print(f"  {bucket:12} {pct:6.2f}%")
    print("\nInjection outcome / skip reasons:")
    for reason, stats in report["injection_skip_reasons"].items():
        if stats["count"]:
            print(f"  {reason:40} {stats['count']:5}  {stats['pct']:6.2f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
