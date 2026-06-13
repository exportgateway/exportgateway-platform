#!/usr/bin/env python3
"""Validate AES Knowledge Engine v1 — regression + AES benchmark before/after."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.services.classification_pipeline import run_classification_pipeline
from app.services.historical_database import DEFAULT_DB_PATH, database_available, sample_records
from app.services.regression_suite import RegressionSettings, run_regression_suite
from scripts.import_aes_historical import import_aes_historical

REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "aes_knowledge_validation.json"


@dataclass
class BenchmarkMetrics:
    sample_size: int
    heading_accuracy: float
    cn8_accuracy: float
    historical_candidate_usage_rate: float
    candidate_recall_when_injected: float
    improved_count: int
    regressed_count: int
    avg_injected_per_case: float
    avg_knowledge_candidates: float


def _cn8(code: str | None) -> str | None:
    if not code:
        return None
    digits = "".join(ch for ch in code if ch.isdigit())
    return digits[:8] if len(digits) >= 8 else None


def _heading(code: str | None) -> str | None:
    cn8 = _cn8(code)
    return cn8[:4] if cn8 else None


def _top_cn(suggestions) -> str | None:
    return suggestions[0].cn_code if suggestions else None


def _run_aes_benchmark(*, sample_size: int, seed: int, knowledge_enabled: bool) -> BenchmarkMetrics:
    if not database_available(DEFAULT_DB_PATH):
        import_aes_historical(rebuild=True)

    records = sample_records(limit=sample_size, seed=seed)
    heading_hits = 0
    cn8_hits = 0
    injected_total = 0
    knowledge_candidate_total = 0
    usage_cases = 0
    recall_hits = 0
    improved = 0
    regressed = 0

    for record in records:
        result = run_classification_pipeline(
            record.item_description,
            historical_validation_enabled=knowledge_enabled,
        )
        predicted = _top_cn(result.suggestions)
        pred_heading = _heading(predicted)
        pred_cn8 = _cn8(predicted)
        expected_heading = record.heading_code[:4]
        expected_cn8 = record.cn_digits[:8]

        if pred_heading == expected_heading:
            heading_hits += 1
        if pred_cn8 == expected_cn8:
            cn8_hits += 1

        injected = result.aes_knowledge.injected_count if result.aes_knowledge else 0
        candidate_count = result.aes_knowledge.candidate_count if result.aes_knowledge else 0
        injected_total += injected
        knowledge_candidate_total += candidate_count
        if injected > 0:
            usage_cases += 1
            if pred_cn8 == expected_cn8:
                recall_hits += 1

    n = max(len(records), 1)
    return BenchmarkMetrics(
        sample_size=len(records),
        heading_accuracy=round(heading_hits / n, 4),
        cn8_accuracy=round(cn8_hits / n, 4),
        historical_candidate_usage_rate=round(usage_cases / n, 4),
        candidate_recall_when_injected=round(recall_hits / max(usage_cases, 1), 4),
        improved_count=improved,
        regressed_count=regressed,
        avg_injected_per_case=round(injected_total / n, 4),
        avg_knowledge_candidates=round(knowledge_candidate_total / n, 4),
    )


def _compare_improvements(*, sample_size: int, seed: int) -> tuple[int, int]:
    if not database_available(DEFAULT_DB_PATH):
        import_aes_historical(rebuild=True)
    records = sample_records(limit=sample_size, seed=seed)
    improved = 0
    regressed = 0
    for record in records:
        without = run_classification_pipeline(
            record.item_description,
            historical_validation_enabled=False,
        )
        with_knowledge = run_classification_pipeline(
            record.item_description,
            historical_validation_enabled=True,
        )
        expected_heading = record.heading_code[:4]
        without_heading = _heading(_top_cn(without.suggestions))
        with_heading = _heading(_top_cn(with_knowledge.suggestions))
        if with_heading == expected_heading and without_heading != expected_heading:
            improved += 1
        if without_heading == expected_heading and with_heading != expected_heading:
            regressed += 1
    return improved, regressed


def run_validation(*, sample_size: int = 1000, seed: int = 49) -> dict:
    regression = run_regression_suite(settings=RegressionSettings())
    summary = regression["summary"]

    without_knowledge = _run_aes_benchmark(
        sample_size=sample_size,
        seed=seed,
        knowledge_enabled=False,
    )
    with_knowledge = _run_aes_benchmark(
        sample_size=sample_size,
        seed=seed,
        knowledge_enabled=True,
    )
    improved, regressed = _compare_improvements(sample_size=sample_size, seed=seed)

    with_dict = asdict(with_knowledge)
    with_dict["improved_count"] = improved
    with_dict["regressed_count"] = regressed
    without_dict = asdict(without_knowledge)

    delta = {
        "heading_accuracy": round(
            with_knowledge.heading_accuracy - without_knowledge.heading_accuracy,
            4,
        ),
        "cn8_accuracy": round(with_knowledge.cn8_accuracy - without_knowledge.cn8_accuracy, 4),
        "historical_candidate_usage_rate": round(
            with_knowledge.historical_candidate_usage_rate
            - without_knowledge.historical_candidate_usage_rate,
            4,
        ),
        "improved_count": improved,
        "regressed_count": regressed,
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "regression_passed": summary["passed"],
        "regression_total": summary["total_cases"],
        "regression_accuracy_pct": summary["overall_accuracy_pct"],
        "aes_sample_size": sample_size,
        "without_knowledge": without_dict,
        "with_knowledge": with_dict,
        "delta": delta,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run AES Knowledge Engine validation report.")
    parser.add_argument("--sample-size", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=49)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    report = run_validation(sample_size=args.sample_size, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")

    print(f"Report written: {args.output}")
    print(
        f"Regression: {report['regression_passed']}/{report['regression_total']} "
        f"({report['regression_accuracy_pct']}%)"
    )
    print(
        f"AES heading accuracy — without: {report['without_knowledge']['heading_accuracy']:.1%}, "
        f"with: {report['with_knowledge']['heading_accuracy']:.1%}, "
        f"delta: {report['delta']['heading_accuracy']:+.1%}"
    )
    print(
        f"AES CN8 accuracy — without: {report['without_knowledge']['cn8_accuracy']:.1%}, "
        f"with: {report['with_knowledge']['cn8_accuracy']:.1%}, "
        f"delta: {report['delta']['cn8_accuracy']:+.1%}"
    )
    print(
        f"Historical candidate usage rate (with knowledge): "
        f"{report['with_knowledge']['historical_candidate_usage_rate']:.1%}"
    )
    print(
        f"Improved: {report['delta']['improved_count']}  "
        f"Regressed: {report['delta']['regressed_count']}"
    )
    return 0 if report["regression_passed"] == report["regression_total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
