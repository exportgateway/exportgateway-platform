"""Pydantic models for NormalizedInvoice API — copy into export-auditor schemas.py or merge."""

from pydantic import BaseModel, ConfigDict, Field


class InvoiceItem(BaseModel):
    item_code: str = ""
    description: str = ""
    quantity: str = ""
    unit_price: str = ""
    line_total: str = ""
    hs_code: str = ""
    country_of_origin: str = ""


class ShipmentSummary(BaseModel):
    """Shipment-level logistics returned by POST /export-auditor/ocr."""

    model_config = ConfigDict(extra="ignore")

    package_count: int | None = None
    package_type: str | None = None
    pallet_count: int | None = None
    gross_weight_total: float | None = None
    gross_weight_unit: str | None = None
    net_weight_total: float | None = None
    net_weight_unit: str | None = None
    pallet_dimensions: str | None = None


class DeliveryAddress(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company: str | None = None
    address: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    country_code: str | None = None


class OcrMetadata(BaseModel):
    """OCR pipeline observability attached to NormalizedInvoice."""

    model_config = ConfigDict(extra="ignore")

    page_count: int | None = None
    ocr_text_length: int | None = None
    pdf_text_length: int | None = None
    extraction_source: str | None = None
    shipment_fields_detected: list[str] = Field(default_factory=list)
    shipment_fields_missing: list[str] = Field(default_factory=list)
    raw_ocr_has_shipment_summary: bool = False
    raw_ocr_has_ocr_text: bool = False
    raw_ocr_has_delivery_address: bool = False


class NormalizedInvoice(BaseModel):
    """Normalized export invoice JSON used across OCR, readiness, and disposition."""

    model_config = ConfigDict(extra="ignore")

    invoice_number: str = ""
    invoice_date: str = ""
    exporter: str = ""
    consignee: str = ""
    country: str = ""
    country_code: str = ""
    incoterms: str = ""
    currency: str = ""
    total_value: str = ""
    total_value_numeric: float | None = None
    vat_article: str = ""
    items: list[InvoiceItem] = Field(default_factory=list)
    document_flags: dict[str, bool | str | int | float] = Field(default_factory=dict)
    shipment_summary: ShipmentSummary | None = None
    delivery_address: DeliveryAddress | None = None
    ocr_text: str = ""
    ocr_metadata: OcrMetadata | None = None
