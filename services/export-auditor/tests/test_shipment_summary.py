"""Tests for shipment summary extraction and readiness warnings."""

from __future__ import annotations

import unittest

from app.modules.export_auditor.shipment_summary_extractor import (
    MISSING_GROSS_WEIGHT,
    MISSING_PACKAGE_COUNT,
    evaluate_shipment_readiness,
    extract_delivery_address,
    extract_gross_weight,
    extract_package_count,
    extract_pallet_dimensions,
    extract_shipment_summary,
)


RENI_CORPUS = """
Račun št. 26-381-000014
Skupaj število: 1 koli
Skupna bruto teža: 120 kg
Paleta dimenzije: 80x62x62 cm
Naslov za dostavo:
RENI d.o.o.
Industrijska 12
Beograd RS-11000
Serbia
"""

DENKIRS_2026_156_TABLE = """
<table><tr><td>Koli:</td><td>2</td></tr><tr><td>Bruto teža:</td><td>76,74 kg</td></tr></table>
"""


class ShipmentSummaryTests(unittest.TestCase):
    def test_reni_package_count(self) -> None:
        count, package_type = extract_package_count(RENI_CORPUS)
        self.assertEqual(count, 1)
        self.assertEqual(package_type, "COLLI")

    def test_reni_gross_weight(self) -> None:
        total, unit = extract_gross_weight(RENI_CORPUS)
        self.assertEqual(total, 120.0)
        self.assertEqual(unit, "kg")

    def test_reni_pallet_dimensions(self) -> None:
        dims = extract_pallet_dimensions(RENI_CORPUS)
        self.assertEqual(dims, "80x62x62 cm")

    def test_reni_delivery_address(self) -> None:
        delivery = extract_delivery_address(RENI_CORPUS)
        self.assertEqual(delivery.company, "RENI d.o.o.")
        self.assertEqual(delivery.country, "Serbia")
        self.assertEqual(delivery.country_code, "RS")
        self.assertEqual(delivery.postal_code, "RS-11000")

    def test_english_patterns(self) -> None:
        count, package_type = extract_package_count("3 pallets")
        self.assertEqual(count, 3)
        self.assertEqual(package_type, "PALLET")

    def test_readiness_warnings_missing(self) -> None:
        warnings = evaluate_shipment_readiness(None)
        codes = [code for code, _ in warnings]
        self.assertIn(MISSING_PACKAGE_COUNT, codes)
        self.assertIn(MISSING_GROSS_WEIGHT, codes)

    def test_readiness_warnings_complete(self) -> None:
        summary = extract_shipment_summary(RENI_CORPUS)
        warnings = evaluate_shipment_readiness(summary)
        self.assertEqual(warnings, [])

    def test_denkirs_2026_156_table_html_package_count(self) -> None:
        count, package_type = extract_package_count(DENKIRS_2026_156_TABLE)
        self.assertEqual(count, 2)
        self.assertEqual(package_type, "COLLI")

    def test_denkirs_2026_156_table_html_gross_weight(self) -> None:
        total, unit = extract_gross_weight(DENKIRS_2026_156_TABLE)
        self.assertEqual(total, 76.74)
        self.assertEqual(unit, "kg")

    def test_denkirs_2026_156_full_summary(self) -> None:
        summary = extract_shipment_summary(DENKIRS_2026_156_TABLE)
        self.assertEqual(summary.package_count, 2)
        self.assertEqual(summary.gross_weight_total, 76.74)
        self.assertEqual(summary.gross_weight_unit, "kg")


if __name__ == "__main__":
    unittest.main()
