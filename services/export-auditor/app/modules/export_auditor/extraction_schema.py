from pydantic import BaseModel, ConfigDict, Field


class DocumentFlagsSchema(BaseModel):
    """Fixed document flags schema for Mistral structured OCR extraction."""

    model_config = ConfigDict(extra="forbid")

    commercial_invoice: bool = False
    packing_list_referenced: bool = False
    certificate_of_origin_referenced: bool = False
    proforma_invoice: bool = False
    delivery_note_referenced: bool = False


class ShipmentSummarySchema(BaseModel):
    """Shipment-level logistics data for export declarations."""

    model_config = ConfigDict(extra="forbid")

    package_count: int | None = None
    package_type: str | None = Field(
        default=None,
        description="Package type such as COLLI, CT, or PALLET from shipment summary only.",
    )
    pallet_count: int | None = Field(
        default=None,
        description=(
            "Number of pallets (Palete, Paletten, Nr. paleti, Počet paliet, Liczba palet, etc.)."
        ),
    )
    gross_weight_total: float | None = Field(
        default=None,
        description=(
            "Total gross/brutto shipment weight. Labels: Gross Weight, Bruttogewicht, "
            "Bruto Teža, Peso Lordo, Greutate Brută, Waga Brutto, etc."
        ),
    )
    gross_weight_unit: str | None = Field(
        default=None,
        description="Unit for gross shipment weight, e.g. kg.",
    )
    net_weight_total: float | None = Field(
        default=None,
        description=(
            "Total net/netto shipment weight. Labels: Net Weight, Nettogewicht, "
            "Neto Teža, Peso Netto, Greutate Netă, Waga Netto, etc."
        ),
    )
    net_weight_unit: str | None = Field(
        default=None,
        description="Unit for net shipment weight, e.g. kg.",
    )
    pallet_dimensions: str | None = Field(
        default=None,
        description="Pallet dimensions such as 80x62x62 cm from shipment summary only.",
    )


class DeliveryAddressSchema(BaseModel):
    """Delivery address — separate from consignee/importer."""

    model_config = ConfigDict(extra="forbid")

    company: str | None = None
    address: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    country_code: str | None = None


class ExtractedInvoiceItemSchema(BaseModel):
    """Line item schema used for Mistral structured extraction."""

    model_config = ConfigDict(extra="forbid")

    item_code: str = Field(
        default="",
        description="Supplier or product item code such as HONMB-PN002 or ADI033442.21.",
    )
    description: str = ""
    quantity: str = ""
    unit_price: str = ""
    line_total: str = ""
    hs_code: str = Field(
        default="",
        description="Tariff, HS, CN, or customs classification code for the line item.",
    )
    country_of_origin: str = ""


class ExtractedInvoiceSchema(BaseModel):
    """Strict invoice schema passed to Mistral document_annotation_format."""

    model_config = ConfigDict(extra="forbid")

    invoice_number: str = ""
    invoice_date: str = ""
    exporter: str = ""
    consignee: str = ""
    country: str = Field(
        default="",
        description=(
            "Destination country of the consignee/importer/buyer only. "
            "NEVER the exporter, seller, or Incoterms place."
        ),
    )
    country_code: str = Field(
        default="",
        description=(
            "ISO 3166-1 alpha-2 code for the consignee/importer destination country. "
            "NEVER the exporter country or Incoterms location code (e.g. not SI from EXW SI-1000)."
        ),
    )
    incoterms: str = Field(
        default="",
        description="Full Incoterms text including place, e.g. 'DAP Beograd'. Place is NOT destination country.",
    )
    currency: str = ""
    total_value: str = Field(
        default="",
        description="Invoice grand total / total amount as printed on the invoice.",
    )
    vat_article: str = Field(
        default="",
        description=(
            "Full VAT legal article text exactly as printed, "
            "e.g. 'Article 52 item a) Paragraph 1...'."
        ),
    )
    items: list[ExtractedInvoiceItemSchema] = Field(default_factory=list)
    document_flags: DocumentFlagsSchema = Field(default_factory=DocumentFlagsSchema)
    shipment_summary: ShipmentSummarySchema = Field(default_factory=ShipmentSummarySchema)
    delivery_address: DeliveryAddressSchema = Field(default_factory=DeliveryAddressSchema)
    ocr_text: str = Field(
        default="",
        description="Supplementary OCR text blocks including shipment summary and delivery address.",
    )
