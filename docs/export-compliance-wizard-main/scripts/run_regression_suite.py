#!/usr/bin/env python3
"""Run classification regression suite and write reports/regression_report.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.regression_suite import (  # noqa: E402
    REPORT_PATH,
    RegressionSettings,
    run_regression_suite,
    write_regression_report,
)


def main() -> int:
    report = run_regression_suite(settings=RegressionSettings())
    path = write_regression_report(report)
    summary = report["summary"]
    print(f"Report written: {path}")
    print(f"Overall accuracy: {summary['overall_accuracy_pct']}% ({summary['passed']}/{summary['total_cases']})")
    print("Accuracy by category:")
    for category, stats in sorted(summary["accuracy_by_category"].items()):
        print(f"  {category:20} {stats['accuracy_pct']:6.1f}%  ({stats['passed']}/{stats['total']})")
    if summary.get("root_cause_counts"):
        print("Root cause counts:")
        for cause, count in sorted(summary["root_cause_counts"].items(), key=lambda x: -x[1]):
            print(f"  {cause}: {count}")
    print("Top failures:")
    for item in report["top_failures"][:20]:
        print(
            f"  [{item['category']}] {item['input'][:50]!r} "
            f"expected={item['expected_heading']} actual={item['actual_heading']} "
            f"cause={item['root_cause']}"
        )
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
