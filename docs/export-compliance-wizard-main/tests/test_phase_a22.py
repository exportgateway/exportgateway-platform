"""Phase A.2.2 production validation tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from tests.test_services import DummySettings

ROOT = Path(__file__).resolve().parents[1]


def _classify(query: str):
    return classify_product(
        ClassifyProductRequest(product_description=query),
        DummySettings(),
    )


def _top(query: str):
    r = _classify(query)
    assert r.suggestions, query
    return r, r.suggestions[0]


def test_electric_motor_not_vehicle():
    r, top = _top("ABB electric motor")
    assert "electric_motor" in r.cpr.product_families
    assert top.cn_code.replace(" ", "")[:4] == "8501"
    assert top.chapter_code == "85"


def test_office_chair_not_dental():
    r, top = _top("Office chair")
    assert "furniture_office_chair" in r.cpr.product_families
    assert top.cn_code.replace(" ", "")[:4] == "9401"
    assert "dentist" not in (top.description or "").lower()


def test_ballpoint_pen_not_refill():
    r, top = _top("Ballpoint pen")
    assert "stationery_pen" in r.cpr.product_families
    assert not top.cn_code.replace(" ", "").startswith("960860")


def test_printer_cartridge_not_machinery():
    r, top = _top("HP printer cartridge")
    assert "office_printer_consumable" in r.cpr.product_families
    assert top.cn_code.replace(" ", "")[:4] == "3215"


def test_power_supply_realistic_8504():
    _, top = _top("Power supply 24VDC")
    assert "500" not in (top.description or "").lower() or "kva" not in (top.description or "").lower()


def test_phase_a22_benchmark_json_passes():
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "run_phase_a22_benchmark.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_benchmark_file_valid():
    path = ROOT / "app" / "data" / "PHASE_A22_BENCHMARK.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert len(data["cases"]) >= 14
