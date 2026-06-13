"""Tests for taxonomy candidate builder filters."""

from __future__ import annotations

from scripts.build_taxonomy_candidates import (
    _frequency_only_from_duplicated_benchmark,
    _is_subset_phrase,
    _phrase_covered_by_taxonomy,
    _phrase_quality_ok,
    _tier1_phrase_ok,
    build_taxonomy_candidates_tier1,
)


def test_reject_short_fragment_phrases():
    assert not _phrase_quality_ok("men cotton")
    assert not _phrase_quality_ok("500 pcs men")
    assert not _phrase_quality_ok("cotton dress")


def test_accept_industrial_phrases():
    assert _phrase_quality_ok("abs robni trak")
    assert _phrase_quality_ok("robni trak abs")
    assert _phrase_quality_ok("industrijsko lepilo")
    assert _phrase_quality_ok("pohistveno okovje")
    assert _phrase_quality_ok("inox vijaki")
    assert not _tier1_phrase_ok("pcs hex head")


def test_subset_detection():
    assert _is_subset_phrase("robni trak", "abs robni trak")
    assert not _is_subset_phrase("abs robni trak", "robni trak abs")


def test_taxonomy_coverage_for_okovje():
    assert _phrase_covered_by_taxonomy("pohistveno okovje")
    assert not _phrase_covered_by_taxonomy("robni trak")


def test_regression_only_bucket():
    from scripts.build_taxonomy_candidates import PhraseStats

    bucket = PhraseStats(phrase="jeans hlace", cn8="62034231", frequency=25)
    bucket.regression_hits = 25
    bucket.regression_case_ids = {"tex-001"}
    assert _frequency_only_from_duplicated_benchmark(bucket)

    bucket.regression_case_ids = {"tex-001", "tex-002"}
    assert not _frequency_only_from_duplicated_benchmark(bucket)


def test_tier1_builder_outputs_limited_candidates():
    report = build_taxonomy_candidates_tier1(limit=20)
    assert report["candidate_count"] <= 20
    assert report["candidates"]
    for candidate in report["candidates"]:
        assert _phrase_quality_ok(candidate["phrase"])
        assert _tier1_phrase_ok(candidate["phrase"])
        assert "score" in candidate
