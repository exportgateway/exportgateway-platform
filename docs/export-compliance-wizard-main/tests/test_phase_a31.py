"""Phase A.3.1 — production readiness fixes."""

from app.services.taxonomy_service import _phrase_in_text, detect_families


def test_ups_does_not_match_syrups():
    lower = "aromatized sugar syrups".lower()
    assert not _phrase_in_text("ups", lower)
    matches = detect_families("AROMATIZED SUGAR SYRUPS")
    ids = {m.family_id for m in matches}
    assert "ups" not in ids
    assert "food_aromatized_syrup" in ids
