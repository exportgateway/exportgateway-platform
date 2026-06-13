"""Tests for consignee destination country resolution."""

from __future__ import annotations

import unittest

from app.modules.export_auditor.destination_country import (
    extract_destination_from_consignee,
    resolve_destination_from_consignee,
)
from app.modules.export_auditor.schemas import NormalizedInvoice


class DestinationCountryTests(unittest.TestCase):
    def test_mk_1000_skopje(self) -> None:
        result = extract_destination_from_consignee("AVC Group d.o.o., MK-1000 Skopje")
        self.assertIsNotNone(result)
        name, code = result  # type: ignore[misc]
        self.assertEqual(code, "MK")
        self.assertEqual(name, "North Macedonia")

    def test_exw_si_consignee_mk_wins(self) -> None:
        invoice = NormalizedInvoice(
            invoice_number="26-392-000027",
            exporter="AVC Group d.o.o., Ljubljana, Slovenia",
            consignee="AVC Group d.o.o.\nMK-1000 Skopje",
            country="Slovenia",
            country_code="SI",
            incoterms="EXW SI-1000 Ljubljana",
        )
        fixed = resolve_destination_from_consignee(invoice)
        self.assertEqual(fixed.country, "North Macedonia")
        self.assertEqual(fixed.country_code, "MK")
        self.assertEqual(fixed.incoterms, "EXW SI-1000 Ljubljana")

    def test_no_prefix_unchanged(self) -> None:
        invoice = NormalizedInvoice(
            consignee="Beta Import GmbH, Vienna",
            country="Austria",
            country_code="AT",
        )
        fixed = resolve_destination_from_consignee(invoice)
        self.assertEqual(fixed.country, "Austria")
        self.assertEqual(fixed.country_code, "AT")

    def test_rs_prefix(self) -> None:
        result = extract_destination_from_consignee("TENZOR D.O.O., RS-11000 Beograd")
        self.assertIsNotNone(result)
        name, code = result  # type: ignore[misc]
        self.assertEqual(code, "RS")
        self.assertEqual(name, "Serbia")


if __name__ == "__main__":
    unittest.main()
