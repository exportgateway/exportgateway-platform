#!/usr/bin/env python3
"""Build historical brand → CN8 map from AES declarations."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from app.services.aes_mode import is_full_mode
from app.services.aes_record_loader import iter_active_records, source_databases_for_mode
from app.services.brand_knowledge import KNOWN_BRANDS
from app.services.historical_normalize import format_cn_display

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "data" / "historical_brand_map.json"
)


def _canonical_brand(brand: str) -> str:
    return "wurth" if brand == "würth" else brand


def _detect_brands(description: str) -> list[str]:
    lower = description.lower()
    found: list[str] = []
    for brand in KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", lower):
            canonical = _canonical_brand(brand)
            if canonical not in found:
                found.append(canonical)
    return found


def generate_brand_map(*, mode: str | None = None) -> dict:
    selected_mode = mode or ("full" if is_full_mode() else "seed")
    counter: Counter[tuple[str, str, str, str]] = Counter()
    for record in iter_active_records(mode=selected_mode):
        brands = _detect_brands(record.description)
        if not brands:
            continue
        cn_code = format_cn_display(record.cn8)
        heading = record.heading_code[:4]
        for brand in brands:
            counter[(brand, record.cn8, cn_code, heading)] += record.weight

    brands_payload: dict[str, list[dict]] = {}
    for (brand, cn_digits, cn_code, heading), frequency in counter.most_common():
        brands_payload.setdefault(brand, []).append(
            {
                "brand": brand,
                "cn8": cn_code,
                "cn_digits": cn_digits,
                "heading_code": heading,
                "frequency": round(frequency, 2),
            }
        )

    flat_entries = [
        entry
        for entries in brands_payload.values()
        for entry in entries
    ]

    return {
        "version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": selected_mode,
        "source_databases": source_databases_for_mode(selected_mode),
        "brand_count": len(brands_payload),
        "entry_count": len(flat_entries),
        "brands": flat_entries,
    }


def write_brand_map(payload: dict, output_path: Path | None = None) -> Path:
    path = output_path or OUTPUT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate historical brand map from AES DB.")
    parser.add_argument("--mode", choices=["seed", "full", "exports"], default=None)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    payload = generate_brand_map(mode=args.mode)
    path = write_brand_map(payload, args.output)
    print(f"Wrote {payload['entry_count']} brand entries ({payload['brand_count']} brands) to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
