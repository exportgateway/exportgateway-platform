"""Deprecated: the sample JSON builder was replaced by the full CN8 SQLite import."""

import sys

if __name__ == "__main__":
    print(
        "This script is deprecated. Use:\n"
        "  python scripts/import_full_cn_nomenclature.py --download\n"
        "  python scripts/import_full_cn_nomenclature.py --input app/data/sources/CN_2025_official_texts.xlsx\n"
        "See FULL_CN_DATABASE.md for details.",
        file=sys.stderr,
    )
    raise SystemExit(1)
