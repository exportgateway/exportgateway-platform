"""Tests for Mistral OCR page text assembly (table merge)."""

from __future__ import annotations

import unittest
from dataclasses import dataclass
from typing import Any

from app.modules.export_auditor.mistral_ocr import _build_page_text


@dataclass
class FakeTable:
    content: str


@dataclass
class FakePage:
    markdown: str
    header: str | None = None
    footer: str | None = None
    tables: list[Any] | None = None


class MistralOcrPageTextTests(unittest.TestCase):
    def test_merges_table_html_into_page_corpus(self) -> None:
        shipment_table = (
            "<table><tr><td>Koli:</td><td>2</td></tr>"
            "<tr><td>Bruto teža:</td><td>76,74 kg</td></tr></table>"
        )
        pages = [
            FakePage(
                markdown="Invoice header\n[tbl-0.html](tbl-0.html)",
                header="DENKIRS EU exporter block",
                tables=[FakeTable(content=shipment_table)],
            )
        ]
        full_text, lengths = _build_page_text(pages)
        self.assertIn("Koli:", full_text)
        self.assertIn("76,74 kg", full_text)
        self.assertIn("DENKIRS EU exporter block", full_text)
        self.assertGreater(lengths[0], len(pages[0].markdown))


if __name__ == "__main__":
    unittest.main()
