#!/usr/bin/env python3
"""Read-only audit of existing AES exports/imports databases. Does NOT rebuild."""

from __future__ import annotations

import json
import random
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from app.services.brand_knowledge import KNOWN_BRANDS
from app.services.historical_normalize import normalize_cn8, tariff_digits

EXPORTS_DB = Path(__file__).resolve().parent.parent / "app" / "data" / "aes_exports.db"
IMPORTS_DB = Path(__file__).resolve().parent.parent / "app" / "data" / "aes_imports.db"
REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "aes_database_audit.json"

EXPECTED_EXPORTS = 62891
EXPECTED_IMPORTS_MIN = 50000
VARIANCE_THRESHOLD = 0.05

NORMALIZATION_SAMPLES = {
    "7318159090": "73181590",
    "3920102190": "39201021",
    "8302420090": "83024200",
}


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _db_exists(db_path: Path) -> bool:
    return db_path.is_file() and db_path.stat().st_size > 0


def _size_mb(db_path: Path) -> float | None:
    if not _db_exists(db_path):
        return None
    return round(db_path.stat().st_size / (1024 * 1024), 2)


def _table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]


def _audit_dataset(db_path: Path, *, label: str) -> dict:
    if not _db_exists(db_path):
        return {"label": label, "present": False, "path": str(db_path)}

    with _connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "aes_items" not in tables:
            return {"label": label, "present": True, "valid_schema": False, "path": str(db_path)}

        columns = _table_columns(conn, "aes_items")
        records = conn.execute("SELECT COUNT(*) AS n FROM aes_items").fetchone()["n"]
        unique_cn8 = conn.execute("SELECT COUNT(DISTINCT cn8) AS n FROM aes_items").fetchone()["n"]

        top_cn8 = [
            {"cn8": row["cn8"], "count": row["n"]}
            for row in conn.execute(
                """
                SELECT cn8, COUNT(*) AS n
                FROM aes_items
                GROUP BY cn8
                ORDER BY n DESC
                LIMIT 100
                """
            ).fetchall()
        ]

        top_descriptions = [
            {"description": row["item_description"], "count": row["n"], "cn8": row["cn8"]}
            for row in conn.execute(
                """
                SELECT item_description, cn8, COUNT(*) AS n
                FROM aes_items
                GROUP BY item_description, cn8
                ORDER BY n DESC
                LIMIT 100
                """
            ).fetchall()
        ]

        empty_descriptions = conn.execute(
            """
            SELECT COUNT(*) AS n FROM aes_items
            WHERE trim(item_description) = '' OR item_description IS NULL
            """
        ).fetchone()["n"]

        invalid_tariffs = conn.execute(
            """
            SELECT COUNT(*) AS n FROM aes_items
            WHERE original_tariff IS NULL OR trim(original_tariff) = ''
            """
        ).fetchone()["n"]

        invalid_cn8 = conn.execute(
            """
            SELECT COUNT(*) AS n FROM aes_items
            WHERE cn8 IS NULL OR length(cn8) != 8 OR cn8 GLOB '*[^0-9]*'
            """
        ).fetchone()["n"]

        normalization_failures = 0
        if "original_tariff" in columns:
            rows = conn.execute(
                "SELECT original_tariff, cn8 FROM aes_items"
            ).fetchall()
            for row in rows:
                expected = normalize_cn8(row["original_tariff"])
                if expected != row["cn8"]:
                    normalization_failures += 1

        duplicate_groups = conn.execute(
            """
            SELECT COUNT(*) AS n FROM (
                SELECT export_country, import_country, cn8,
                       COALESCE(description_normalized, item_description),
                       COALESCE(net_mass_kg, -1)
                FROM aes_items
                GROUP BY export_country, import_country, cn8,
                         COALESCE(description_normalized, item_description),
                         COALESCE(net_mass_kg, -1)
                HAVING COUNT(*) > 1
            )
            """
        ).fetchone()["n"]

        duplicate_records = conn.execute(
            """
            SELECT COALESCE(SUM(cnt - 1), 0) AS n FROM (
                SELECT COUNT(*) AS cnt
                FROM aes_items
                GROUP BY export_country, import_country, cn8,
                         COALESCE(description_normalized, item_description),
                         COALESCE(net_mass_kg, -1)
                HAVING COUNT(*) > 1
            )
            """
        ).fetchone()["n"]

        import_stats = None
        if "meta" in tables:
            row = conn.execute(
                "SELECT value FROM meta WHERE key = 'import_stats'"
            ).fetchone()
            if row:
                try:
                    import_stats = json.loads(row["value"])
                except json.JSONDecodeError:
                    import_stats = row["value"]

    return {
        "label": label,
        "present": True,
        "valid_schema": True,
        "path": str(db_path),
        "size_mb": _size_mb(db_path),
        "records": records,
        "unique_cn8": unique_cn8,
        "top_100_cn8": top_cn8,
        "top_100_descriptions": top_descriptions,
        "quality": {
            "duplicate_groups": duplicate_groups,
            "duplicate_records": duplicate_records,
            "empty_descriptions": empty_descriptions,
            "invalid_tariffs": invalid_tariffs,
            "invalid_cn8": invalid_cn8,
            "normalization_failures": normalization_failures,
        },
        "import_stats": import_stats,
    }


def _normalization_check(db_path: Path) -> dict:
    if not _db_exists(db_path):
        return {"present": False}

    with _connect(db_path) as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM aes_items").fetchone()["n"]
        distinct_original = conn.execute(
            "SELECT COUNT(DISTINCT original_tariff) AS n FROM aes_items"
        ).fetchone()["n"]
        distinct_cn8 = conn.execute(
            "SELECT COUNT(DISTINCT cn8) AS n FROM aes_items"
        ).fetchone()["n"]

        sample_size = min(100, total)
        if sample_size == 0:
            random_rows = []
        else:
            random_rows = conn.execute(
                f"""
                SELECT original_tariff, cn8
                FROM aes_items
                ORDER BY RANDOM()
                LIMIT {sample_size}
                """
            ).fetchall()

        samples = [
            {
                "original_tariff": row["original_tariff"],
                "normalized_cn8": row["cn8"],
                "expected_cn8": normalize_cn8(row["original_tariff"]),
                "matches_expected": normalize_cn8(row["original_tariff"]) == row["cn8"],
            }
            for row in random_rows
        ]

        known_checks = []
        for original, expected in NORMALIZATION_SAMPLES.items():
            row = conn.execute(
                "SELECT original_tariff, cn8, COUNT(*) AS n FROM aes_items WHERE original_tariff = ? GROUP BY original_tariff, cn8",
                (original,),
            ).fetchone()
            known_checks.append(
                {
                    "original_tariff": original,
                    "expected_cn8": expected,
                    "found": row is not None,
                    "stored_cn8": row["cn8"] if row else None,
                    "count": row["n"] if row else 0,
                    "correct": row["cn8"] == expected if row else None,
                }
            )

        ten_digit_count = conn.execute(
            """
            SELECT COUNT(*) AS n FROM aes_items
            WHERE length(original_tariff) = 10
            """
        ).fetchone()["n"]
        eight_digit_count = conn.execute(
            """
            SELECT COUNT(*) AS n FROM aes_items
            WHERE length(original_tariff) = 8
            """
        ).fetchone()["n"]

    return {
        "present": True,
        "total_records": total,
        "distinct_original_tariffs": distinct_original,
        "distinct_cn8": distinct_cn8,
        "ten_digit_original_tariffs": ten_digit_count,
        "eight_digit_original_tariffs": eight_digit_count,
        "random_100_samples": samples,
        "known_normalization_checks": known_checks,
        "random_sample_failures": sum(1 for s in samples if not s["matches_expected"]),
    }


def _detect_brands(description: str) -> list[str]:
    lower = description.lower()
    found = []
    for brand in KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", lower):
            canonical = "wurth" if brand == "würth" else brand
            if canonical not in found:
                found.append(canonical)
    return found


def _combined_coverage(exports_path: Path, imports_path: Path) -> dict:
    cn8_counter: Counter[str] = Counter()
    desc_counter: Counter[str] = Counter()
    brand_counter: Counter[str] = Counter()
    total_records = 0

    for db_path in (exports_path, imports_path):
        if not _db_exists(db_path):
            continue
        with _connect(db_path) as conn:
            rows = conn.execute(
                "SELECT item_description, cn8 FROM aes_items"
            ).fetchall()
        for row in rows:
            total_records += 1
            cn8_counter[row["cn8"]] += 1
            desc_counter[row["item_description"]] += 1
            for brand in _detect_brands(row["item_description"]):
                brand_counter[brand] += 1

    return {
        "total_records": total_records,
        "unique_cn8": len(cn8_counter),
        "top_100_cn8": [
            {"cn8": cn8, "count": count}
            for cn8, count in cn8_counter.most_common(100)
        ],
        "top_100_brands": [
            {"brand": brand, "count": count}
            for brand, count in brand_counter.most_common(100)
        ],
        "top_100_descriptions": [
            {"description": desc, "count": count}
            for desc, count in desc_counter.most_common(100)
        ],
    }


def _variance_explanation(actual: int, expected: int, *, label: str) -> str | None:
    if expected <= 0:
        return None
    diff_pct = abs(actual - expected) / expected
    if diff_pct <= VARIANCE_THRESHOLD:
        return None
    reasons = []
    if actual < expected:
        reasons.append(
            f"{label} count ({actual:,}) is {diff_pct:.1%} below expected ({expected:,}). "
            "Likely causes: deduplication during import, skipped invalid tariffs/countries/descriptions, "
            "or import not yet run from full XLSX."
        )
    else:
        reasons.append(
            f"{label} count ({actual:,}) is {diff_pct:.1%} above expected ({expected:,}). "
            "Likely causes: updated source XLSX with more rows, or duplicate-key logic differs from prior import."
        )
    return " ".join(reasons)


def run_audit() -> dict:
    exports = _audit_dataset(EXPORTS_DB, label="exports")
    imports = _audit_dataset(IMPORTS_DB, label="imports")
    normalization = _normalization_check(IMPORTS_DB)
    coverage = _combined_coverage(EXPORTS_DB, IMPORTS_DB)

    exports_actual = exports.get("records", 0) if exports.get("present") else 0
    imports_actual = imports.get("records", 0) if imports.get("present") else 0

    expected_vs_actual = {
        "exports": {
            "expected": EXPECTED_EXPORTS,
            "actual": exports_actual,
            "variance_pct": round(
                abs(exports_actual - EXPECTED_EXPORTS) / EXPECTED_EXPORTS, 4
            )
            if EXPECTED_EXPORTS
            else None,
            "within_5pct": (
                abs(exports_actual - EXPECTED_EXPORTS) / EXPECTED_EXPORTS
                <= VARIANCE_THRESHOLD
            )
            if EXPECTED_EXPORTS
            else None,
            "explanation": _variance_explanation(
                exports_actual, EXPECTED_EXPORTS, label="Exports"
            ),
        },
        "imports": {
            "expected_minimum": EXPECTED_IMPORTS_MIN,
            "actual": imports_actual,
            "variance_pct": round(
                abs(imports_actual - EXPECTED_IMPORTS_MIN) / EXPECTED_IMPORTS_MIN, 4
            )
            if EXPECTED_IMPORTS_MIN and imports_actual > 0
            else None,
            "within_5pct": (
                imports_actual >= EXPECTED_IMPORTS_MIN * (1 - VARIANCE_THRESHOLD)
            )
            if EXPECTED_IMPORTS_MIN
            else None,
            "explanation": _variance_explanation(
                imports_actual, EXPECTED_IMPORTS_MIN, label="Imports"
            )
            if imports_actual < EXPECTED_IMPORTS_MIN * (1 - VARIANCE_THRESHOLD)
            else None,
        },
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "read_only": True,
        "summary": {
            "exports_records": exports_actual,
            "imports_records": imports_actual,
            "exports_unique_cn8": exports.get("unique_cn8", 0) if exports.get("present") else 0,
            "imports_unique_cn8": imports.get("unique_cn8", 0) if imports.get("present") else 0,
            "combined_unique_cn8": coverage.get("unique_cn8", 0),
            "combined_total_records": coverage.get("total_records", 0),
            "exports_size_mb": exports.get("size_mb"),
            "imports_size_mb": imports.get("size_mb"),
        },
        "exports_database": exports,
        "imports_database": imports,
        "normalization_check": normalization,
        "coverage": coverage,
        "expected_vs_actual": expected_vs_actual,
    }


def main() -> int:
    report = run_audit()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(REPORT_PATH))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
