from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from tests.test_services import DummySettings

q = "Men's cotton trousers"
r1 = classify_product(ClassifyProductRequest(product_description=q), DummySettings())
print("FIRST SEARCH (no answers):")
print("  state=", r1.classification_state)
print("  suggestions=", len(r1.suggestions))
print("  questions=", [x.id for x in r1.disambiguation_questions])
print("  manual_entry=", r1.requires_manual_entry)

for answer, label in [("woven", "woven"), ("knitted", "knitted")]:
    r = classify_product(
        ClassifyProductRequest(
            product_description=q,
            disambiguation={"textile_construction": answer},
        ),
        DummySettings(),
    )
    print(f"AFTER {label}:")
    print("  state=", r.classification_state)
    print("  suggestions=", len(r.suggestions))
    for s in r.suggestions[:3]:
        print("   ", s.cn_code, round(s.confidence_level, 2))
