from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.classification_audit import count_runs, init_audit_schema
from app.services.golden_benchmark import run_golden_benchmark
from app.services.lexicon_service import apply_customs_lexicon, tokenize_for_search
from app.services.taxonomy_service import detect_families, resolve_chapter_constraints
from tests.test_services import DummySettings


def test_lexicon_normalizes_slovenian_trousers():
    text, concepts, families = apply_customs_lexicon("Moške dolge hlače", "sl")
    assert "trouser" in text.lower() or "pants" in text.lower()
    assert "apparel" in str(concepts) or "apparel_trousers" in families


def test_tokenize_does_not_emit_hla_from_hlace():
    tokens = tokenize_for_search("Moške dolge hlače")
    assert "hla" not in tokens


def test_taxonomy_apparel_excludes_chapter_03():
    matches = detect_families("men's long trousers pants")
    constraints = resolve_chapter_constraints(matches)
    assert "03" in constraints.excluded_chapters
    assert "61" in constraints.allowed_chapters or "62" in constraints.allowed_chapters


def test_classify_slovenian_trousers_not_seafood():
    response = classify_product(
        ClassifyProductRequest(
            product_description="Moške dolge hlače",
            disambiguation={"textile_construction": "woven"},
        ),
        DummySettings(),
    )
    assert response.suggestions
    chapter = response.suggestions[0].cn_code.replace(" ", "")[:2]
    assert chapter in {"61", "62"}
    assert response.classification_run_id


def test_classify_sensor_not_8418():
    response = classify_product(
        ClassifyProductRequest(
            product_description="Industrijski temperaturni senzor Pepperl+Fuchs REF-H180"
        ),
        DummySettings(),
    )
    assert response.suggestions
    top = response.suggestions[0].cn_code.replace(" ", "")
    assert not top.startswith("8418")


def test_classify_truck_not_paper():
    response = classify_product(
        ClassifyProductRequest(
            product_description="Rabljeno tovorno vozilo DAF XF 480",
            disambiguation={"vehicle_gvm_band": "over_5t"},
        ),
        DummySettings(),
    )
    assert response.suggestions
    assert response.suggestions[0].cn_code.replace(" ", "").startswith("87")


def test_disambiguate_state_for_apparel_without_answer():
    response = classify_product(
        ClassifyProductRequest(product_description="Moške dolge hlače"),
        DummySettings(),
    )
    assert response.classification_state == "DISAMBIGUATE"
    assert response.disambiguation_questions
    assert not response.suggestions


def test_audit_record_created():
    init_audit_schema()
    classify_product(
        ClassifyProductRequest(product_description="Paracetamol tablets"),
        DummySettings(),
    )
    assert count_runs() >= 1


def test_golden_benchmark_no_forbidden_violations():
    report = run_golden_benchmark(DummySettings())
    assert report.forbidden_violations == 0, [
        (r.case_id, r.reason) for r in report.results if not r.passed
    ]
