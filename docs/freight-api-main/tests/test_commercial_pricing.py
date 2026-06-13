import pytest

from commercial_pricing import apply_commercial_markup


def test_markup_under_200_tier():
    assert apply_commercial_markup(100) == pytest.approx(120)
    assert apply_commercial_markup(199) == pytest.approx(199 * 1.20)


def test_markup_200_to_500_tier():
    assert apply_commercial_markup(200) == pytest.approx(220)
    assert apply_commercial_markup(350) == pytest.approx(385)
    assert apply_commercial_markup(500) == pytest.approx(550)


def test_markup_over_500_tier():
    assert apply_commercial_markup(1000) == pytest.approx(1050)


def test_documented_examples():
    assert apply_commercial_markup(120) == pytest.approx(144)
    assert apply_commercial_markup(300) == pytest.approx(330)
    assert apply_commercial_markup(1000) == pytest.approx(1050)


def test_custom_rates_from_env(monkeypatch):
    monkeypatch.setenv("FREIGHT_MARKUP_UNDER_200", "0.30")
    monkeypatch.setenv("FREIGHT_MARKUP_200_TO_500", "0.15")
    monkeypatch.setenv("FREIGHT_MARKUP_OVER_500", "0.08")

    assert apply_commercial_markup(100) == pytest.approx(130)
    assert apply_commercial_markup(300) == pytest.approx(345)
    assert apply_commercial_markup(600) == pytest.approx(648)
