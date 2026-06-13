"""Multilingual classification benchmark (Phase 2.3)."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models.schemas import ClassifyProductRequest  # noqa: E402
from app.services.classification_service import classify_product  # noqa: E402
from app.services.translation_service import translate_to_english  # noqa: E402


class DummySettings:
    ai_classification_enabled = False


BENCHMARK = [
    ("vehicles", "sl", "Rabljeno tovorno vozilo DAF XF 480", "870"),
    ("vehicles", "de", "Gebrauchter LKW MAN TGX 18.520", "870"),
    ("vehicles", "fr", "Camion usé DAF XF 480", "870"),
    ("vehicles", "it", "Autocarro usato Iveco Stralis", "870"),
    ("vehicles", "es", "Camión de mercancías usado", "870"),
    ("bearings", "de", "Kugellager", "8482"),
    ("bearings", "pl", "Łożyska kulkowe", "8482"),
    ("bearings", "cs", "Kulové ložisko", "8482"),
    ("bearings", "nl", "Kogellagers", "8482"),
    ("valves", "fr", "Soupape hydraulique", "8481"),
    ("valves", "hu", "Hidraulikus szelep", "8481"),
    ("valves", "ro", "Supapă hidraulică", "8481"),
    ("pharma", "pt", "Comprimidos de paracetamol", "3004"),
    ("pharma", "el", "Δισκία παρακεταμόλης", "3004"),
    ("pharma", "hr", "Tablete paracetamola", "3004"),
    ("electronics", "fi", "Kannettava tietokone", "8471"),
    ("electronics", "da", "Bærbar computer", "8471"),
    ("electronics", "sv", "Bärbar dator", "8471"),
    ("electronics", "et", "Sülearvuti", "8471"),
]


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    settings = DummySettings()
    timings: list[float] = []
    rows: list[str] = []

    for category, lang, query, expected_prefix in BENCHMARK:
        t0 = time.perf_counter()
        tr = translate_to_english(query)
        response = classify_product(ClassifyProductRequest(product_description=query), settings)
        elapsed = (time.perf_counter() - t0) * 1000
        timings.append(elapsed)

        top = response.suggestions[0] if response.suggestions else None
        top_code = top.cn_code if top else "—"
        ok = top_code.startswith(expected_prefix) if top else False
        status = "OK" if ok else "CHECK"

        rows.append(
            f"| {category} | {lang} | {status} | {tr.detected_language} | "
            f"{tr.translation_engine} | {tr.translation_ms:.0f}ms | {elapsed:.0f}ms | "
            f"`{top_code}` | {tr.translated_text[:60]} |"
        )

        print(f"\n### [{category}] {lang}: {query}")
        print(f"- Detected: {tr.detected_language_name} ({tr.detected_language})")
        print(f"- Engine: {tr.translation_engine} ({tr.translation_ms} ms)")
        print(f"- Translated: {tr.translated_text}")
        print(f"- Top 1: {top_code} ({status})")
        if response.suggestions:
            for idx, item in enumerate(response.suggestions[:5], 1):
                print(f"  {idx}. {item.cn_code} ({item.confidence_level}) — {item.description[:70]}")

    if timings:
        print("\n---")
        print(f"Average end-to-end: {sum(timings)/len(timings):.0f} ms")
        print(f"Max: {max(timings):.0f} ms")


if __name__ == "__main__":
    main()
