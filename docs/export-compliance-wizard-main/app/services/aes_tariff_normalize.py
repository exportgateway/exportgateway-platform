"""Tariff normalization for AES exports (CN8) and imports (10-digit → CN8)."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.historical_normalize import format_cn_display, normalize_cn8, tariff_digits


@dataclass(frozen=True)
class NormalizedTariff:
    original_tariff: str
    cn8: str
    cn_code: str
    heading_code: str


def normalize_export_tariff(tariff: str | float | int | None) -> NormalizedTariff | None:
    """Exports use CN8 — preserve original, store 8-digit cn8."""
    original = tariff_digits(tariff)
    if not original:
        return None
    cn8 = normalize_cn8(original)
    if not cn8:
        return None
    return NormalizedTariff(
        original_tariff=original,
        cn8=cn8,
        cn_code=format_cn_display(cn8),
        heading_code=cn8[:4],
    )


def normalize_import_tariff(tariff: str | float | int | None) -> NormalizedTariff | None:
    """
    Imports may use 10-digit national tariff codes.
    Examples: 7318159090 → 73181590, 3920102190 → 39201021.
    """
    original = tariff_digits(tariff)
    if not original:
        return None
    cn8 = normalize_cn8(original)
    if not cn8:
        return None
    return NormalizedTariff(
        original_tariff=original,
        cn8=cn8,
        cn_code=format_cn_display(cn8),
        heading_code=cn8[:4],
    )
