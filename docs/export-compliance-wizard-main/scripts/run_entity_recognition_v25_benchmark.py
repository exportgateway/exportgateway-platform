"""Phase 2.5 — industrial entity recognition benchmark and ENTITY_RECOGNITION_V25.md report."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.classification_service import classify_product  # noqa: E402
from app.services.cn_entities import extract_product_entities  # noqa: E402
from app.models.schemas import ClassifyProductRequest  # noqa: E402
from app.services.translation_service import (  # noqa: E402
    detect_language_with_confidence,
    translate_to_english,
)

BENCHMARK_QUERIES = [
    "Industrijski temperaturni senzor Pepperl+Fuchs REF-H180",
    "Senzor tlaka Danfoss MBS3000",
    "Siemens PLC modul",
    "IFM induktivni senzor",
    "Omron proximity sensor",
]

REPORT_PATH = ROOT / "ENTITY_RECOGNITION_V25.md"


class DummySettings:
    ai_classification_enabled = False


def _removed_model_tokens(entities) -> list[str]:
    return sorted(entities.excluded_tokens)


def run() -> None:
    lines: list[str] = [
        "# Entity Recognition V2.5 — Industrial Products",
        "",
        "Universal product entity layer: industrial brands, catalogue model stripping,",
        "product families (sensors, automation), CN ranking boosts/penalties, and",
        "Slovenian language detection diagnostics.",
        "",
        "---",
        "",
    ]

    for query in BENCHMARK_QUERIES:
        entities = extract_product_entities(query)
        translation = translate_to_english(query)
        lang_det = detect_language_with_confidence(query)
        class_entities = extract_product_entities(translation.text_for_classification)
        response = classify_product(ClassifyProductRequest(product_description=query), DummySettings())

        lines.append(f"## Query: `{query}`")
        lines.append("")
        lines.append("### Entity extraction (original text)")
        lines.append(f"- **Detected brand:** {', '.join(entities.brands) or '—'}")
        lines.append(f"- **Detected product family:** {', '.join(entities.product_families) or '—'}")
        lines.append(f"- **Model spans removed:** {', '.join(entities.model_spans) or '—'}")
        lines.append(
            f"- **Excluded model tokens:** {', '.join(_removed_model_tokens(entities)) or '—'}"
        )
        lines.append("")
        lines.append("### Language")
        lines.append(f"- **Detected language:** {translation.detected_language} ({translation.detected_language_name})")
        lines.append(f"- **Detection method:** {translation.language_detection_method}")
        lines.append(f"- **Detection confidence:** {translation.language_detection_confidence:.2f}")
        lines.append(f"- **Translation engine:** {translation.translation_engine_display}")
        lines.append(f"- **Text classified:** `{translation.text_for_classification}`")
        lines.append("")
        lines.append("### Entity extraction (classification text)")
        lines.append(f"- **Brand:** {', '.join(class_entities.brands) or '—'}")
        lines.append(f"- **Family:** {', '.join(class_entities.product_families) or '—'}")
        lines.append("")
        lines.append("### Top 5 CN results")
        lines.append("")
        if not response.suggestions:
            lines.append("_No suggestions returned._")
        else:
            lines.append("| Rank | CN code | Confidence | Description |")
            lines.append("| --- | --- | ---: | --- |")
            for idx, item in enumerate(response.suggestions[:5], start=1):
                desc = item.description.replace("|", "\\|")[:72]
                lines.append(
                    f"| {idx} | {item.cn_code} | {item.confidence_level:.2f} | {desc} |"
                )
        if response.suggestions:
            top = response.suggestions[0]
            lines.append("")
            lines.append(f"**Top match confidence:** {top.confidence_level:.2f}")
            lines.append(f"**Match explanation:** {top.match_explanation}")
        lines.append("")
        lines.append("---")
        lines.append("")

    lines.extend(
        [
            "## Implementation summary",
            "",
            "| Capability | Location |",
            "| --- | --- |",
            "| Industrial brands & families | `app/data/cn_industrial_entities.json` |",
            "| Entity extraction | `app/services/cn_entities.py` |",
            "| Ranking boosts / penalties | `app/services/cn_ranking.py` |",
            "| Slovenian detection & confidence | `app/services/translation_service.py` |",
            "| Glossary (SL industrial terms) | `multilingual_phrases.json`, `multilingual_words.json` |",
            "",
        ]
    )

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")


if __name__ == "__main__":
    run()
