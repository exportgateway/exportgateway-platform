"""Reproduce Phase A.1 quality cases (run: PYTHONPATH=. python scripts/_a11_probe.py)."""

from app.services.translation_service import detect_language_with_confidence, _detect_from_phrase_tables
from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from tests.test_services import DummySettings

QUERIES = [
    "Laptop computer",
    "Temperature sensor",
    "Bike",
    "Men's cotton trousers",
    "Chemical pens with liquid ink",
]


def main() -> None:
    print("=== LANGUAGE ===")
    for q in QUERIES:
        d = detect_language_with_confidence(q)
        print(f"{q!r} -> {d.language} {d.method} {d.confidence}")

    print("\n=== CLASSIFY ===")
    for q in QUERIES:
        r = classify_product(ClassifyProductRequest(product_description=q), DummySettings())
        top = r.suggestions[0] if r.suggestions else None
        print(f"--- {q}")
        print(f"  state={r.classification_state} dq={r.data_quality_score} lang={r.detected_language}")
        if r.cpr:
            print(f"  families={r.cpr.product_families} pending={r.cpr.pending_disambiguation}")
        print(f"  manual={r.requires_manual_entry} expert={r.requires_expert_review}")
        if top:
            print(f"  top={top.cn_code} conf={top.confidence_level:.2f}")
        if len(r.suggestions) > 1:
            print(f"  confs={[round(s.confidence_level, 2) for s in r.suggestions]}")
        if r.disambiguation_questions:
            print(f"  questions={[x.id for x in r.disambiguation_questions]}")

    print("\n=== PHRASE TABLE (language attribution only) ===")
    for q in ["Laptop computer", "Temperature sensor", "Bike"]:
        print(f"{q!r} -> {_detect_from_phrase_tables(q)}")


if __name__ == "__main__":
    main()
