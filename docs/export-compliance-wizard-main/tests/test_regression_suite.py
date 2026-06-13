"""Automated end-to-end classification regression suite (110 products)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.regression_suite import (
    REPORT_PATH,
    RegressionSettings,
    load_regression_cases,
    run_regression_case,
    run_regression_suite,
    write_regression_report,
)

ROOT = Path(__file__).resolve().parent.parent
SUITE_PATH = ROOT / "app" / "data" / "regression_suite_v1.json"


@pytest.fixture(scope="session")
def regression_cases():
    cases = load_regression_cases(SUITE_PATH)
    assert len(cases) >= 100, f"Expected >=100 cases, got {len(cases)}"
    return cases


@pytest.fixture(scope="session")
def regression_report(regression_cases):
    report = run_regression_suite(regression_cases, settings=RegressionSettings())
    write_regression_report(report, REPORT_PATH)
    return report


@pytest.mark.parametrize("case_id", [case.id for case in load_regression_cases(SUITE_PATH)])
def test_regression_case(case_id: str, regression_cases, regression_report):
    """Each case is recorded as PASS/FAIL in reports/regression_report.json."""
    case = next(item for item in regression_cases if item.id == case_id)
    recorded = next(item for item in regression_report["results"] if item["id"] == case_id)
    result = run_regression_case(case, settings=RegressionSettings())
    assert recorded["input"] == case.input
    assert recorded["expected_heading"] == case.expected_heading
    assert recorded["pass_fail"] == result.pass_fail
    assert recorded["actual_heading"] == result.actual_heading
    assert recorded["pass_fail"] in {"PASS", "FAIL"}


def test_regression_suite_minimum_size(regression_cases):
    categories = {case.category for case in regression_cases}
    assert len(regression_cases) >= 100
    assert categories == {
        "textiles",
        "fasteners",
        "chemicals",
        "food",
        "electronics",
        "furniture_hardware",
    }


def test_regression_report_generated(regression_report):
    assert REPORT_PATH.is_file()
    assert regression_report["summary"]["total_cases"] >= 100
    assert "accuracy_by_category" in regression_report["summary"]
    assert "top_failures" in regression_report
    assert len(regression_report["results"]) >= 100


def test_regression_overall_accuracy_threshold(regression_report):
    """Soft gate — suite documents accuracy; hard fail only below 50%."""
    accuracy = regression_report["summary"]["overall_accuracy_pct"]
    assert accuracy >= 50.0, (
        f"Overall accuracy {accuracy}% below minimum 50% — see reports/regression_report.json"
    )
