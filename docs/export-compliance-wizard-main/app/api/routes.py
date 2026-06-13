import base64
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.config import Settings, get_settings
from app.models.schemas import (
    ClassifyProductRequest,
    ClassifyProductResponse,
    DocumentsRequest,
    DocumentsResponse,
    DutiesRequest,
    DutiesResponse,
    HistoricalCnMatchResponse,
    HistoricalEvidenceResponse,
    HistorySearchRequest,
    LandedCostRequest,
    LandedCostResponse,
    LeadRequest,
    LeadResponse,
    PdfReportRequest,
    TransportCostRequest,
    TransportCostResponse,
    VatRequest,
    VatResponse,
)
from app.services.historical_search_service import search_historical_classifications
from app.services.classification_service import classify_product
from app.services.lead_service import send_lead_email
from app.services.document_service import get_document_requirements
from app.services.pdf_service import generate_pdf_report
from app.services.taric_service import get_duties
from app.services.transport_service import calculate_transport_cost
from app.services.vat_service import calculate_landed_cost, calculate_vat

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/classify-product", response_model=ClassifyProductResponse)
def classify_product_endpoint(payload: ClassifyProductRequest, settings: Settings = Depends(get_settings)):
    try:
        return classify_product(payload, settings)
    except Exception as exc:
        logger.exception("Product classification failed")
        raise HTTPException(status_code=500, detail="Product classification failed.") from exc


@router.post("/api/history/search", response_model=HistoricalEvidenceResponse)
def history_search_endpoint(payload: HistorySearchRequest):
    try:
        result = search_historical_classifications(
            payload.product_description,
            limit=payload.limit,
        )
        return HistoricalEvidenceResponse(
            query=result.query,
            database_available=result.database_available,
            matches_found=result.matches_found,
            total_declarations=result.total_declarations,
            validation_applied=False,
            strong_match_count=0,
            matches=[
                HistoricalCnMatchResponse(
                    cn_code=match.cn_code,
                    cn_digits=match.cn_digits,
                    heading_code=match.heading_code,
                    match_count=match.match_count,
                    confidence=match.confidence,
                    top_descriptions=list(match.top_descriptions),
                )
                for match in result.matches
            ],
        )
    except Exception as exc:
        logger.exception("Historical search failed")
        raise HTTPException(status_code=500, detail="Historical search failed.") from exc


@router.post("/calculate-transport", response_model=TransportCostResponse)
def calculate_transport_endpoint(payload: TransportCostRequest):
    try:
        return calculate_transport_cost(payload)
    except Exception as exc:
        logger.exception("Transport calculation failed")
        raise HTTPException(status_code=500, detail="Transport calculation failed.") from exc


@router.post("/documents", response_model=DocumentsResponse)
def documents_endpoint(payload: DocumentsRequest):
    try:
        return get_document_requirements(payload)
    except Exception as exc:
        logger.exception("Document requirement lookup failed")
        raise HTTPException(status_code=500, detail="Document requirement lookup failed.") from exc


@router.post("/duties", response_model=DutiesResponse)
def duties_endpoint(payload: DutiesRequest):
    try:
        return get_duties(payload)
    except Exception as exc:
        logger.exception("Duty lookup failed")
        raise HTTPException(status_code=500, detail="Duty lookup failed.") from exc


@router.post("/vat", response_model=VatResponse)
def vat_endpoint(payload: VatRequest):
    try:
        return calculate_vat(payload)
    except Exception as exc:
        logger.exception("VAT calculation failed")
        raise HTTPException(status_code=500, detail="VAT calculation failed.") from exc


@router.post("/landed-cost", response_model=LandedCostResponse)
def landed_cost_endpoint(payload: LandedCostRequest):
    try:
        return calculate_landed_cost(payload)
    except Exception as exc:
        logger.exception("Landed cost calculation failed")
        raise HTTPException(status_code=500, detail="Landed cost calculation failed.") from exc


@router.post("/leads", response_model=LeadResponse)
def submit_lead_endpoint(payload: LeadRequest, settings: Settings = Depends(get_settings)):
    try:
        send_lead_email(payload, settings)
    except RuntimeError as exc:
        logger.exception("Lead email not configured")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Lead submission failed")
        raise HTTPException(status_code=500, detail="Could not send your request. Please try again later.") from exc

    return LeadResponse(
        success=True,
        message="Thank you. Your request has been sent to ExportGateway.eu. We will respond shortly.",
    )


@router.post("/generate-pdf")
def generate_pdf_endpoint(payload: PdfReportRequest, download: bool = Query(default=False)):
    try:
        pdf_bytes = generate_pdf_report(payload)
    except Exception as exc:
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=500, detail="PDF generation failed.") from exc

    if download:
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="export-compliance-report.pdf"'},
        )

    return {
        "filename": "export-compliance-report.pdf",
        "content_type": "application/pdf",
        "base64_pdf": base64.b64encode(pdf_bytes).decode("ascii"),
    }
