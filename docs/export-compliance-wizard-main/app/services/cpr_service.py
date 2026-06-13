"""Build Canonical Product Record v1 from pipeline inputs."""

from __future__ import annotations

from app.models.cpr import CanonicalProductRecord
from app.services.cn_entities import ProductEntities, extract_product_entities
from app.services.commercial_product_service import CommercialRecognition
from app.services.lexicon_service import compute_lexicon_quality_boost
from app.services.product_understanding_service import (
    ENGINE_FALLBACK,
    ProductUnderstandingResult,
)
from app.services.taxonomy_service import (
    ChapterConstraints,
    detect_families,
    global_excluded_tokens,
    resolve_chapter_constraints,
)
from app.services.universal_product_profile import UniversalProductProfile, build_universal_profile


def build_cpr(
    *,
    understanding: ProductUnderstandingResult,
    lexicon_text: str,
    lexicon_concepts: list[str],
    lexicon_families: list[str],
    entities: ProductEntities | None = None,
    constraints: ChapterConstraints | None = None,
    disambiguation: dict[str, str] | None = None,
    commercial: CommercialRecognition | None = None,
    universal_profile: UniversalProductProfile | None = None,
) -> CanonicalProductRecord:
    commercial_description = understanding.original_text
    normalized = lexicon_text or understanding.english_description
    entities = entities or extract_product_entities(normalized)

    commercial_recognition = commercial or CommercialRecognition()
    family_matches = detect_families(
        normalized,
        extra_family_ids=list(
            dict.fromkeys(
                [
                    *list(understanding.product_families),
                    *lexicon_families,
                    *entities.product_families,
                    *commercial_recognition.family_ids,
                ]
            )
        ),
    )
    if constraints is None:
        constraints = resolve_chapter_constraints(
            family_matches,
            disambiguation=disambiguation,
            classification_text=normalized,
        )

    excluded_tokens = (
        set(entities.excluded_tokens)
        | set(commercial_recognition.excluded_tokens)
        | global_excluded_tokens()
    )

    language_conf = understanding.language_detection_confidence
    data_quality = compute_lexicon_quality_boost(
        lexicon_concepts=lexicon_concepts,
        translation_ok=understanding.understanding_ok or understanding.detected_language == "en",
        language_confidence=language_conf,
    )
    if understanding.understanding_engine == ENGINE_FALLBACK:
        data_quality = min(data_quality, understanding.confidence)
    elif understanding.confidence:
        data_quality = max(data_quality, min(0.92, understanding.confidence))

    has_product_signal = bool(
        lexicon_concepts
        or entities.product_families
        or understanding.product_families
        or commercial_recognition.product_ids
        or constraints.family_ids
        or constraints.allowed_chapters
    )
    if len(normalized.split()) < 3 and not has_product_signal:
        data_quality *= 0.6
    elif has_product_signal and len(normalized.split()) < 4:
        data_quality = max(data_quality, 0.68)
    if entities.product_families or constraints.family_ids:
        data_quality = max(data_quality, 0.74)
    if entities.brands and (entities.product_families or constraints.family_ids):
        data_quality = max(data_quality, 0.78)
    if commercial_recognition.product_ids:
        data_quality = max(data_quality, 0.8)
    if commercial_recognition.product_ids and (
        constraints.family_ids or entities.product_families
    ):
        data_quality = max(data_quality, 0.84)
    if (
        understanding.understanding_engine == ENGINE_FALLBACK
        and understanding.detected_language != "en"
        and not has_product_signal
    ):
        data_quality = min(data_quality, 0.45)

    allowed = list(constraints.allowed_chapters) if constraints.allowed_chapters else []
    if not allowed and constraints.chapter_priors:
        allowed = [c for c in constraints.chapter_priors if c not in constraints.excluded_chapters]

    search_terms = list(
        dict.fromkeys(
            [
                *understanding.search_terms,
                *constraints.search_terms,
                *entities.search_terms,
                *commercial_recognition.search_terms,
            ]
        )
    )

    all_brands = list(dict.fromkeys([*entities.brands, *commercial_recognition.brands]))

    profile = universal_profile or build_universal_profile(
        understanding,
        classification_text=normalized,
    )

    return CanonicalProductRecord(
        commercial_description=commercial_description,
        normalized_description=normalized,
        detected_language=understanding.detected_language,
        data_quality_score=round(data_quality, 2),
        product_families=list(
            dict.fromkeys(
                [
                    *profile.taxonomy_family_ids,
                    *constraints.family_ids,
                    *list(understanding.product_families),
                    *entities.product_families,
                    *commercial_recognition.family_ids,
                ]
            )
        ),
        commercial_product_ids=list(commercial_recognition.product_ids),
        trade_names=list(commercial_recognition.trade_names),
        invoice_enrichment=commercial_recognition.text_enrichment,
        brands=all_brands,
        excluded_tokens=sorted(excluded_tokens),
        model_spans=list(entities.model_spans),
        condition=entities.condition,
        chapter_priors=sorted(constraints.chapter_priors),
        excluded_chapters=sorted(
            set(constraints.excluded_chapters) | set(commercial_recognition.excluded_chapters)
        ),
        allowed_chapters=sorted(allowed),
        heading_priors=sorted(
            set(constraints.heading_priors)
            | set(entities.heading_hints)
            | set(commercial_recognition.heading_hints)
        ),
        search_terms=search_terms,
        penalized_headings=sorted(
            set(entities.penalized_headings)
            | set(constraints.penalized_headings)
            | set(commercial_recognition.penalized_headings)
        ),
        lexicon_concepts=list(
            dict.fromkeys([*lexicon_concepts, *commercial_recognition.lexicon_concept_ids])
        ),
        is_vehicle=entities.is_vehicle,
        is_industrial_sensor=entities.is_industrial_sensor,
        is_industrial_automation=entities.is_industrial_automation,
        disambiguation_resolved=dict(disambiguation or {}),
        pending_disambiguation=list(constraints.pending_disambiguation),
        universal_product_family=profile.product_family,
        universal_product_type=profile.product_type,
        universal_material=profile.material,
        universal_function=profile.function,
        universal_industry=profile.industry,
    )
