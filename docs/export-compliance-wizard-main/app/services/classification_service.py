import logging

from app.core.config import Settings
from app.models.schemas import (
    ClassifyProductRequest,
    ClassifyProductResponse,
    CnSuggestion,
    CprSummary,
    DetectedAttributes,
    HistoricalCnMatchResponse,
    HistoricalEvidenceResponse,
)
from app.services.classification_pipeline import run_classification_pipeline
from app.services.classification_policy import ClassificationState
from app.services.cn_hierarchy_display import enrich_cn_suggestion
from app.services.nomenclature_service import (
    cn_digits,
    lookup_by_digits,
    normalize_cn_code,
)
from app.services.product_understanding_service import understand_product

logger = logging.getLogger(__name__)


def _understanding_fields(understanding) -> dict:
    return {
        "original_description": understanding.original_text,
        "translated_description": understanding.english_description,
        "detected_language": understanding.detected_language,
        "detected_language_name": understanding.detected_language_name,
        "language_detection_method": understanding.language_detection_method,
        "language_detection_confidence": understanding.language_detection_confidence,
        "translation_engine": understanding.understanding_engine,
        "translation_engine_display": understanding.translation_engine_display,
        "translation_used": understanding.understanding_ok
        and understanding.detected_language != "en",
    }


def _cpr_summary(cpr) -> CprSummary:
    return CprSummary(**cpr.summary())


def _historical_evidence_response(result) -> HistoricalEvidenceResponse | None:
    search = result.historical_evidence
    summary = result.historical_validation
    if search is None and summary is None:
        return None
    matches = []
    if search is not None:
        matches = [
            HistoricalCnMatchResponse(
                cn_code=match.cn_code,
                cn_digits=match.cn_digits,
                heading_code=match.heading_code,
                match_count=match.match_count,
                confidence=match.confidence,
                top_descriptions=list(match.top_descriptions),
            )
            for match in search.matches
        ]
    return HistoricalEvidenceResponse(
        query=search.query if search is not None else result.classification_text,
        database_available=summary.database_available if summary else False,
        matches_found=search.matches_found if search is not None else 0,
        total_declarations=search.total_declarations if search is not None else 0,
        validation_applied=summary.validation_applied if summary else False,
        strong_match_count=summary.strong_match_count if summary else 0,
        matches=matches,
    )


def classify_product(payload: ClassifyProductRequest, settings: Settings) -> ClassifyProductResponse:
    if payload.cn_code:
        understanding = understand_product(payload.product_description)
        understanding_meta = _understanding_fields(understanding)
        digits = cn_digits(payload.cn_code)
        entry = lookup_by_digits(digits) if len(digits) >= 8 else None
        formatted = normalize_cn_code(payload.cn_code)

        if entry:
            suggestion = enrich_cn_suggestion(
                cn_code=entry.cn_code,
                description=entry.description,
                confidence_level=1.0,
                match_explanation=(
                    "User-provided CN code matches an entry in the EU Combined Nomenclature index."
                ),
                matched_keywords=[entry.cn_code.replace(" ", "")],
            )
            return ClassifyProductResponse(
                product_description=payload.product_description,
                suggestions=[suggestion],
                cn_code=entry.cn_code,
                confidence_level=1.0,
                source="user-provided",
                user_provided=True,
                requires_manual_entry=False,
                requires_assistance=False,
                requires_expert_review=False,
                classification_state=ClassificationState.SUGGEST.value,
                **understanding_meta,
            )

        return ClassifyProductResponse(
            product_description=payload.product_description,
            suggestions=[],
            cn_code=formatted if len(digits) >= 8 else None,
            confidence_level=None,
            source="user-provided-unverified",
            user_provided=True,
            requires_manual_entry=True,
            requires_assistance=False,
            requires_expert_review=False,
            **understanding_meta,
        )

    result = run_classification_pipeline(
        payload.product_description,
        disambiguation=payload.disambiguation,
        historical_validation_enabled=payload.historical_validation_enabled,
    )
    understanding_meta = _understanding_fields(result.understanding)
    historical_payload = (
        _historical_evidence_response(result) if payload.include_historical_evidence else None
    )

    return ClassifyProductResponse(
        product_description=payload.product_description,
        suggestions=result.suggestions,
        cn_code=None,
        confidence_level=result.suggestions[0].confidence_level if result.suggestions else None,
        source="eu-cn-nomenclature-search",
        user_provided=False,
        requires_manual_entry=result.requires_manual_entry,
        requires_assistance=result.requires_assistance,
        requires_expert_review=result.requires_expert_review,
        classification_state=result.state.value,
        classification_run_id=result.classification_run_id,
        data_quality_score=result.cpr.data_quality_score,
        cpr=_cpr_summary(result.cpr),
        disambiguation_questions=result.disambiguation_questions,
        detected_attributes=(
            DetectedAttributes(**result.detected_attributes.to_dict())
            if result.detected_attributes and result.detected_attributes.has_any()
            else None
        ),
        auto_answered_questions=result.auto_answered_questions or [],
        historical_evidence=historical_payload,
        historical_validation_applied=bool(
            result.historical_validation and result.historical_validation.validation_applied
        ),
        **understanding_meta,
    )
