#!/usr/bin/env python3
"""Generate industrial phrase lexicon from AES historical declarations."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from app.services.aes_record_loader import iter_active_records, source_databases_for_mode
from app.services.aes_mode import is_full_mode

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "data" / "generated_industrial_lexicon.json"
)
MIN_FREQUENCY = 5
MIN_PHRASE_TOKENS = 2
MAX_PHRASE_TOKENS = 4
MIN_TOKEN_LENGTH = 2


def _normalize_phrase(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower().strip())
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped)


def _tokenize(description: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", _normalize_phrase(description))
    return [token for token in tokens if len(token) >= MIN_TOKEN_LENGTH]


def _phrase_ngrams(tokens: list[str]) -> list[str]:
    phrases: list[str] = []
    for size in range(MIN_PHRASE_TOKENS, MAX_PHRASE_TOKENS + 1):
        for index in range(0, len(tokens) - size + 1):
            phrase = " ".join(tokens[index : index + size])
            if len(phrase) >= 6:
                phrases.append(phrase)
    return phrases


def generate_industrial_lexicon(
    *,
    mode: str | None = None,
    min_frequency: int = MIN_FREQUENCY,
) -> dict:
    selected_mode = mode or ("full" if is_full_mode() else "seed")
    counter: Counter[tuple[str, str, str]] = Counter()
    for record in iter_active_records(mode=selected_mode):
        tokens = _tokenize(record.description)
        if not tokens:
            continue
        seen_for_row: set[tuple[str, str]] = set()
        for phrase in _phrase_ngrams(tokens):
            normalized = _normalize_phrase(phrase)
            key = (phrase, normalized, record.cn8)
            row_key = (normalized, record.cn8)
            if row_key in seen_for_row:
                continue
            seen_for_row.add(row_key)
            counter[key] += record.weight

    entries = [
        {
            "phrase": phrase,
            "normalized_phrase": normalized,
            "cn8": cn8,
            "count": round(count, 2),
        }
        for (phrase, normalized, cn8), count in counter.items()
        if count >= min_frequency
    ]
    entries.sort(key=lambda item: (-item["count"], item["normalized_phrase"], item["cn8"]))

    return {
        "version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": selected_mode,
        "source_databases": source_databases_for_mode(selected_mode),
        "min_frequency": min_frequency,
        "entry_count": len(entries),
        "entries": entries,
    }


def write_industrial_lexicon(payload: dict, output_path: Path | None = None) -> Path:
    path = output_path or OUTPUT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate industrial lexicon from AES history.")
    parser.add_argument("--mode", choices=["seed", "full", "exports"], default=None)
    parser.add_argument("--min-frequency", type=int, default=MIN_FREQUENCY)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    payload = generate_industrial_lexicon(
        mode=args.mode,
        min_frequency=args.min_frequency,
    )
    path = write_industrial_lexicon(payload, args.output)
    print(f"Wrote {payload['entry_count']} entries to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
