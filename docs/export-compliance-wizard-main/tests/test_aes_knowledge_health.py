"""AES Knowledge Engine production readiness health checks."""

from fastapi.testclient import TestClient

from app.main import app
from app.startup_diagnostics import probe_aes_knowledge_engine


def test_probe_aes_knowledge_engine_shape():
    status = probe_aes_knowledge_engine()
    assert status["enabled"] is True
    assert isinstance(status["historical_db_present"], bool)
    assert isinstance(status["historical_records"], int)
    assert isinstance(status["industrial_lexicon_phrases"], int)
    assert isinstance(status["brand_entries"], int)
    assert status["industrial_lexicon_loaded"] is True
    assert status["brand_knowledge_loaded"] is True


def test_health_includes_aes_knowledge_engine():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code in {200, 503}
    aes = response.json()["aes_knowledge_engine"]
    assert set(aes.keys()) == {
        "enabled",
        "historical_db_present",
        "historical_records",
        "industrial_lexicon_phrases",
        "brand_entries",
    }
    assert aes["enabled"] is True
    assert aes["industrial_lexicon_phrases"] > 0
    assert aes["brand_entries"] > 0
