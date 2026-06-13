"""Startup diagnostics and route registration."""

from fastapi.testclient import TestClient

from app.main import app
from app.startup_diagnostics import (
    StartupTracker,
    memory_footprint_report,
    memory_snapshot_mb,
    probe_product_understanding,
)


def test_health_live_registered():
    with TestClient(app) as client:
        response = client.get("/health/live")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "live"
    assert body["routes_registered"] is True


def test_health_startup_reports_timing():
    with TestClient(app) as client:
        response = client.get("/health/startup")
    assert response.status_code == 200
    body = response.json()
    assert body.get("startup_complete_logged") is True
    assert "total_duration_ms" in body
    step_names = {step["name"] for step in body.get("steps", [])}
    assert "product_understanding_init" in step_names
    assert "cn_database_init" in step_names
    assert "aes_knowledge_init" in step_names
    assert "translation_init" not in step_names
    assert "memory_footprint" in body
    aes = body.get("aes_knowledge_engine", {})
    assert "historical_records" in aes
    assert "exports_records" in aes
    assert "imports_records" in aes
    assert "exports_unique_cn8" in aes
    assert "imports_unique_cn8" in aes
    assert "aes_mode" in aes


def test_product_understanding_probe_shape():
    status = probe_product_understanding()
    assert "openai_configured" in status
    assert "fallback_available" in status
    assert status["fallback_available"] is True


def test_memory_footprint_report():
    report = memory_footprint_report()
    assert report["legacy_argos_torch_overhead_mb"] == 262.0
    assert report["render_plan_recommendation"] in {"starter", "standard"}


def test_startup_tracker_records_steps():
    tracker = StartupTracker()
    with tracker.step("test_step"):
        pass
    tracker.mark_complete()
    report = tracker.to_dict()
    assert report["steps"][0]["name"] == "test_step"
    assert report["total_duration_ms"] >= 0


def test_memory_snapshot_returns_optional_float():
    assert memory_snapshot_mb() is None or isinstance(memory_snapshot_mb(), float)
