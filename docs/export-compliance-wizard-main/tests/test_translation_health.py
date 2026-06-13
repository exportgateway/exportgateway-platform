"""Argos deployment diagnostics (/health/translation)."""

from fastapi.testclient import TestClient

from app.main import app
from app.services.translation_service import get_translation_health, iter_argos_package_artifacts, resolve_argos_packages_dir


def test_get_translation_health_shape():
    diag = get_translation_health()
    assert "installed_packages" in diag
    assert "available_pairs" in diag
    assert "argos_directory" in diag
    assert "translation_ready" in diag
    assert isinstance(diag["installed_packages"], list)
    assert isinstance(diag["available_pairs"], list)
    assert isinstance(diag["translation_ready"], bool)


def test_resolve_argos_packages_dir_uses_repo_root():
    path = resolve_argos_packages_dir("app/data/argos_packages")
    assert path.is_absolute()
    assert path.name == "argos_packages"
    assert path.parent.name == "data"


def test_health_translation_endpoint():
    client = TestClient(app)
    response = client.get("/health/translation")
    assert response.status_code in (200, 503)
    body = response.json()
    assert set(body.keys()) >= {
        "installed_packages",
        "available_pairs",
        "argos_directory",
        "translation_ready",
        "package_artifacts_on_disk",
        "argos_importable",
    }


def test_iter_argos_package_artifacts_empty_dir(tmp_path):
    assert iter_argos_package_artifacts(tmp_path) == []
