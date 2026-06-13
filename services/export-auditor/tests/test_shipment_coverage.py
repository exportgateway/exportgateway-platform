"""Tests for shipment field coverage metrics."""

from __future__ import annotations

import unittest

from app.modules.export_auditor.schemas import ShipmentSummary
from app.modules.export_auditor.shipment_coverage import (
    compute_shipment_field_coverage,
    has_structured_shipment_data,
)


class ShipmentCoverageTests(unittest.TestCase):
    def test_detects_denkirs_fields(self) -> None:
        summary = ShipmentSummary(package_count=2, gross_weight_total=76.74, gross_weight_unit="kg")
        detected, missing = compute_shipment_field_coverage(summary)
        self.assertIn("package_count", detected)
        self.assertIn("gross_weight_total", detected)
        self.assertIn("net_weight_total", missing)
        self.assertIn("pallet_count", missing)

    def test_empty_summary_all_missing(self) -> None:
        detected, missing = compute_shipment_field_coverage(None)
        self.assertEqual(detected, [])
        self.assertEqual(len(missing), 5)

    def test_has_structured_shipment_data(self) -> None:
        self.assertTrue(
            has_structured_shipment_data(
                ShipmentSummary(package_count=2, gross_weight_total=76.74)
            )
        )
        self.assertFalse(has_structured_shipment_data(None))


if __name__ == "__main__":
    unittest.main()
