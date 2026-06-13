from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field

from mistralai import Mistral
from mistralai.extra.utils.response_format import response_format_from_pydantic_model

from app.modules.export_auditor.extraction_schema import ExtractedInvoiceSchema

logger = logging.getLogger(__name__)

DOCUMENT_ANNOTATION_PROMPT = """Extract complete commercial export invoice data from this document.

Requirements:
- Process ALL pages. Line items may continue across multiple pages — include every row.
- Extract the invoice grand total into total_value (subtotal, total, amount due, or net/gross total).
- Preserve full Incoterms text exactly as printed, including delivery place (example: "DAP Beograd", not just "DAP").
- For each line item extract item_code, description, quantity, unit price, line total, tariff/HS/CN code, and country of origin.
- Extract item_code from product code / artikel / SKU columns (examples: HONMB-PN002, HON013730.10, ADI033442.21, HONMB-DGB2MF).
- Extract vat_article as the full legal VAT exemption/reference text exactly as printed, including leading words such as "Article".
- Map tariff code columns (Tariff, HS, CN, Customs code, Tariff code) into hs_code.
- Map origin columns (Country of origin, Origin, COO) into country_of_origin.
- country_code must be ISO 3166-1 alpha-2 when identifiable.
- Use empty strings for unknown fields. Do not invent values.
- Include all line items from invoice tables, not a summary row only.

SHIPMENT SUMMARY (mandatory when present on invoice):
- Extract shipment_summary from footer blocks, summary tables, and shipment info sections.
- gross_weight_total: total gross/brutto weight (Gross Weight, Bruttogewicht, Bruto teža, Bruto Teža, Peso Lordo, etc.).
- net_weight_total: total net/netto weight (Net Weight, Nettogewicht, Neto teža, Peso Netto, etc.).
- package_count: number of packages/colli (Packages, Colli, Koli, Kosov, Paketi, Stück, Nr. colete, etc.).
- package_type: package unit when printed (COLLI, CT, PALLET, koli, colli, etc.).
- pallet_count: number of pallets (Palete, Paletten, Nr. paleti, Počet paliet, Liczba palet, etc.).
- Parse European decimal commas (example: 76,74 kg → gross_weight_total 76.74, gross_weight_unit kg).
- Shipment summary tables (example rows "Koli: 2", "Bruto teža: 76,74 kg") MUST map into shipment_summary.
- Populate ocr_text with shipment footer text and delivery/consignee blocks when present.
"""


@dataclass
class OcrResult:
    page_count: int
    full_text: str
    page_text_lengths: list[int] = field(default_factory=list)
    document_annotation: str | None = None


def _table_content(table: object) -> str:
    if isinstance(table, dict):
        return str(table.get("content") or "").strip()
    return str(getattr(table, "content", None) or "").strip()


def _build_page_text(pages: list) -> tuple[str, list[int]]:
    """Build OCR corpus from markdown, headers, footers, and table HTML content."""
    page_lengths: list[int] = []
    parts: list[str] = []
    total_pages = len(pages)

    for index, page in enumerate(pages, start=1):
        page_text_parts: list[str] = []

        header = getattr(page, "header", None)
        if header and str(header).strip():
            page_text_parts.append(str(header).strip())

        markdown = getattr(page, "markdown", None) or ""
        if markdown.strip():
            page_text_parts.append(markdown.strip())

        for table in getattr(page, "tables", None) or []:
            content = _table_content(table)
            if content:
                page_text_parts.append(content)

        footer = getattr(page, "footer", None)
        if footer and str(footer).strip():
            page_text_parts.append(str(footer).strip())

        page_text = "\n\n".join(page_text_parts)
        page_lengths.append(len(page_text))
        if page_text:
            parts.append(f"=== PAGE {index} OF {total_pages} ===\n{page_text}")

    return "\n\n---\n\n".join(parts), page_lengths


def run_mistral_ocr(pdf_bytes: bytes, api_key: str) -> OcrResult:
    client = Mistral(api_key=api_key)
    encoded = base64.b64encode(pdf_bytes).decode("utf-8")
    annotation_format = response_format_from_pydantic_model(ExtractedInvoiceSchema)

    response = client.ocr.process(
        model="mistral-ocr-latest",
        document={
            "type": "document_url",
            "document_url": f"data:application/pdf;base64,{encoded}",
        },
        table_format="html",
        include_image_base64=False,
        extract_header=True,
        extract_footer=True,
        document_annotation_format=annotation_format,
        document_annotation_prompt=DOCUMENT_ANNOTATION_PROMPT,
    )

    pages = getattr(response, "pages", None) or []
    full_text, page_lengths = _build_page_text(pages)
    page_count = len(pages) if pages else (1 if full_text else 0)
    document_annotation = getattr(response, "document_annotation", None)
    if document_annotation is not None and not isinstance(document_annotation, str):
        document_annotation = str(document_annotation)

    logger.info(
        "Mistral OCR completed: page_count=%s ocr_text_length=%s page_lengths=%s "
        "document_annotation_present=%s",
        page_count,
        len(full_text),
        page_lengths,
        bool(document_annotation and document_annotation.strip()),
    )
    return OcrResult(
        page_count=page_count,
        full_text=full_text,
        page_text_lengths=page_lengths,
        document_annotation=document_annotation,
    )
