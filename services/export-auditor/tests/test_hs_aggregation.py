"""Tests for HS aggregation engine."""

from __future__ import annotations

import unittest

from app.modules.export_auditor.hs_aggregation_engine import (
    NormalizedAggregationItem,
    is_service_or_transport_line,
    run_hs_aggregation_engine,
)


class HsAggregationEngineTests(unittest.TestCase):
    def test_transport_exclusion(self) -> None:
        self.assertTrue(is_service_or_transport_line("Stroški izvoza"))
        items = [
            NormalizedAggregationItem(1, "Goods", 10, 100, "84818073", "DE", 5.0, "UNKNOWN"),
            NormalizedAggregationItem(2, "Stroški izvoza", 1, 50, "", "SI", None, "UNKNOWN"),
        ]
        result = run_hs_aggregation_engine(items)
        self.assertEqual(result.mrn_summary.excluded_service_lines, 1)
        self.assertEqual(result.mrn_summary.total_goods_lines, 1)
        self.assertEqual(result.hs_aggregation[0].total_quantity, 10)

    def test_hs_quantity_aggregation(self) -> None:
        items = [
            NormalizedAggregationItem(1, "A", 13, 100, "84818073", "DE", 12.5, "UNKNOWN"),
            NormalizedAggregationItem(2, "B", 13, 100, "84818073", "DE", 12.486, "UNKNOWN"),
        ]
        result = run_hs_aggregation_engine(items)
        self.assertEqual(result.hs_aggregation[0].total_quantity, 26)
        self.assertEqual(result.hs_aggregation[0].item_count, 2)

    def test_preference_separation(self) -> None:
        items = [
            NormalizedAggregationItem(1, "A", 1, 100, "84818073", "DE", 1.0, "YES"),
            NormalizedAggregationItem(2, "B", 1, 200, "84819000", "DE", 2.0, "NO"),
            NormalizedAggregationItem(3, "C", 1, 300, "73072390", "CN", 3.0, "UNKNOWN"),
        ]
        result = run_hs_aggregation_engine(items)
        self.assertEqual(len(result.preferential_summary), 1)
        self.assertEqual(len(result.non_preferential_summary), 1)
        self.assertEqual(len(result.unknown_preference_summary), 1)


if __name__ == "__main__":
    unittest.main()
