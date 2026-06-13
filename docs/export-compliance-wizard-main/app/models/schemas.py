from datetime import date
from enum import Enum
from typing import List

from pydantic import BaseModel, EmailStr, Field, model_validator


class Incoterm(str, Enum):
    EXW = "EXW"
    FCA = "FCA"
    CPT = "CPT"
    CIP = "CIP"
    DAP = "DAP"
    DDP = "DDP"


class TransportMode(str, Enum):
    ROAD = "Road"
    SEA = "Sea"
    AIR = "Air"


class VehicleType(str, Enum):
    VAN = "Van"
    TRUCK_7_5T = "7.5t Truck"
    TRUCK_13_6M = "13.6m Truck"
    MEGA_TRAILER = "Mega Trailer"


class DisambiguationOption(BaseModel):
    id: str
    label: str


class DisambiguationQuestion(BaseModel):
    id: str
    prompt: str
    options: List[DisambiguationOption] = Field(default_factory=list)


class DetectedAttributes(BaseModel):
    gender: str | None = None
    material: str | None = None
    fabric: str | None = None
    construction: str | None = None


class CprSummary(BaseModel):
    normalized_description: str
    data_quality_score: float = Field(ge=0, le=1)
    product_families: List[str] = Field(default_factory=list)
    allowed_chapters: List[str] = Field(default_factory=list)
    excluded_chapters: List[str] = Field(default_factory=list)
    pending_disambiguation: List[str] = Field(default_factory=list)
    commercial_product_ids: List[str] = Field(default_factory=list)
    trade_names: List[str] = Field(default_factory=list)
    invoice_enrichment: str = ""


class HistoricalCnMatchResponse(BaseModel):
    cn_code: str
    cn_digits: str
    heading_code: str
    match_count: int
    confidence: float = Field(ge=0, le=1)
    top_descriptions: List[str] = Field(default_factory=list)


class HistoricalEvidenceResponse(BaseModel):
    query: str
    database_available: bool
    matches_found: int
    total_declarations: int = 0
    validation_applied: bool = False
    strong_match_count: int = 0
    matches: List[HistoricalCnMatchResponse] = Field(default_factory=list)


class HistorySearchRequest(BaseModel):
    product_description: str = Field(..., min_length=3, max_length=500)
    limit: int = Field(default=5, ge=1, le=20)


class ClassifyProductRequest(BaseModel):
    product_description: str = Field(..., min_length=3, max_length=500)
    cn_code: str | None = Field(default=None, max_length=12)
    disambiguation: dict[str, str] | None = Field(
        default=None,
        description="Answers to disambiguation questions, e.g. textile_construction=woven",
    )
    include_historical_evidence: bool = Field(
        default=False,
        description="Attach AES historical search results to the response.",
    )
    historical_validation_enabled: bool = Field(
        default=True,
        description="Apply capped AES historical validation bonus to ranking.",
    )


class CnHierarchyLevel(BaseModel):
    level: str
    code: str = ""
    description: str


class PdfAlternateClassification(BaseModel):
    cn_code: str
    combined_description: str | None = None
    description: str | None = None
    confidence_level: float | None = Field(default=None, ge=0, le=1)
    chapter_code: str | None = None
    heading_code: str | None = None


class CnSuggestion(BaseModel):
    cn_code: str
    description: str
    confidence_level: float = Field(..., ge=0, le=1)
    match_explanation: str
    matched_keywords: List[str] = Field(default_factory=list)
    chapter_code: str | None = None
    chapter_title: str | None = None
    heading_code: str | None = None
    heading_title: str | None = None
    combined_description: str | None = None
    hierarchy_levels: List[CnHierarchyLevel] = Field(default_factory=list)


class ClassifyProductResponse(BaseModel):
    product_description: str
    original_description: str | None = None
    translated_description: str | None = None
    detected_language: str | None = None
    detected_language_name: str | None = None
    language_detection_method: str | None = None
    language_detection_confidence: float | None = Field(default=None, ge=0, le=1)
    translation_engine: str | None = None
    translation_engine_display: str | None = None
    translation_used: bool = False
    suggestions: List[CnSuggestion] = Field(default_factory=list)
    cn_code: str | None = None
    confidence_level: float | None = Field(default=None, ge=0, le=1)
    source: str
    user_provided: bool = False
    requires_manual_entry: bool = False
    requires_assistance: bool = False
    requires_expert_review: bool = False
    classification_state: str | None = None
    classification_run_id: str | None = None
    data_quality_score: float | None = Field(default=None, ge=0, le=1)
    cpr: CprSummary | None = None
    disambiguation_questions: List[DisambiguationQuestion] = Field(default_factory=list)
    detected_attributes: DetectedAttributes | None = None
    auto_answered_questions: List[str] = Field(default_factory=list)
    historical_evidence: HistoricalEvidenceResponse | None = None
    historical_validation_applied: bool = False


class ShipmentDetails(BaseModel):
    origin_country: str = Field(..., min_length=2, max_length=80)
    destination_country: str = Field(..., min_length=2, max_length=80)
    goods_value_eur: float = Field(..., gt=0)
    net_weight_kg: float = Field(..., gt=0)
    gross_weight_kg: float = Field(..., gt=0)
    incoterm: Incoterm
    transport_mode: TransportMode

    @model_validator(mode="after")
    def gross_weight_must_cover_net(self) -> "ShipmentDetails":
        if self.gross_weight_kg < self.net_weight_kg:
            raise ValueError("Gross weight must be greater than or equal to net weight.")
        return self


class TransportCostRequest(BaseModel):
    pickup_postal_code: str = Field(..., min_length=2, max_length=16)
    delivery_postal_code: str = Field(..., min_length=2, max_length=16)
    weight_kg: float = Field(..., gt=0)
    loading_meters: float = Field(default=0, ge=0)
    vehicle_type: VehicleType
    mode: TransportMode = TransportMode.ROAD


class TransportCostResponse(BaseModel):
    estimated_cost_eur: float
    currency: str = "EUR"
    method: str
    assumptions: List[str]


class DocumentsRequest(BaseModel):
    origin_country: str
    destination_country: str
    shipment_type: str = "Commercial goods"
    incoterm: Incoterm
    transport_mode: TransportMode = TransportMode.ROAD


class DocumentsResponse(BaseModel):
    required_documents: List[str]
    optional_documents: List[str]
    additional_notes: List[str]
    route_type: str | None = None
    route_message: str | None = None


class DutiesRequest(BaseModel):
    cn_code: str = Field(..., min_length=4, max_length=12)
    origin_country: str
    destination_country: str
    goods_value_eur: float = Field(..., gt=0)


class TaricMeasure(BaseModel):
    code: str
    description: str


class DutiesResponse(BaseModel):
    cn_code: str
    duty_rate_percent: float
    measures: List[TaricMeasure]
    restrictions: List[TaricMeasure]
    certificates: List[TaricMeasure]
    source: str
    route_type: str | None = None
    route_message: str | None = None
    customs_duty_applicable: bool = True


class VatRequest(BaseModel):
    goods_value_eur: float = Field(..., gt=0)
    transport_cost_eur: float = Field(..., ge=0)
    duty_rate_percent: float = Field(..., ge=0)
    origin_country: str
    destination_country: str


class VatResponse(BaseModel):
    goods_value_eur: float
    transport_cost_eur: float
    duty_amount_eur: float
    customs_value_eur: float
    vat_rate_percent: float | None = None
    vat_amount_eur: float
    total_import_charges_eur: float
    import_vat_applicable: bool = True
    vat_rate_available: bool = True
    vat_rate_source: str = "Official EU VAT Table"
    route_type: str | None = None
    route_message: str | None = None
    warning: str | None = None


class LandedCostRequest(VatRequest):
    pass


class LandedCostResponse(BaseModel):
    goods_value_eur: float
    transport_cost_eur: float
    customs_duty_eur: float
    import_vat_eur: float
    total_landed_cost_eur: float
    route_type: str | None = None
    route_message: str | None = None
    import_vat_applicable: bool = True
    warning: str | None = None


class PdfReportRequest(BaseModel):
    report_date: date = Field(default_factory=date.today)
    origin_country: str
    destination_country: str
    product_description: str
    cn_code: str
    required_documents: List[str]
    duty_rate_percent: float
    duty_amount_eur: float
    vat_rate_percent: float
    vat_amount_eur: float
    transport_cost_eur: float
    total_landed_cost_eur: float
    classification_confidence: float | None = Field(default=None, ge=0, le=1)
    classification_source: str | None = None
    classification_combined_description: str | None = None
    classification_chapter_code: str | None = None
    classification_chapter_title: str | None = None
    classification_heading_code: str | None = None
    classification_heading_title: str | None = None
    classification_cn8_description: str | None = None
    classification_hierarchy_levels: List[CnHierarchyLevel] = Field(default_factory=list)
    alternate_classifications: List[PdfAlternateClassification] = Field(default_factory=list)
    duties_source: str | None = None
    transport_source: str | None = None
    incoterm: str | None = None
    transport_mode: str | None = None
    goods_value_eur: float | None = Field(default=None, gt=0)
    net_weight_kg: float | None = Field(default=None, gt=0)
    gross_weight_kg: float | None = Field(default=None, gt=0)
    customs_duty_eur: float | None = Field(default=None, ge=0)


class LeadRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=120)
    contact_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    origin_country: str = Field(..., min_length=2, max_length=80)
    destination_country: str = Field(..., min_length=2, max_length=80)
    product_description: str = Field(..., min_length=3, max_length=500)
    cn_code: str = Field(..., min_length=4, max_length=20)
    wizard_summary: str = Field(..., min_length=10, max_length=4000)


class LeadResponse(BaseModel):
    success: bool = True
    message: str
