"""Regression: GET / must render wizard UI (Starlette TemplateResponse signature)."""

from fastapi.testclient import TestClient

from app.main import app


def test_index_returns_html():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "Export Compliance Wizard" in response.text
