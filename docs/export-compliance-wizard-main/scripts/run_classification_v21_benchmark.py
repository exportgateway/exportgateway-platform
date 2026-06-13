"""Run V2.1 classification benchmark and print markdown-friendly results."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.classification_service import classify_product  # noqa: E402
from app.models.schemas import ClassifyProductRequest  # noqa: E402


class DummySettings:
    ai_classification_enabled = False


TEST_QUERIES = [
    "Paracetamol tablets",
    "Ibuprofen",
    "Ball bearings",
    "Hydraulic valve",
    "Steel screws",
    "Laptop computer",
    "Air rifle pellets",
]


def main() -> None:
    settings = DummySettings()
    for query in TEST_QUERIES:
        response = classify_product(
            ClassifyProductRequest(product_description=query),
            settings,
        )
        print(f"\n## {query}\n")
        if not response.suggestions:
            print("_No suggestions returned._\n")
            continue
        top = response.suggestions[0]
        print(f"**Top 1:** {top.cn_code} — {top.description}")
        print(f"- Confidence: {top.confidence_level}")
        print(f"- Reason: {top.match_explanation}")
        print(f"- Keywords: {', '.join(top.matched_keywords)}\n")
        print("**Top 3:**")
        for idx, item in enumerate(response.suggestions[:3], start=1):
            print(
                f"{idx}. `{item.cn_code}` ({item.confidence_level}) — "
                f"{item.description[:90]}"
            )
        print()


if __name__ == "__main__":
    main()
