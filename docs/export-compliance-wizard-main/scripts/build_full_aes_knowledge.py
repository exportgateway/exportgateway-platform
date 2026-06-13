#!/usr/bin/env python3
"""Import full AES exports/imports and rebuild knowledge artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.generate_brand_map import generate_brand_map, write_brand_map
from scripts.generate_industrial_lexicon import generate_industrial_lexicon, write_industrial_lexicon
from scripts.generate_taxonomy_candidates import (
    generate_taxonomy_candidates,
    write_taxonomy_candidates,
    write_tier1,
)
from scripts.import_aes_exports import import_aes_exports
from scripts.import_aes_imports import import_aes_imports


def build_full_aes_knowledge(
    *,
    exports_xlsx: Path | None = None,
    imports_xlsx: Path | None = None,
    rebuild: bool = True,
    skip_imports: bool = False,
) -> dict:
    exports_result = import_aes_exports(input_path=exports_xlsx, rebuild=rebuild)
    imports_result = None
    if not skip_imports:
        try:
            imports_result = import_aes_imports(input_path=imports_xlsx, rebuild=rebuild)
        except FileNotFoundError:
            imports_result = {"skipped": True, "reason": "AES_IMPORTS.xlsx not found"}

    lexicon = generate_industrial_lexicon(mode="full")
    lexicon_path = write_industrial_lexicon(lexicon)
    brand_map = generate_brand_map(mode="full")
    brand_path = write_brand_map(brand_map)
    taxonomy = generate_taxonomy_candidates(mode="full")
    taxonomy_path = write_taxonomy_candidates(taxonomy)
    tier1_path = write_tier1(taxonomy)

    return {
        "exports": exports_result,
        "imports": imports_result,
        "lexicon": {"path": str(lexicon_path), "entry_count": lexicon["entry_count"]},
        "brand_map": {
            "path": str(brand_path),
            "brand_count": brand_map["brand_count"],
            "entry_count": brand_map["entry_count"],
        },
        "taxonomy": {
            "path": str(taxonomy_path),
            "heading_count": taxonomy["heading_count"],
            "tier1_path": str(tier1_path),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build full AES knowledge databases and artifacts.")
    parser.add_argument("--exports", type=Path, default=None)
    parser.add_argument("--imports", type=Path, default=None)
    parser.add_argument("--no-rebuild", action="store_true")
    parser.add_argument("--skip-imports", action="store_true")
    args = parser.parse_args()

    result = build_full_aes_knowledge(
        exports_xlsx=args.exports,
        imports_xlsx=args.imports,
        rebuild=not args.no_rebuild,
        skip_imports=args.skip_imports,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
