"""Phase A.2 real-world benchmark — success criteria checks."""

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
class A2Case:
    query: str
    expect_families: tuple[str, ...]
    forbidden_chapters: frozenset[str] = frozenset()
    allowed_chapters: frozenset[str] | None = None
    disambiguation: dict[str, str] | None = None


CASES = [
    A2Case("IFM PN7094", ("pressure_sensor",), allowed_chapters=frozenset({"90"})),
    A2Case("Pepperl+Fuchs NBB5-18GM50-E2", ("proximity_sensor",), allowed_chapters=frozenset({"85", "90"})),
    A2Case("Danfoss FC302", ("frequency_inverter",), allowed_chapters=frozenset({"85"})),
    A2Case("Schneider ATV320", ("frequency_inverter",), allowed_chapters=frozenset({"85"})),
    A2Case("LCD monitor", ("electronics_monitor",), allowed_chapters=frozenset({"85"}), forbidden_chapters=frozenset({"90"})),
    A2Case("Touch panel HMI", ("industrial_hmi",), allowed_chapters=frozenset({"85"})),
    A2Case("Power supply 24VDC", ("power_supply",), allowed_chapters=frozenset({"85"})),
    A2Case("UPS battery backup", ("ups",), allowed_chapters=frozenset({"85"})),
    A2Case("Printer cartridge", ("office_printer_consumable",), forbidden_chapters=frozenset({"93"})),
    A2Case("Permanent marker", ("stationery_marker",), forbidden_chapters=frozenset()),
    A2Case("Women's polyester jacket", ("apparel_jacket_womens",), forbidden_chapters=frozenset({"39"})),
    A2Case(
        "Men's cotton T-shirt",
        ("apparel_tshirt_mens",),
        allowed_chapters=frozenset({"61"}),
        disambiguation={"textile_construction": "knitted"},
    ),
    A2Case("Siemens S7-1200 CPU", ("industrial_automation",), allowed_chapters=frozenset({"85"})),
]


def evaluate(case: A2Case) -> tuple[bool, str]:
    response = classify_product(
        ClassifyProductRequest(
            product_description=case.query,
            disambiguation=case.disambiguation,
        ),
        DummySettings(),
    )
    fams = set(response.cpr.product_families if response.cpr else [])
    if case.expect_families and not fams.intersection(case.expect_families):
        return False, f"missing family {case.expect_families}, got {fams}"

    top = response.suggestions[0] if response.suggestions else None
    if case.forbidden_chapters and top:
        ch = top.cn_code.replace(" ", "")[:2]
        if ch in case.forbidden_chapters:
            return False, f"forbidden chapter {ch} ({top.cn_code})"

    if case.allowed_chapters and top:
        ch = top.cn_code.replace(" ", "")[:2]
        if ch not in case.allowed_chapters:
            return False, f"chapter {ch} not in {case.allowed_chapters}"

    if case.query.endswith("jacket") or "jacket" in case.query:
        if top and top.cn_code.replace(" ", "")[:2] == "39":
            return False, "still chapter 39 plastics"

    return True, f"state={response.classification_state} fam={sorted(fams)} top={top.cn_code if top else '—'}"


def main() -> int:
    passed = 0
    for case in CASES:
        ok, detail = evaluate(case)
        passed += int(ok)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {case.query}: {detail}")
    rate = passed / len(CASES) if CASES else 0
    print(f"\nPhase A.2 benchmark: {passed}/{len(CASES)} ({rate:.0%})")
    return 0 if rate >= 0.85 else 1


if __name__ == "__main__":
    raise SystemExit(main())
