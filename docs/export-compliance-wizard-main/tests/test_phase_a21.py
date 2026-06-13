"""Phase A.2.1 — ranking, display, and benchmark checks."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from tests.test_services import DummySettings

ROOT = Path(__file__).resolve().parents[1]


def _top(query: str):
    r = classify_product(
        ClassifyProductRequest(product_description=query),
        DummySettings(),
    )
    assert r.suggestions, f"no suggestions for {query!r}"
    return r, r.suggestions[0]


def test_inverter_display_avoids_diesel():
    r, top = _top("Danfoss FC302")
    assert "frequency_inverter" in r.cpr.product_families
    display = (top.combined_description or "").lower()
    assert "diesel" not in display
    assert "compression-ignition" not in display
    assert top.cn_code.replace(" ", "")[:4] == "8504"


def test_ups_top_is_static_converter_chapter():
    r, top = _top("UPS battery backup")
    assert "ups" in r.cpr.product_families
    assert top.cn_code.replace(" ", "")[:4] == "8504"
    assert "reader" not in (top.description or "").lower()


def test_marker_top_is_9608_not_ribbon():
    r, top = _top("Permanent marker")
    assert "stationery_marker" in r.cpr.product_families
    assert top.cn_code.replace(" ", "")[:4] == "9608"
    assert "ribbon" not in (top.description or "").lower()


def test_proximity_top_is_8536_not_9026():
    r, top = _top("Pepperl+Fuchs NBB5-18GM50-E2")
    assert "proximity_sensor" in r.cpr.product_families
    assert top.cn_code.replace(" ", "")[:4] == "8536"
    assert top.chapter_code == "85"


def test_phase_a21_benchmark_script_passes():
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "run_phase_a21_benchmark.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
