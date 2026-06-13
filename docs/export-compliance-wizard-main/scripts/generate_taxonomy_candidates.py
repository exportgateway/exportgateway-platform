#!/usr/bin/env python3
"""Build taxonomy candidate families from AES exports and imports."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from app.services.aes_mode import is_full_mode
from app.services.aes_record_loader import WeightedAesRecord, iter_active_records

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "data" / "taxonomy_candidates.json"
)
TIER1_OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "data" / "taxonomy_candidates_tier1.json"
)
TIER1_MIN_DECLARATIONS = 25
TOP_PHRASES_PER_HEADING = 12


def _normalize_phrase(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower().strip())
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped)


def _tokenize(description: str) -> list[str]:
    return re.findall(r"[a-z0-9]{3,}", _normalize_phrase(description))


def _build_heading_stats(records: list[WeightedAesRecord]) -> dict:
    heading_weight: Counter[str] = Counter()
    heading_cn8: dict[str, Counter[str]] = defaultdict(Counter)
    heading_phrases: dict[str, Counter[str]] = defaultdict(Counter)

    for record in records:
        heading = record.heading_code[:4]
        heading_weight[heading] += record.weight
        heading_cn8[heading][record.cn8] += record.weight
        tokens = _tokenize(record.description)
        if len(tokens) >= 2:
            phrase = " ".join(tokens[:4])
            heading_phrases[heading][phrase] += record.weight

    candidates = []
    for heading, weight in heading_weight.most_common():
        top_cn8 = [
            {"cn8": cn8, "weight": round(count, 2)}
            for cn8, count in heading_cn8[heading].most_common(8)
        ]
        top_phrases = [
            phrase
            for phrase, _count in heading_phrases[heading].most_common(TOP_PHRASES_PER_HEADING)
        ]
        candidates.append(
            {
                "heading_code": heading,
                "declaration_weight": round(weight, 2),
                "top_cn8": top_cn8,
                "phrases": top_phrases,
                "family_id": f"aes_heading_{heading}",
            }
        )
    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "full" if is_full_mode() else "seed",
        "heading_count": len(candidates),
        "candidates": candidates,
    }


def generate_taxonomy_candidates(*, mode: str | None = None) -> dict:
    records = list(iter_active_records(mode=mode))
    return _build_heading_stats(records)


def write_taxonomy_candidates(payload: dict, output_path: Path | None = None) -> Path:
    path = output_path or OUTPUT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def write_tier1(payload: dict, output_path: Path | None = None) -> Path:
    tier1 = {
        "version": 1,
        "generated_at": payload.get("generated_at"),
        "mode": payload.get("mode"),
        "min_declaration_weight": TIER1_MIN_DECLARATIONS,
        "candidates": [
            candidate
            for candidate in payload.get("candidates", [])
            if candidate.get("declaration_weight", 0) >= TIER1_MIN_DECLARATIONS
        ],
    }
    path = output_path or TIER1_OUTPUT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(tier1, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate taxonomy candidates from AES data.")
    parser.add_argument("--mode", choices=["seed", "full", "exports"], default=None)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--tier1-output", type=Path, default=TIER1_OUTPUT_PATH)
    args = parser.parse_args()

    exports_only = args.mode == "exports"
    mode = None if exports_only else args.mode
    records = list(iter_active_records(mode=mode, exports_only=exports_only))
    payload = _build_heading_stats(records)
    if exports_only:
        payload["mode"] = "exports"
    write_taxonomy_candidates(payload, args.output)
    write_tier1(payload, args.tier1_output)
    print(
        f"Wrote {payload['heading_count']} heading candidates "
        f"and {len([c for c in payload['candidates'] if c['declaration_weight'] >= TIER1_MIN_DECLARATIONS])} tier1"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
