"""Phase 2.4 production translation benchmark (glossary -> Argos -> original)."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models.schemas import ClassifyProductRequest  # noqa: E402
from app.services.classification_service import classify_product  # noqa: E402
from app.services.translation_service import (  # noqa: E402
    argos_has_language,
    translate_to_english,
    validate_translation_startup,
)


class DummySettings:
    ai_classification_enabled = False


BENCHMARK = [
    ("vehicles", "sl", "Rabljeno tovorno vozilo DAF XF 480", "870", "glossary"),
    ("vehicles", "de", "Gebrauchter LKW MAN TGX 18.520", "870", "glossary"),
    ("vehicles", "fr", "Camion frigorifique réfrigéré", "870", "argos"),
    ("vehicles", "it", "Autocarro usato per trasporto merci", "870", "argos"),
    ("vehicles", "es", "Vehículo industrial de transporte de carga", "870", "argos"),
    ("vehicles", "pl", "Ciężarówka do przewozu towarów używana", "870", "argos"),
    ("bearings", "sl", "Kroglasti ležaj SKF 6205", "8482", "glossary"),
    ("bearings", "hr", "Kuglični ležaj SKF 6205", "8482", "glossary"),
    ("bearings", "sr", "Kuglični ležaj SKF 6205", "8482", "glossary"),
    ("bearings", "de", "Kugellager SKF 6205", "8482", "glossary"),
    ("valves", "fr", "Soupape hydraulique industrielle", "8481", "argos"),
    ("valves", "it", "Valvola pneumatica per automazione industriale", "8481", "argos"),
    ("valves", "es", "Válvula de control para automatización industrial", "8481", "argos"),
    ("pharma", "sl", "Tablete paracetamola 500 mg", "3004", "glossary"),
    ("pharma", "de", "Schmerztabletten mit Paracetamol", "3004", "argos"),
    ("pharma", "fr", "Comprimés effervescents au paracétamol", "3004", "argos"),
    ("electronics", "pl", "Przenośny komputer przemysłowy", "8471", "argos"),
    ("electronics", "cs", "Průmyslový programovatelný automat", "8471", "argos"),
    ("automation", "de", "Industrielle SPS-Steuerung und Sensorik", "8537", "argos"),
    ("automation", "sl", "Industrijski senzorji in krmiljenje", "8537", "argos"),
]


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    startup = validate_translation_startup()
    print("=== Startup ===")
    print(f"Glossary languages: {startup.glossary_phrase_languages}")
    print(f"Argos installed: {startup.argos_installed}")
    print(f"Argos pairs: {', '.join(startup.argos_language_pairs) or 'none'}")
    print()

    settings = DummySettings()
    rows = []

    for category, lang, query, expected_prefix, expected_engine in BENCHMARK:
        tr = translate_to_english(query)
        t0 = time.perf_counter()
        response = classify_product(ClassifyProductRequest(product_description=query), settings)
        elapsed = (time.perf_counter() - t0) * 1000

        top = response.suggestions[0] if response.suggestions else None
        top_code = top.cn_code if top else "—"
        ok_cn = top_code.startswith(expected_prefix) if top else False
        engine_ok = tr.translation_engine == expected_engine or (
            expected_engine == "argos" and tr.translation_engine == "argos"
        )

        rows.append(
            (category, lang, tr.translation_engine_display, ok_cn, top_code, tr.translated_text[:55])
        )

        print(f"### {category} | {lang}")
        print(f"Query: {query}")
        print(f"Detected: {tr.detected_language_name}")
        print(f"Engine: {tr.translation_engine_display} (argos available: {argos_has_language(lang)})")
        print(f"Translated: {tr.translated_text}")
        print(f"Top CN: {top_code} ({'OK' if ok_cn else 'CHECK'})")
        if response.suggestions:
            for i, s in enumerate(response.suggestions[:5], 1):
                print(f"  {i}. {s.cn_code} ({s.confidence_level})")
        print()

    glossary_n = sum(1 for r in rows if r[2] == "Glossary")
    argos_n = sum(1 for r in rows if r[2] == "Argos Translate")
    fallback_n = sum(1 for r in rows if r[2] == "Original Text Fallback")
    cn_ok = sum(1 for r in rows if r[3])
    print("=== Summary ===")
    print(f"Glossary: {glossary_n}, Argos: {argos_n}, Original fallback: {fallback_n}")
    print(f"CN prefix OK: {cn_ok}/{len(rows)}")


if __name__ == "__main__":
    main()
