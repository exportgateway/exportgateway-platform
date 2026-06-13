"""Phase A.2.2 benchmark — family, chapter, heading, top CN, display."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models.schemas import ClassifyProductRequest  # noqa: E402
from app.services.classification_service import classify_product  # noqa: E402
from tests.test_services import DummySettings  # noqa: E402

BENCHMARK_PATH = ROOT / "app" / "data" / "PHASE_A22_BENCHMARK.json"


def cn_digits(code: str) -> str:
    return "".join(ch for ch in code if ch.isdigit())


def evaluate_case(case: dict) -> tuple[bool, str, dict]:
    response = classify_product(
        ClassifyProductRequest(product_description=case["query"]),
        DummySettings(),
    )
    fams = set(response.cpr.product_families if response.cpr else [])
    expected_fams = set(case.get("families", []))
    top = response.suggestions[0] if response.suggestions else None

    detail: dict = {
        "query": case["query"],
        "families": sorted(fams),
        "state": response.classification_state,
    }

    if not top:
        return False, "no suggestions", detail

    digits = cn_digits(top.cn_code)
    chapter = digits[:2]
    heading = digits[:4]
    display = (top.combined_description or top.description or "").lower()
    desc = (top.description or "").lower()

    detail.update(
        {
            "top_cn": top.cn_code,
            "chapter": chapter,
            "heading": heading,
            "confidence": top.confidence_level,
            "description": top.description,
            "combined_description": top.combined_description,
        }
    )

    if expected_fams and not fams.intersection(expected_fams):
        return False, f"family expected {expected_fams}, got {fams}", detail

    if case.get("chapter") and chapter != case["chapter"]:
        return False, f"chapter expected {case['chapter']}, got {chapter}", detail

    for bad_ch in case.get("forbidden_chapters", []):
        if chapter == bad_ch:
            return False, f"forbidden chapter {bad_ch}", detail

    prefixes = case.get("heading_prefixes", [])
    if prefixes and not any(heading.startswith(p) for p in prefixes):
        return False, f"heading {heading} not in {prefixes}", detail

    for prefix in case.get("forbidden_cn8_prefixes", []):
        if digits.startswith(prefix.replace(" ", "")):
            return False, f"forbidden CN prefix {prefix}", detail

    for bad in case.get("forbidden_in_display", []):
        if bad.lower() in display:
            return False, f"forbidden in display: {bad}", detail

    for bad in case.get("forbidden_in_top_desc", []):
        if bad.lower() in desc:
            return False, f"forbidden in description: {bad}", detail

    for req in case.get("required_in_top_desc", []):
        if req.lower() not in desc:
            return False, f"missing required in description: {req}", detail

    for pref in case.get("preferred_in_top_desc", []):
        if pref.lower() not in desc:
            return False, f"preferred term missing in description: {pref}", detail

    return True, "ok", detail


def main() -> int:
    spec = json.loads(BENCHMARK_PATH.read_text(encoding="utf-8"))
    cases = spec["cases"]
    passed = 0
    rows: list[dict] = []

    for case in cases:
        ok, msg, detail = evaluate_case(case)
        passed += int(ok)
        rows.append({**detail, "id": case["id"], "pass": ok, "message": msg})
        print(f"[{'PASS' if ok else 'FAIL'}] {case['id']}: {case['query']} — {msg}")
        if ok and detail.get("top_cn"):
            print(f"         top={detail['top_cn']} fam={detail.get('families')}")

    rate = passed / len(cases) if cases else 0.0
    print(f"\nPhase A.2.2 benchmark: {passed}/{len(cases)} ({rate:.0%})")

    out_path = ROOT / "app" / "data" / "PHASE_A22_BENCHMARK_LAST_RUN.json"
    out_path.write_text(
        json.dumps({"passed": passed, "total": len(cases), "results": rows}, indent=2),
        encoding="utf-8",
    )
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
