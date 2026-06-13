"""Probe Phase A.2 failure cases."""

from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from tests.test_services import DummySettings

CASES = [
    "IFM PN7094",
    "Pepperl+Fuchs NBB5-18GM50-E2",
    "Danfoss FC302",
    "Schneider ATV320",
    "LCD monitor",
    "Touch panel HMI",
    "Power supply 24VDC",
    "UPS battery backup",
    "Printer cartridge",
    "Permanent marker",
    "Women's polyester jacket",
    "Men's cotton T-shirt",
    "Siemens S7-1200 CPU",
]

for q in CASES:
    r = classify_product(ClassifyProductRequest(product_description=q), DummySettings())
    top = r.suggestions[0] if r.suggestions else None
    ch = top.cn_code.replace(" ", "")[:2] if top else "—"
    fam = r.cpr.product_families if r.cpr else []
    print(f"--- {q}")
    print(f"  state={r.classification_state} dq={r.data_quality_score} fam={fam}")
    if top:
        print(f"  top={top.cn_code} ch={ch} conf={top.confidence_level:.2f}")
    print(f"  manual={r.requires_manual_entry} expert={r.requires_expert_review}")
