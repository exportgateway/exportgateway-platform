from __future__ import annotations

import json
import logging
import re
from typing import Literal

from mistralai import Mistral
from mistralai.extra.utils.response_format import response_format_from_pydantic_model

from app.modules.export_auditor.destination_country import resolve_destination_from_consignee
from app.modules.export_auditor.extraction_schema import (
    DeliveryAddressSchema,
    ExtractedInvoiceSchema,
    ShipmentSummarySchema,
)
from app.modules.export_auditor.mistral_ocr import OcrResult
from app.modules.export_auditor.normalization import (
    normalize_country_name,
    normalize_vat_article,
    parse_total_value_numeric,
)
from app.modules.export_auditor.schemas import (
    DeliveryAddress,
    InvoiceItem,
    NormalizedInvoice,
    OcrMetadata,
    ShipmentSummary,
)
from app.modules.export_auditor.shipment_coverage import (
    compute_shipment_field_coverage,
    has_structured_shipment_data,
)
from app.modules.export_auditor.shipment_summary_extractor import (
    extract_delivery_address,
    extract_shipment_summary,
)

logger = logging.getLogger(__name__)

CHAT_EXTRACTION_SYSTEM = """You are an export compliance invoice extraction engine.
Extract structured invoice data from OCR text spanning one or more pages.
Return data that matches the provided JSON schema exactly.
Never summarize line items — extract every invoice table row.
Preserve full Incoterms including place names (example: DAP Beograd).
Extract invoice totals from total/subtotal/grand total fields.
Extract item_code for each line item from product/article/SKU columns.
Preserve full vat_article text exactly as printed, including leading "Article".

DESTINATION COUNTRY RULES (mandatory):
- country and country_code MUST be the consignee/importer/buyer destination country ONLY.
- NEVER set country from exporter address, seller location, or Incoterms place (EXW/FCA/DAP/CIP location).
- Parse consignee address for destination: MK-xxxx → North Macedonia (MK), RS-xxxx → Serbia (RS),
  BA-xxxx → Bosnia and Herzegovina (BA), AL-xxxx → Albania (AL), XK-xxxx → Kosovo (XK),
  ME-xxxx → Montenegro (ME).
- If consignee country and Incoterms location conflict, consignee country wins.

MULTILINGUAL SHIPMENT RULES (mandatory):
- Extract shipment_summary from footer/summary blocks and tables in ANY supported language.
- Gross weight labels: Gross Weight, Bruttogewicht, Bruto teža, Bruto Teža, Peso Lordo, Greutate Brută, Waga Brutto, etc.
- Net weight labels: Net Weight, Nettogewicht, Neto teža, Peso Netto, Greutate Netă, Waga Netto, etc.
- Package count labels: Packages, Colli, Koli, Kosov, Paketi, Stück, Nr. colete, Počet balení, Liczba opakowań, etc.
- Pallet count labels: Pallets, Palete, Paletten, Nr. paleti, Počet paliet, Liczba palet, etc.
- Always populate ocr_text with full shipment footer and consignee/delivery blocks when present.
"""

CHAT_EXTRACTION_USER = """Extract the complete commercial export invoice from the OCR text below.

The invoice has {page_count} page(s). Line items may continue across pages — include ALL rows.

OCR TEXT:
{ocr_text}
"""


def extract_invoice_from_ocr(
    ocr_result: OcrResult,
    api_key: str,
    model: str,
) -> NormalizedInvoice:
    extraction_source: Literal["document_annotation", "chat_fallback"] = "document_annotation"
    raw_response = ocr_result.document_annotation or ""

    if raw_response.strip():
        payload = _parse_json_payload(raw_response)
        invoice = _normalize_invoice_payload(payload, ocr_result.full_text)
    else:
        extraction_source = "chat_fallback"
        logger.warning(
            "OCR document_annotation missing; falling back to structured chat extraction"
        )
        invoice, raw_response = _extract_with_chat_schema(
            ocr_text=ocr_result.full_text,
            page_count=max(ocr_result.page_count, 1),
            api_key=api_key,
            model=model,
        )

    invoice = resolve_destination_from_consignee(invoice)
    invoice = _attach_ocr_metadata(
        invoice,
        ocr_result=ocr_result,
        extraction_source=extraction_source,
    )

    _log_extraction_quality_report(
        invoice=invoice,
        ocr_result=ocr_result,
        extraction_source=extraction_source,
        extraction_model=model,
        raw_response=raw_response,
    )
    return invoice


def _extract_with_chat_schema(
    ocr_text: str,
    page_count: int,
    api_key: str,
    model: str,
) -> tuple[NormalizedInvoice, str]:
    client = Mistral(api_key=api_key)
    response_format = response_format_from_pydantic_model(ExtractedInvoiceSchema)
    user_prompt = CHAT_EXTRACTION_USER.format(
        page_count=page_count,
        ocr_text=ocr_text[:200_000],
    )

    response = client.chat.complete(
        model=model,
        messages=[
            {"role": "system", "content": CHAT_EXTRACTION_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        response_format=response_format,
    )

    raw_content = _message_content(response.choices[0].message.content)
    payload = _parse_json_payload(raw_content)
    return _normalize_invoice_payload(payload, ocr_text), raw_content


def _message_content(raw_content: object) -> str:
    if isinstance(raw_content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in raw_content
        )
    return str(raw_content or "")


def _parse_json_payload(content: str) -> dict:
    content = content.strip()
    if not content:
        return {}

    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                pass
        logger.warning("Could not parse structured extraction JSON")
        return {}


def _as_string(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return str(value)
    return str(value).strip()


def _first_present(raw: dict, *keys: str) -> str:
    for key in keys:
        value = _as_string(raw.get(key))
        if value:
            return value
    return ""


def _normalize_item(raw_item: dict) -> InvoiceItem:
    return InvoiceItem(
        item_code=_first_present(
            raw_item,
            "item_code",
            "product_code",
            "sku",
            "article_number",
            "artikelnummer",
            "code",
        ),
        description=_first_present(raw_item, "description", "item_description", "product"),
        quantity=_first_present(raw_item, "quantity", "qty", "amount"),
        unit_price=_first_present(raw_item, "unit_price", "price", "unit_cost"),
        line_total=_first_present(raw_item, "line_total", "total", "amount", "value"),
        hs_code=_first_present(
            raw_item,
            "hs_code",
            "tariff_code",
            "tariff",
            "cn_code",
            "customs_code",
            "hs_tariff_code",
        ),
        country_of_origin=_first_present(
            raw_item,
            "country_of_origin",
            "origin",
            "country_origin",
            "coo",
        ),
    )


def _schema_to_shipment_summary(schema: ShipmentSummarySchema) -> ShipmentSummary:
    return ShipmentSummary(
        package_count=schema.package_count,
        package_type=schema.package_type,
        pallet_count=schema.pallet_count,
        gross_weight_total=schema.gross_weight_total,
        gross_weight_unit=schema.gross_weight_unit,
        net_weight_total=schema.net_weight_total,
        net_weight_unit=schema.net_weight_unit,
        pallet_dimensions=schema.pallet_dimensions,
    )


def _dataclass_to_shipment_summary(extracted) -> ShipmentSummary:
    return ShipmentSummary(
        package_count=extracted.package_count,
        package_type=extracted.package_type,
        pallet_count=extracted.pallet_count,
        gross_weight_total=extracted.gross_weight_total,
        gross_weight_unit=extracted.gross_weight_unit,
        net_weight_total=extracted.net_weight_total,
        net_weight_unit=extracted.net_weight_unit,
        pallet_dimensions=extracted.pallet_dimensions,
    )


def _merge_shipment_summary(
    annotated: ShipmentSummary | None,
    corpus: str,
) -> ShipmentSummary:
    """Prefer structured annotation; fill gaps from OCR corpus regex extraction."""
    from_corpus = _dataclass_to_shipment_summary(extract_shipment_summary(corpus))
    if annotated is None:
        return from_corpus

    return ShipmentSummary(
        package_count=annotated.package_count if annotated.package_count is not None else from_corpus.package_count,
        package_type=annotated.package_type or from_corpus.package_type,
        pallet_count=annotated.pallet_count if annotated.pallet_count is not None else from_corpus.pallet_count,
        gross_weight_total=(
            annotated.gross_weight_total
            if annotated.gross_weight_total is not None
            else from_corpus.gross_weight_total
        ),
        gross_weight_unit=annotated.gross_weight_unit or from_corpus.gross_weight_unit,
        net_weight_total=(
            annotated.net_weight_total
            if annotated.net_weight_total is not None
            else from_corpus.net_weight_total
        ),
        net_weight_unit=annotated.net_weight_unit or from_corpus.net_weight_unit,
        pallet_dimensions=annotated.pallet_dimensions or from_corpus.pallet_dimensions,
    )


def _schema_to_delivery_address(schema: DeliveryAddressSchema) -> DeliveryAddress:
    return DeliveryAddress(
        company=schema.company,
        address=schema.address,
        city=schema.city,
        postal_code=schema.postal_code,
        country=schema.country,
        country_code=schema.country_code,
    )


def _merge_delivery_address(
    annotated: DeliveryAddress | None,
    corpus: str,
) -> DeliveryAddress | None:
    extracted = extract_delivery_address(corpus)
    if annotated is None and not any(
        [
            extracted.company,
            extracted.address,
            extracted.city,
            extracted.postal_code,
            extracted.country,
            extracted.country_code,
        ]
    ):
        return None

    if annotated is None:
        return DeliveryAddress(
            company=extracted.company,
            address=extracted.address,
            city=extracted.city,
            postal_code=extracted.postal_code,
            country=extracted.country,
            country_code=extracted.country_code,
        )

    return DeliveryAddress(
        company=annotated.company or extracted.company,
        address=annotated.address or extracted.address,
        city=annotated.city or extracted.city,
        postal_code=annotated.postal_code or extracted.postal_code,
        country=annotated.country or extracted.country,
        country_code=annotated.country_code or extracted.country_code,
    )


def _normalize_invoice_payload(payload: dict, ocr_corpus: str = "") -> NormalizedInvoice:
    raw_items = payload.get("items") or []
    items: list[InvoiceItem] = []
    for raw_item in raw_items:
        if isinstance(raw_item, dict):
            items.append(_normalize_item(raw_item))

    cleaned_payload = {k: v for k, v in payload.items() if k not in {"grand_total", "total", "total_amount"}}
    cleaned_payload["items"] = [
        {
            "item_code": item.item_code,
            "description": item.description,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "line_total": item.line_total,
            "hs_code": item.hs_code,
            "country_of_origin": item.country_of_origin,
        }
        for item in items
    ]
    cleaned_payload["total_value"] = _first_present(
        payload,
        "total_value",
        "total",
        "grand_total",
        "invoice_total",
        "amount_total",
        "total_amount",
    )
    validated = ExtractedInvoiceSchema.model_validate(cleaned_payload)

    flags = validated.document_flags.model_dump()
    raw_flags = payload.get("document_flags")
    if isinstance(raw_flags, dict):
        flags.update({str(k): v for k, v in raw_flags.items()})

    total_value = _first_present(
        payload,
        "total_value",
        "total",
        "grand_total",
        "invoice_total",
        "amount_total",
        "total_amount",
    ) or validated.total_value
    raw_country = _first_present(payload, "country", "destination_country") or validated.country
    country_code = (
        _first_present(payload, "country_code", "destination_country_code").upper()
        or validated.country_code.upper()
    )
    raw_vat = _first_present(
        payload,
        "vat_article",
        "vat_number",
        "tax_id",
        "vat_id",
    ) or validated.vat_article

    annotated_shipment = _schema_to_shipment_summary(validated.shipment_summary)
    shipment_summary = _merge_shipment_summary(annotated_shipment, ocr_corpus)

    annotated_delivery = _schema_to_delivery_address(validated.delivery_address)
    delivery_address = _merge_delivery_address(annotated_delivery, ocr_corpus)

    ocr_text = _first_present(payload, "ocr_text") or validated.ocr_text or ocr_corpus

    return NormalizedInvoice(
        invoice_number=_first_present(payload, "invoice_number", "invoice_no", "invoice_id")
        or validated.invoice_number,
        invoice_date=_first_present(payload, "invoice_date", "date", "issue_date")
        or validated.invoice_date,
        exporter=_first_present(payload, "exporter", "seller", "supplier") or validated.exporter,
        consignee=_first_present(payload, "consignee", "buyer", "customer", "importer")
        or validated.consignee,
        country=normalize_country_name(raw_country),
        country_code=country_code,
        incoterms=_first_present(payload, "incoterms", "incoterm", "delivery_terms")
        or validated.incoterms,
        currency=_first_present(payload, "currency", "currency_code").upper()
        or validated.currency.upper(),
        total_value=total_value,
        total_value_numeric=parse_total_value_numeric(total_value),
        vat_article=normalize_vat_article(raw_vat),
        items=items,
        document_flags=flags,
        shipment_summary=shipment_summary,
        delivery_address=delivery_address,
        ocr_text=ocr_text,
    )


def _attach_ocr_metadata(
    invoice: NormalizedInvoice,
    *,
    ocr_result: OcrResult,
    extraction_source: str,
) -> NormalizedInvoice:
    detected, missing = compute_shipment_field_coverage(invoice.shipment_summary)
    delivery = invoice.delivery_address
    has_delivery = delivery is not None and any(
        [
            delivery.company,
            delivery.address,
            delivery.city,
            delivery.postal_code,
            delivery.country,
            delivery.country_code,
        ]
    )

    metadata = OcrMetadata(
        page_count=ocr_result.page_count,
        ocr_text_length=len(invoice.ocr_text or ocr_result.full_text),
        extraction_source=extraction_source,
        shipment_fields_detected=detected,
        shipment_fields_missing=missing,
        raw_ocr_has_shipment_summary=has_structured_shipment_data(invoice.shipment_summary),
        raw_ocr_has_ocr_text=bool((invoice.ocr_text or ocr_result.full_text).strip()),
        raw_ocr_has_delivery_address=has_delivery,
    )
    return invoice.model_copy(update={"ocr_metadata": metadata})


def _log_extraction_quality_report(
    *,
    invoice: NormalizedInvoice,
    ocr_result: OcrResult,
    extraction_source: str,
    extraction_model: str,
    raw_response: str,
) -> None:
    items_with_hs = sum(1 for item in invoice.items if item.hs_code.strip())
    items_with_origin = sum(1 for item in invoice.items if item.country_of_origin.strip())
    items_with_totals = sum(1 for item in invoice.items if item.line_total.strip())
    items_with_code = sum(1 for item in invoice.items if item.item_code.strip())
    shipment = invoice.shipment_summary
    detected, missing = compute_shipment_field_coverage(shipment)

    report = {
        "extraction_source": extraction_source,
        "extraction_model": extraction_model,
        "ocr_page_count": ocr_result.page_count,
        "ocr_text_length": len(ocr_result.full_text),
        "ocr_page_lengths": ocr_result.page_text_lengths,
        "raw_response_length": len(raw_response),
        "invoice_number_present": bool(invoice.invoice_number),
        "total_value_present": bool(invoice.total_value),
        "total_value_numeric": invoice.total_value_numeric,
        "incoterms": invoice.incoterms,
        "items_extracted": len(invoice.items),
        "items_with_item_code": items_with_code,
        "items_with_hs_code": items_with_hs,
        "items_with_country_of_origin": items_with_origin,
        "items_with_line_total": items_with_totals,
        "shipment_fields_detected": detected,
        "shipment_fields_missing": missing,
        "gross_weight_total": shipment.gross_weight_total if shipment else None,
        "package_count": shipment.package_count if shipment else None,
    }
    logger.info("Extraction quality report: %s", json.dumps(report, ensure_ascii=False))
    logger.debug("Extraction model raw response: %s", raw_response[:8000])
