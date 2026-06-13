"""Run Phase A golden benchmark and print report."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.golden_benchmark import run_golden_benchmark  # noqa: E402


def main() -> int:
    report = run_golden_benchmark()
    print(f"Golden benchmark v1: {report.passed}/{report.total} passed ({report.pass_rate:.0%})")
    print(f"Forbidden chapter violations: {report.forbidden_violations}")
    print()
    for item in report.results:
        status = "PASS" if item.passed else "FAIL"
        print(f"  [{status}] {item.case_id}: {item.top_cn or '—'} ({item.reason}) state={item.state}")
    return 0 if report.forbidden_violations == 0 and report.pass_rate >= 0.6 else 1


if __name__ == "__main__":
    raise SystemExit(main())
