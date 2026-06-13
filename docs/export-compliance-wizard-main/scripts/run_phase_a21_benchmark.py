"""Phase A.2.1 benchmark — family, chapter, top CN, and displayed description."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models.schemas import ClassifyProductRequest  # noqa: E402
from app.services.classification_service import classify_product  # noqa: E402
from tests.test_services import DummySettings  # noqa: E402


@dataclass
class A21Case:
    query: str
    families: tuple[str, ...]
    allowed_chapters: frozenset[str]
    expected_heading_prefixes: tuple[str, ...]
    forbidden_in_display: tuple[str, ...]
    forbidden_in_top_desc: tuple[str, ...] = ()
    disambiguation: dict[str, str] | None = None


CASES = [
    A21Case(
        "Danfoss FC302",
        ("frequency_inverter",),
        frozenset({"85"}),
        ("8504",),
        ("diesel", "compression-ignition", "piston engine"),
    ),
    A21Case(
        "Schneider ATV320",
        ("frequency_inverter",),
        frozenset({"85"}),
        ("8504",),
        ("diesel", "compression-ignition"),
    ),
    A21Case(
        "Pepperl+Fuchs NBB5-18GM50-E2",
        ("proximity_sensor",),
        frozenset({"85", "90"}),
        ("8536",),
        ("regulating or controlling", "flow, level, pressure"),
    ),
    A21Case(
        "UPS battery backup",
        ("ups",),
        frozenset({"85"}),
        ("8504",),
        ("reader", "reproducing", "still image"),
        forbidden_in_top_desc=("reader", "reproducing"),
    ),
    A21Case(
        "Permanent marker",
        ("stationery_marker",),
        frozenset({"96"}),
        ("9608",),
        ("ribbon", "typewriter", "permanently put"),
        forbidden_in_top_desc=("ribbon", "typewriter"),
    ),
    A21Case(
        "IFM PN7094",
        ("pressure_sensor",),
        frozenset({"90"}),
        ("9026", "9025"),
        ("diesel",),
    ),
]


def evaluate(case: A21Case) -> tuple[bool, str]:
    response = classify_product(
        ClassifyProductRequest(
            product_description=case.query,
            disambiguation=case.disambiguation,
        ),
        DummySettings(),
    )
    fams = set(response.cpr.product_families if response.cpr else [])
    if case.families and not fams.intersection(case.families):
        return False, f"family expected {case.families}, got {fams}"

    top = response.suggestions[0] if response.suggestions else None
    if not top:
        return False, f"no suggestions state={response.classification_state}"

    digits = top.cn_code.replace(" ", "")
    chapter = digits[:2]
    heading = digits[:4]

    if chapter not in case.allowed_chapters:
        return False, f"chapter {chapter} not in {case.allowed_chapters}"

    if case.expected_heading_prefixes and not any(
        heading.startswith(p) for p in case.expected_heading_prefixes
    ):
        return False, f"heading {heading} not in {case.expected_heading_prefixes}"

    display = (top.combined_description or top.description or "").lower()
    for bad in case.forbidden_in_display:
        if bad in display:
            return False, f"forbidden '{bad}' in combined_description"

    desc = (top.description or "").lower()
    for bad in case.forbidden_in_top_desc:
        if bad in desc:
            return False, f"forbidden '{bad}' in top description"

    return (
        True,
        f"top={top.cn_code} fam={sorted(fams)} display={display[:55]}...",
    )


def main() -> int:
    passed = 0
    for case in CASES:
        ok, detail = evaluate(case)
        passed += int(ok)
        print(f"[{'PASS' if ok else 'FAIL'}] {case.query}: {detail}")
    rate = passed / len(CASES) if CASES else 0
    print(f"\nPhase A.2.1 benchmark: {passed}/{len(CASES)} ({rate:.0%})")
    return 0 if passed == len(CASES) else 1


if __name__ == "__main__":
    raise SystemExit(main())
