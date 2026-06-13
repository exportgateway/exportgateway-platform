"""Phase A classification pipeline — CPR, taxonomy, chapter filter, policy."""

from __future__ import annotations

from dataclasses import dataclass

from app.models.cpr import CanonicalProductRecord
from app.models.schemas import CnSuggestion, CprSummary, DisambiguationOption, DisambiguationQuestion
from app.services.classification_audit import record_classification_run
from app.services.classification_policy import (
    ClassificationState,
    apply_confidence_policy,
    decide_classification_state,
    requires_expert_review,
)
from app.services.cn_database import search_nomenclature
from app.services.cn_hierarchy_display import enrich_cn_suggestion
from app.services.cn_entities import ProductEntities, extract_product_entities
from app.services.commercial_product_service import recognize_commercial_products
from app.services.cpr_service import build_cpr
from app.services.lexicon_service import apply_customs_lexicon
from app.services.polysemy_service import apply_polysemy_context
from app.services.openai_taxonomy_bridge import DetectedAttributes, merge_openai_taxonomy_answers
from app.services.product_understanding_service import (
    ProductUnderstandingResult,
    understand_product,
)
from app.services.taxonomy_service import (
    ChapterConstraints,
    detect_families,
    get_disambiguation_questions,
    resolve_chapter_constraints,
)
from app.services.aes_knowledge_engine import (
    AesKnowledgeSummary,
    build_aes_knowledge_context,
    summarize_aes_knowledge,
)
from app.services.brand_knowledge import BrandKnowledgeContext, build_brand_knowledge_context
from app.services.historical_validation import (
    HistoricalValidationSummary,
    build_validation_context,
    summarize_validation,
)
from app.services.universal_product_profile import build_universal_profile


@dataclass
class PipelineResult:
    understanding: ProductUnderstandingResult
    cpr: CanonicalProductRecord
    classification_text: str
    state: ClassificationState
    suggestions: list[CnSuggestion]
    disambiguation_questions: list[DisambiguationQuestion]
    classification_run_id: str
    requires_manual_entry: bool
    requires_assistance: bool
    requires_expert_review: bool
    detected_attributes: DetectedAttributes | None = None
    auto_answered_questions: list[str] | None = None
    historical_validation: HistoricalValidationSummary | None = None
    historical_evidence: object | None = None
    aes_knowledge: AesKnowledgeSummary | None = None
    brand_knowledge: BrandKnowledgeContext | None = None

    @property
    def translation(self) -> ProductUnderstandingResult:
        """Backward-compatible alias for audit/API formatters."""
        return self.understanding


def run_classification_pipeline(
    product_description: str,
    *,
    disambiguation: dict[str, str] | None = None,
    historical_validation_enabled: bool = True,
) -> PipelineResult:
    understanding = understand_product(product_description)
    merged_disambiguation, auto_answered, detected_attributes = merge_openai_taxonomy_answers(
        understanding,
        user_disambiguation=disambiguation,
    )
    lexicon_text, lexicon_concepts, lexicon_families = apply_customs_lexicon(
        understanding.english_description,
        understanding.detected_language,
    )
    classification_text = lexicon_text or understanding.english_description
    if understanding.search_terms:
        classification_text = (
            f"{classification_text} {' '.join(understanding.search_terms)}"
        ).strip()

    commercial = recognize_commercial_products(
        commercial_description=understanding.original_text,
        english_text=classification_text,
    )
    if commercial.text_enrichment:
        classification_text = f"{classification_text} {commercial.text_enrichment}".strip()

    polysemy = apply_polysemy_context(classification_text)
    classification_text = polysemy.enriched_text

    entities = extract_product_entities(classification_text)
    if commercial.excluded_tokens or commercial.model_spans:
        entities = ProductEntities(
            brands=entities.brands,
            vehicle_types=entities.vehicle_types,
            product_families=entities.product_families,
            condition=entities.condition,
            excluded_tokens=frozenset(set(entities.excluded_tokens) | set(commercial.excluded_tokens)),
            model_spans=tuple(dict.fromkeys([*entities.model_spans, *commercial.model_spans])),
            is_vehicle=entities.is_vehicle,
            is_industrial_sensor=entities.is_industrial_sensor,
            is_industrial_automation=entities.is_industrial_automation,
            chapter_hints=entities.chapter_hints,
            heading_hints=entities.heading_hints,
            search_terms=entities.search_terms,
            search_enrichment=entities.search_enrichment,
            penalized_headings=entities.penalized_headings,
        )
    if entities.search_enrichment:
        classification_text = f"{classification_text} {entities.search_enrichment}".strip()

    universal_profile = build_universal_profile(
        understanding,
        classification_text=classification_text,
        entity_family_ids=list(entities.product_families),
    )
    entities = ProductEntities(
        brands=entities.brands,
        vehicle_types=entities.vehicle_types,
        product_families=tuple(
            dict.fromkeys(
                [
                    *universal_profile.taxonomy_family_ids,
                    *entities.product_families,
                ]
            )
        ),
        condition=entities.condition,
        excluded_tokens=entities.excluded_tokens,
        model_spans=entities.model_spans,
        is_vehicle=entities.is_vehicle,
        is_industrial_sensor=entities.is_industrial_sensor,
        is_industrial_automation=entities.is_industrial_automation,
        chapter_hints=entities.chapter_hints,
        heading_hints=entities.heading_hints,
        search_terms=entities.search_terms,
        search_enrichment=entities.search_enrichment,
        penalized_headings=entities.penalized_headings,
        attribute_material=entities.attribute_material,
        attribute_fabric=entities.attribute_fabric,
        attribute_construction=entities.attribute_construction,
        attribute_gender=entities.attribute_gender,
        universal_product_family=universal_profile.product_family,
        universal_product_type=universal_profile.product_type,
        universal_material=universal_profile.material,
        universal_function=universal_profile.function,
        universal_industry=universal_profile.industry,
    )

    extra_families = list(
        dict.fromkeys(
            [
                *universal_profile.taxonomy_family_ids,
                *understanding.product_families,
                *lexicon_families,
                *entities.product_families,
                *polysemy.family_ids,
                *commercial.family_ids,
            ]
        )
    )
    family_matches = detect_families(
        classification_text,
        extra_family_ids=extra_families,
    )
    seen_family_ids = {match.family_id for match in family_matches}
    for match in detect_families(
        understanding.original_text,
        extra_family_ids=extra_families,
    ):
        if match.family_id not in seen_family_ids:
            family_matches.append(match)
            seen_family_ids.add(match.family_id)
    constraints = resolve_chapter_constraints(
        family_matches,
        disambiguation=merged_disambiguation,
        classification_text=classification_text,
    )
    merged_excluded = set(polysemy.excluded_chapters) | set(commercial.excluded_chapters)
    merged_penalized = set(polysemy.penalized_headings) | set(commercial.penalized_headings)
    if merged_excluded or merged_penalized:
        constraints = ChapterConstraints(
            allowed_chapters=constraints.allowed_chapters,
            excluded_chapters=frozenset(set(constraints.excluded_chapters) | merged_excluded),
            chapter_priors=constraints.chapter_priors,
            heading_priors=constraints.heading_priors,
            search_terms=constraints.search_terms,
            penalized_headings=frozenset(
                set(constraints.penalized_headings) | merged_penalized
            ),
            pending_disambiguation=constraints.pending_disambiguation,
            family_ids=constraints.family_ids,
        )
    cpr = build_cpr(
        understanding=understanding,
        lexicon_text=classification_text,
        lexicon_concepts=lexicon_concepts,
        lexicon_families=lexicon_families,
        entities=entities,
        constraints=constraints,
        disambiguation=merged_disambiguation,
        commercial=commercial,
        universal_profile=universal_profile,
    )

    from app.services.historical_search_service import (
        build_historical_search_query,
        search_historical_classifications,
    )

    historical_query = build_historical_search_query(
        product_description,
        understanding.english_description,
    )
    historical_search = search_historical_classifications(historical_query)
    taxonomy_family_ids = tuple(match.family_id for match in family_matches)
    aes_knowledge_context = build_aes_knowledge_context(
        historical_query,
        enabled=historical_validation_enabled,
        search_result=historical_search,
        family_ids=taxonomy_family_ids,
        penalized_headings=frozenset(cpr.penalized_headings),
    )
    brand_context = build_brand_knowledge_context(classification_text)
    validation_context = build_validation_context(
        historical_query,
        enabled=historical_validation_enabled,
        search_result=historical_search,
    )

    search_metrics: dict[str, int] = {}
    hits = search_nomenclature(
        classification_text,
        cpr=cpr,
        detected_attributes=detected_attributes if detected_attributes and detected_attributes.has_any() else None,
        historical_validation=validation_context if validation_context.enabled else None,
        aes_knowledge=aes_knowledge_context if aes_knowledge_context.enabled else None,
        brand_knowledge=brand_context if brand_context.matches else None,
        search_metrics=search_metrics,
    )
    injected_count = int(search_metrics.get("historical_injected_count", 0))
    aes_knowledge_summary = summarize_aes_knowledge(
        aes_knowledge_context,
        injected_count=injected_count,
        injection_won_ranking=any(
            keyword.startswith("aes_knowledge:")
            for keyword in (hits[0].matched_keywords if hits else ())
        ),
    )
    hits = apply_confidence_policy(hits, cpr.data_quality_score)
    validation_summary = summarize_validation(validation_context)

    state = decide_classification_state(cpr=cpr, suggestions=hits, understanding=understanding)

    if state == ClassificationState.DISAMBIGUATE:
        hits = []

    disambiguation_payload = get_disambiguation_questions(list(cpr.pending_disambiguation))
    questions = [
        DisambiguationQuestion(
            id=q["id"],
            prompt=q["prompt"],
            options=[
                DisambiguationOption(id=o["id"], label=o["label"]) for o in q.get("options", [])
            ],
        )
        for q in disambiguation_payload
    ]

    family_tuple = tuple(cpr.product_families)
    suggestions = [
        enrich_cn_suggestion(
            cn_code=hit.cn_code,
            description=hit.description,
            confidence_level=hit.confidence_level,
            match_explanation=hit.match_explanation,
            matched_keywords=list(hit.matched_keywords),
            product_families=family_tuple,
        )
        for hit in hits
    ]

    run_id = record_classification_run(
        product_description=product_description,
        classification_text=classification_text,
        cpr=cpr,
        state=state,
        suggestions=hits,
        translation_engine=understanding.understanding_engine,
        disambiguation_questions=disambiguation_payload,
        auto_answered_questions=auto_answered,
        detected_attributes=detected_attributes.to_dict() if detected_attributes.has_any() else None,
    )

    manual = state in {
        ClassificationState.ABSTAIN,
        ClassificationState.EXPERT_REQUIRED,
    } and not suggestions and state != ClassificationState.DISAMBIGUATE
    expert = requires_expert_review(state) and state != ClassificationState.DISAMBIGUATE

    return PipelineResult(
        understanding=understanding,
        cpr=cpr,
        classification_text=classification_text,
        state=state,
        suggestions=suggestions,
        disambiguation_questions=questions,
        classification_run_id=run_id,
        requires_manual_entry=manual,
        requires_assistance=manual,
        requires_expert_review=expert,
        detected_attributes=detected_attributes if detected_attributes.has_any() else None,
        auto_answered_questions=auto_answered,
        historical_validation=validation_summary,
        historical_evidence=validation_context.search_result,
        aes_knowledge=aes_knowledge_summary,
        brand_knowledge=brand_context if brand_context.matches else None,
    )
