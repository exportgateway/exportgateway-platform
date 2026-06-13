"""End-to-end classification regression suite runner and report generator."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product

SUITE_PATH = Path(__file__).resolve().parent.parent / "data" / "regression_suite_v1.json"
REPORT_PATH = Path(__file__).resolve().parent.parent.parent / "reports" / "regression_report.json"


@dataclass(frozen=True)
class RegressionCase:
    id: str
    category: str
    input: str
    expected_heading: str
    acceptable_headings: tuple[str, ...] = ()
    disambiguation: dict[str, str] = field(default_factory=dict)
    notes: str = ""

    @property
    def allowed_headings(self) -> frozenset[str]:
        return frozenset({self.expected_heading, *self.acceptable_headings})


@dataclass
class RegressionResult:
    id: str
    category: str
    input: str
    expected_heading: str
    actual_heading: str | None
    actual_cn_code: str | None
    pass_fail: str
    classification_state: str
    product_families: list[str]
    root_cause: str | None = None
    notes: str = ""


class RegressionSettings:
    ai_classification_enabled = False


def load_regression_cases(path: Path | None = None) -> list[RegressionCase]:
    suite_path = path or SUITE_PATH
    with suite_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    cases: list[RegressionCase] = []
    for raw in payload.get("cases", []):
        cases.append(
            RegressionCase(
                id=raw["id"],
                category=raw["category"],
                input=raw["input"],
                expected_heading=raw["expected_heading"],
                acceptable_headings=tuple(raw.get("acceptable_headings", [])),
                disambiguation=dict(raw.get("disambiguation", {})),
                notes=raw.get("notes", ""),
            )
        )
    return cases


def _actual_heading(response) -> tuple[str | None, str | None]:
    if not response.suggestions:
        return None, None
    cn_code = response.suggestions[0].cn_code
    digits = cn_code.replace(" ", "")
    heading = digits[:4] if len(digits) >= 4 else None
    return heading, cn_code


def _diagnose_failure(
    case: RegressionCase,
    *,
    actual_heading: str | None,
    classification_state: str,
    product_families: list[str],
) -> str:
    if classification_state == "DISAMBIGUATE":
        return "disambiguation_required"
    if classification_state in {"ABSTAIN", "EXPERT_REQUIRED"} and not actual_heading:
        return "no_confident_suggestion"
    if not actual_heading:
        return "empty_suggestions"
    if actual_heading and actual_heading not in case.allowed_headings:
        expected_family = _category_family_hint(case.category, case.expected_heading)
        detected = set(product_families)
        if expected_family and expected_family not in detected:
            return "wrong_product_family"
        if case.disambiguation and classification_state == "SUGGEST":
            return "wrong_heading_after_disambiguation"
        return "wrong_heading_keyword_drift"
    return "unknown"


def _category_family_hint(category: str, expected_heading: str) -> str | None:
    hints = {
        ("fasteners", "7318"): "fastener_screw",
        ("chemicals", "3214"): "silicone_sealant",
        ("chemicals", "3209"): "protective_coating_paint",
        ("chemicals", "3909"): "polyurethane_compound",
        ("food", "1905"): "food_prepared_pizza",
        ("food", "1902"): "food_pasta",
        ("food", "2106"): "food_aromatized_syrup",
        ("electronics", "8471"): "electronics_laptop",
        ("electronics", "8528"): "electronics_monitor",
        ("electronics", "9025"): "temperature_sensor",
        ("electronics", "8536"): "proximity_sensor",
        ("electronics", "8501"): "electric_motor",
        ("furniture_hardware", "8302"): "furniture_fittings",
        ("textiles", "6203"): "apparel_trousers_mens",
        ("textiles", "6205"): "apparel_shirts",
        ("textiles", "6109"): "apparel_tshirt_womens",
        ("textiles", "6206"): "apparel_blouse_womens",
        ("textiles", "6202"): "apparel_jacket_womens",
    }
    return hints.get((category, expected_heading))


def run_regression_case(case: RegressionCase, settings: Any = None) -> RegressionResult:
    settings = settings or RegressionSettings()
    response = classify_product(
        ClassifyProductRequest(
            product_description=case.input,
            disambiguation=case.disambiguation or None,
        ),
        settings,
    )
    actual_heading, actual_cn = _actual_heading(response)
    families = list(response.cpr.product_families) if response.cpr else []
    passed = actual_heading in case.allowed_headings if actual_heading else False
    root_cause = None if passed else _diagnose_failure(
        case,
        actual_heading=actual_heading,
        classification_state=response.classification_state,
        product_families=families,
    )
    return RegressionResult(
        id=case.id,
        category=case.category,
        input=case.input,
        expected_heading=case.expected_heading,
        actual_heading=actual_heading,
        actual_cn_code=actual_cn,
        pass_fail="PASS" if passed else "FAIL",
        classification_state=response.classification_state,
        product_families=families,
        root_cause=root_cause,
        notes=case.notes,
    )


def run_regression_suite(
    cases: list[RegressionCase] | None = None,
    *,
    settings: Any = None,
) -> dict[str, Any]:
    cases = cases or load_regression_cases()
    results = [run_regression_case(case, settings=settings) for case in cases]

    by_category: dict[str, dict[str, Any]] = {}
    for result in results:
        bucket = by_category.setdefault(
            result.category,
            {"total": 0, "passed": 0, "failed": 0, "accuracy_pct": 0.0},
        )
        bucket["total"] += 1
        if result.pass_fail == "PASS":
            bucket["passed"] += 1
        else:
            bucket["failed"] += 1

    for bucket in by_category.values():
        bucket["accuracy_pct"] = round(
            (bucket["passed"] / bucket["total"]) * 100 if bucket["total"] else 0.0,
            2,
        )

    total = len(results)
    passed = sum(1 for result in results if result.pass_fail == "PASS")
    failures = [result for result in results if result.pass_fail == "FAIL"]
    failures_sorted = sorted(
        failures,
        key=lambda item: (item.category, item.id),
    )

    root_cause_counts: dict[str, int] = {}
    for failure in failures:
        key = failure.root_cause or "unknown"
        root_cause_counts[key] = root_cause_counts.get(key, 0) + 1

    root_cause_analysis = _build_root_cause_analysis(
        failures=failures,
        root_cause_counts=root_cause_counts,
        by_category=by_category,
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "suite_version": 1,
        "engine": "keyword_lexicon_fallback",
        "ai_classification_enabled": getattr(settings or RegressionSettings(), "ai_classification_enabled", False),
        "summary": {
            "total_cases": total,
            "passed": passed,
            "failed": len(failures),
            "overall_accuracy_pct": round((passed / total) * 100 if total else 0.0, 2),
            "accuracy_by_category": by_category,
            "root_cause_counts": root_cause_counts,
        },
        "root_cause_analysis": root_cause_analysis,
        "top_failures": [
            {
                "input": item.input,
                "expected_heading": item.expected_heading,
                "actual_heading": item.actual_heading,
                "pass_fail": item.pass_fail,
                "category": item.category,
                "classification_state": item.classification_state,
                "product_families": item.product_families,
                "root_cause": item.root_cause,
                "id": item.id,
            }
            for item in failures_sorted[:20]
        ],
        "results": [
            {
                "id": item.id,
                "category": item.category,
                "input": item.input,
                "expected_heading": item.expected_heading,
                "actual_heading": item.actual_heading,
                "actual_cn_code": item.actual_cn_code,
                "pass_fail": item.pass_fail,
                "classification_state": item.classification_state,
                "product_families": item.product_families,
                "root_cause": item.root_cause,
            }
            for item in results
        ],
    }
    return report


def _build_root_cause_analysis(
    *,
    failures: list[RegressionResult],
    root_cause_counts: dict[str, int],
    by_category: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Human-readable root cause breakdown for the regression report."""
    analyses: list[dict[str, Any]] = []

    if root_cause_counts.get("wrong_product_family"):
        analyses.append(
            {
                "cause": "wrong_product_family",
                "count": root_cause_counts["wrong_product_family"],
                "description": (
                    "OpenAI/fallback understanding or entity detection assigned the wrong "
                    "taxonomy family before ranking, so family-first candidate restriction "
                    "searched the wrong heading space."
                ),
                "affected_categories": sorted(
                    {
                        item.category
                        for item in failures
                        if item.root_cause == "wrong_product_family"
                    }
                ),
                "examples": [
                    item.input
                    for item in failures
                    if item.root_cause == "wrong_product_family"
                ][:5],
                "recommended_fix": (
                    "Extend universal_family_ranking.json type rules and cn_taxonomy_v1.json "
                    "phrases; ensure entity families (e.g. furniture_fittings) override generic "
                    "keyword families like fastener_screw."
                ),
            }
        )

    if root_cause_counts.get("wrong_heading_after_disambiguation"):
        analyses.append(
            {
                "cause": "wrong_heading_after_disambiguation",
                "count": root_cause_counts["wrong_heading_after_disambiguation"],
                "description": (
                    "Product family was detected and disambiguation was resolved, but "
                    "within-family CN8/heading ranking still picked a sibling heading."
                ),
                "affected_categories": sorted(
                    {
                        item.category
                        for item in failures
                        if item.root_cause == "wrong_heading_after_disambiguation"
                    }
                ),
                "examples": [
                    item.input
                    for item in failures
                    if item.root_cause == "wrong_heading_after_disambiguation"
                ][:5],
                "recommended_fix": (
                    "Tune apparel heading priors in taxonomy_service and cn_ranking "
                    "(_apply_apparel_entity_scoring) for polo/blouse vs shirt headings."
                ),
            }
        )

    if root_cause_counts.get("wrong_heading_keyword_drift"):
        analyses.append(
            {
                "cause": "wrong_heading_keyword_drift",
                "count": root_cause_counts["wrong_heading_keyword_drift"],
                "description": (
                    "Correct family detected but keyword scoring still pulled a chemically "
                    "similar but wrong chapter (e.g. adhesive → 4821)."
                ),
                "affected_categories": sorted(
                    {
                        item.category
                        for item in failures
                        if item.root_cause == "wrong_heading_keyword_drift"
                    }
                ),
                "examples": [
                    item.input
                    for item in failures
                    if item.root_cause == "wrong_heading_keyword_drift"
                ][:5],
                "recommended_fix": (
                    "Strengthen family-first restriction for construction_chemicals and "
                    "add penalized headings for common adhesive false positives."
                ),
            }
        )

    if root_cause_counts.get("disambiguation_required"):
        analyses.append(
            {
                "cause": "disambiguation_required",
                "count": root_cause_counts["disambiguation_required"],
                "description": "Classifier blocked on pending taxonomy disambiguation question.",
                "affected_categories": sorted(
                    {
                        item.category
                        for item in failures
                        if item.root_cause == "disambiguation_required"
                    }
                ),
                "examples": [
                    item.input
                    for item in failures
                    if item.root_cause == "disambiguation_required"
                ],
                "recommended_fix": (
                    "Add sensor_measurement_type auto-answer from OpenAI or phrase rules."
                ),
            }
        )

    if root_cause_counts.get("no_confident_suggestion"):
        analyses.append(
            {
                "cause": "no_confident_suggestion",
                "count": root_cause_counts["no_confident_suggestion"],
                "description": (
                    "Classifier returned EXPERT_REQUIRED/ABSTAIN with no top suggestion."
                ),
                "affected_categories": sorted(
                    {
                        item.category
                        for item in failures
                        if item.root_cause == "no_confident_suggestion"
                    }
                ),
                "examples": [
                    item.input
                    for item in failures
                    if item.root_cause == "no_confident_suggestion"
                ],
                "recommended_fix": (
                    "Add Slovenian/local phrases to furniture_fittings taxonomy."
                ),
            }
        )

    weakest = sorted(
        by_category.items(),
        key=lambda item: item[1]["accuracy_pct"],
    )[:2]
    if weakest:
        analyses.append(
            {
                "cause": "category_accuracy_gap",
                "count": sum(item[1]["failed"] for item in weakest),
                "description": (
                    "Lowest-accuracy categories need taxonomy phrase coverage and "
                    "family-first tuning."
                ),
                "affected_categories": [item[0] for item in weakest],
                "category_accuracy": {item[0]: item[1]["accuracy_pct"] for item in weakest},
                "recommended_fix": (
                    "Prioritize furniture_hardware and chemicals phrase lists and "
                    "disambiguate hinge/bracket vs fastener collisions."
                ),
            }
        )

    return analyses


def write_regression_report(report: dict[str, Any], path: Path | None = None) -> Path:
    report_path = path or REPORT_PATH
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return report_path
