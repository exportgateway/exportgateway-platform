"""Run V2.2 vehicle entity benchmark."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models.schemas import ClassifyProductRequest  # noqa: E402
from app.services.classification_service import classify_product  # noqa: E402
from app.services.cn_entities import extract_product_entities  # noqa: E402


class DummySettings:
    ai_classification_enabled = False


QUERIES = [
    "Rabljeno tovorno vozilo DAF XF 480",
    "Nov MAN TGX 18.520",
    "Mercedes Actros 1845",
    "Rabljeno osebno vozilo BMW",
    "Polpriklopnik Schmitz",
]


def main() -> None:
    settings = DummySettings()
    for query in QUERIES:
        entities = extract_product_entities(query)
        response = classify_product(
            ClassifyProductRequest(product_description=query),
            settings,
        )
        print(f"\n## {query}\n")
        print(f"**Extracted entities:** {entities.summary()}")
        if entities.excluded_tokens:
            print(f"**Excluded model tokens:** {', '.join(sorted(entities.excluded_tokens))}")
        print()
        if not response.suggestions:
            print("_No suggestions._\n")
            continue
        print("| # | CN code | Confidence | Description |")
        print("|---|---------|------------|-------------|")
        for idx, item in enumerate(response.suggestions[:5], start=1):
            desc = item.description.replace("|", "/")[:70]
            print(f"| {idx} | `{item.cn_code}` | {item.confidence_level} | {desc} |")
        top = response.suggestions[0]
        print(f"\n**Top 1 reason:** {top.match_explanation}")
        print(f"**Matched keywords:** {', '.join(top.matched_keywords)}")


if __name__ == "__main__":
    main()
