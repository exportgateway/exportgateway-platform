#!/usr/bin/env python3
"""Benchmark classifier with and without AES historical validation."""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.services.classification_pipeline import run_classification_pipeline
from app.services.historical_database import DEFAULT_DB_PATH, database_available, sample_records
from app.services.historical_validation import summarize_validation
from scripts.import_aes_historical import import_aes_historical

REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "historical_validation_benchmark.json"


@dataclass
class BenchmarkCaseResult:
    description: str
    expected_cn: str
    without_heading: str | None
    with_heading: str | None
    without_cn: str | None
    with_cn: str | None
    improved: bool
    validation_applied: bool


@dataclass
class BenchmarkReport:
    generated_at: str
    sample_size: int
    database_records: int
    without_validation_accuracy: float
    with_validation_accuracy: float
    improvement: float
    validation_applied_count: int
    improved_count: int
    regressed_count: int
    results: list[BenchmarkCaseResult]


def _heading(cn_code: str | None) -> str | None:
    if not cn_code:
        return None
    digits = "".join(ch for ch in cn_code if ch.isdigit())
    return digits[:4] if len(digits) >= 4 else None


def _cn8(cn_code: str | None) -> str | None:
    if not cn_code:
        return None
    digits = "".join(ch for ch in cn_code if ch.isdigit())
    return digits[:8] if len(digits) >= 8 else None


def _top_cn(suggestions) -> str | None:
    return suggestions[0].cn_code if suggestions else None


def run_benchmark(*, sample_size: int = 1000, seed: int = 49) -> BenchmarkReport:
    if not database_available(DEFAULT_DB_PATH):
        import_aes_historical(rebuild=True)

    records = sample_records(limit=sample_size, seed=seed)
    if not records:
        raise RuntimeError("No AES historical records available for benchmark.")

    improved = 0
    regressed = 0
    validation_applied = 0
    without_hits = 0
    with_hits = 0
    case_results: list[BenchmarkCaseResult] = []

    for record in records:
        without = run_classification_pipeline(
            record.item_description,
            historical_validation_enabled=False,
        )
        with_validation = run_classification_pipeline(
            record.item_description,
            historical_validation_enabled=True,
        )

        expected_heading = record.heading_code
        without_heading = _heading(_top_cn(without.suggestions))
        with_heading = _heading(_top_cn(with_validation.suggestions))
        without_cn = _cn8(_top_cn(without.suggestions))
        with_cn = _cn8(_top_cn(with_validation.suggestions))

        if without_heading == expected_heading:
            without_hits += 1
        if with_heading == expected_heading:
            with_hits += 1

        applied = bool(
            with_validation.historical_validation
            and with_validation.historical_validation.validation_applied
        )
        if applied:
            validation_applied += 1

        case_improved = (
            with_heading == expected_heading and without_heading != expected_heading
        )
        case_regressed = (
            without_heading == expected_heading and with_heading != expected_heading
        )
        if case_improved:
            improved += 1
        if case_regressed:
            regressed += 1

        case_results.append(
            BenchmarkCaseResult(
                description=record.item_description[:120],
                expected_cn=record.cn_code,
                without_heading=without_heading,
                with_heading=with_heading,
                without_cn=without_cn,
                with_cn=with_cn,
                improved=case_improved,
                validation_applied=applied,
            )
        )

    total = len(records)
    without_accuracy = without_hits / total
    with_accuracy = with_hits / total

    return BenchmarkReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        sample_size=total,
        database_records=total,
        without_validation_accuracy=round(without_accuracy, 4),
        with_validation_accuracy=round(with_accuracy, 4),
        improvement=round(with_accuracy - without_accuracy, 4),
        validation_applied_count=validation_applied,
        improved_count=improved,
        regressed_count=regressed,
        results=case_results[:25],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run historical validation benchmark.")
    parser.add_argument("--sample-size", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=49)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    report = run_benchmark(sample_size=args.sample_size, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(asdict(report), handle, indent=2)

    print(f"Benchmark written: {args.output}")
    print(f"Sample size: {report.sample_size}")
    print(f"Without validation: {report.without_validation_accuracy:.2%}")
    print(f"With validation:    {report.with_validation_accuracy:.2%}")
    print(f"Improvement:        {report.improvement:+.2%}")
    print(f"Validation applied: {report.validation_applied_count}")
    print(f"Improved: {report.improved_count}  Regressed: {report.regressed_count}")


if __name__ == "__main__":
    main()
