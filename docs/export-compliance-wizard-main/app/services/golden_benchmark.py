"""Golden benchmark runner for Phase A."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings
from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product

BENCHMARK_PATH = Path(__file__).resolve().parent.parent / "data" / "golden_benchmark_v1.json"


@dataclass
class CaseResult:
    case_id: str
    query: str
    top_cn: str | None
    top_chapter: str | None
    passed: bool
    reason: str
    state: str | None


@dataclass
class BenchmarkReport:
    total: int
    passed: int
    top1_ok: int
    forbidden_violations: int
    results: list[CaseResult]

    @property
    def pass_rate(self) -> float:
        return self.passed / self.total if self.total else 0.0


def _load_cases() -> list[dict]:
    with BENCHMARK_PATH.open(encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("cases", [])


def _chapter(cn_code: str | None) -> str | None:
    if not cn_code:
        return None
    digits = "".join(c for c in cn_code if c.isdigit())
    return digits[:2] if len(digits) >= 2 else None


def _heading(cn_code: str | None) -> str | None:
    if not cn_code:
        return None
    digits = "".join(c for c in cn_code if c.isdigit())
    return digits[:4] if len(digits) >= 4 else None


def evaluate_case(case: dict, settings: Settings | None = None) -> CaseResult:
    settings = settings or Settings()
    payload = ClassifyProductRequest(
        product_description=case["query"],
        disambiguation=case.get("disambiguation"),
    )
    response = classify_product(payload, settings)
    top = response.suggestions[0] if response.suggestions else None
    top_cn = top.cn_code if top else None
    top_ch = _chapter(top_cn)
    top_head = _heading(top_cn)

    if case.get("disambiguation") and not response.suggestions:
        return CaseResult(
            case_id=case["id"],
            query=case["query"],
            top_cn=top_cn,
            top_chapter=top_ch,
            passed=False,
            reason="no suggestions after disambiguation",
            state=response.classification_state,
        )

    if not top_cn and case.get("disambiguation"):
        pass

    forbidden = case.get("forbidden_chapters") or []
    if top_ch and top_ch in forbidden:
        return CaseResult(
            case_id=case["id"],
            query=case["query"],
            top_cn=top_cn,
            top_chapter=top_ch,
            passed=False,
            reason=f"forbidden chapter {top_ch}",
            state=response.classification_state,
        )

    for prefix in case.get("forbidden_heading_prefixes") or []:
        if top_head and top_head.startswith(prefix):
            return CaseResult(
                case_id=case["id"],
                query=case["query"],
                top_cn=top_cn,
                top_chapter=top_ch,
                passed=False,
                reason=f"forbidden heading {top_head}",
                state=response.classification_state,
            )

    expected_ch = case.get("expected_chapters") or []
    expected_prefix = case.get("expected_cn_prefixes") or []

    if expected_prefix and top_head:
        if any(top_head.startswith(p) for p in expected_prefix):
            return CaseResult(
                case_id=case["id"],
                query=case["query"],
                top_cn=top_cn,
                top_chapter=top_ch,
                passed=True,
                reason="expected cn prefix",
                state=response.classification_state,
            )

    if expected_ch and top_ch and top_ch in expected_ch:
        return CaseResult(
            case_id=case["id"],
            query=case["query"],
            top_cn=top_cn,
            top_chapter=top_ch,
            passed=True,
            reason="expected chapter",
            state=response.classification_state,
        )

    if expected_ch and not top_ch:
        if response.classification_state == "DISAMBIGUATE" and not case.get("disambiguation"):
            return CaseResult(
                case_id=case["id"],
                query=case["query"],
                top_cn=None,
                top_chapter=None,
                passed=True,
                reason="disambiguate before suggest (acceptable)",
                state=response.classification_state,
            )
        return CaseResult(
            case_id=case["id"],
            query=case["query"],
            top_cn=top_cn,
            top_chapter=top_ch,
            passed=False,
            reason="no top suggestion",
            state=response.classification_state,
        )

    if expected_ch:
        return CaseResult(
            case_id=case["id"],
            query=case["query"],
            top_cn=top_cn,
            top_chapter=top_ch,
            passed=False,
            reason=f"chapter {top_ch} not in {expected_ch}",
            state=response.classification_state,
        )

    return CaseResult(
        case_id=case["id"],
        query=case["query"],
        top_cn=top_cn,
        top_chapter=top_ch,
        passed=bool(top_cn),
        reason="suggestion returned",
        state=response.classification_state,
    )


def run_golden_benchmark(settings: Settings | None = None) -> BenchmarkReport:
    cases = _load_cases()
    results = [evaluate_case(case, settings) for case in cases]
    passed = sum(1 for r in results if r.passed)
    forbidden = sum(1 for r in results if "forbidden" in r.reason)
    top1 = sum(1 for r in results if r.top_cn and r.passed)
    return BenchmarkReport(
        total=len(results),
        passed=passed,
        top1_ok=top1,
        forbidden_violations=forbidden,
        results=results,
    )
