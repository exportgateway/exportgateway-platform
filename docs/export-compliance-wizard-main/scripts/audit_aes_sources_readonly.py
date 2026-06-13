#!/usr/bin/env python3
"""Read-only audit: missing new DBs, legacy DB proxy, XLSX source counts."""

from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from app.services.brand_knowledge import KNOWN_BRANDS
from app.services.historical_normalize import normalize_cn8

ROOT = Path(__file__).resolve().parent.parent
EXPORTS_DB = ROOT / "app" / "data" / "aes_exports.db"
IMPORTS_DB = ROOT / "app" / "data" / "aes_imports.db"
LEGACY_DB = ROOT.parent / "backup" / "export-compliance-wizard" / "app" / "data" / "historical_classifications.db"
EXPORTS_XLSX = ROOT / "AES_EXPORTS.xlsx"
IMPORTS_XLSX = ROOT / "AES_IMPORTS.xlsx"
REPORT = ROOT / "reports" / "aes_database_audit.json"

HEADER_MARKERS = frozenset({"drž.", "drz.", "tarifa", "tariff", "opis blaga", "opis", "izvoznik", "prejemnik"})


def _connect(path: Path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _is_header_repeat(row) -> bool:
    cells = [str(c).strip().lower() for c in row if c is not None and str(c).strip()]
    return not cells or any(c in HEADER_MARKERS for c in cells[:5])


def _audit_legacy_exports_db(path: Path) -> dict:
    if not path.is_file():
        return {"present": False, "path": str(path), "note": "Legacy export DB not found"}
    size_mb = round(path.stat().st_size / 1048576, 2)
    with _connect(path) as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "historical_classifications" not in tables:
            return {"present": True, "valid_schema": False, "path": str(path), "size_mb": size_mb}

        records = conn.execute("SELECT COUNT(*) n FROM historical_classifications").fetchone()["n"]
        unique_cn8 = conn.execute(
            "SELECT COUNT(DISTINCT cn8) n FROM historical_classifications"
        ).fetchone()["n"]
        top_cn8 = [
            {"cn8": r["cn8"], "count": r["n"]}
            for r in conn.execute(
                "SELECT cn8, COUNT(*) n FROM historical_classifications GROUP BY cn8 ORDER BY n DESC LIMIT 50"
            )
        ]
        top_desc = [
            {"description": r["description_normalized"], "cn8": r["cn8"], "count": r["n"]}
            for r in conn.execute(
                """
                SELECT description_normalized, cn8, COUNT(*) n
                FROM historical_classifications
                GROUP BY description_normalized, cn8
                ORDER BY n DESC LIMIT 50
                """
            )
        ]
        empty_desc = conn.execute(
            "SELECT COUNT(*) n FROM historical_classifications WHERE trim(description_normalized)=''"
        ).fetchone()["n"]
        invalid_cn8 = conn.execute(
            "SELECT COUNT(*) n FROM historical_classifications WHERE length(cn8)!=8"
        ).fetchone()["n"]
        dup_records = conn.execute(
            """
            SELECT COALESCE(SUM(cnt-1),0) n FROM (
              SELECT COUNT(*) cnt FROM historical_classifications
              GROUP BY export_country, import_country, cn8, description_normalized, net_mass_kg
              HAVING COUNT(*)>1
            )
            """
        ).fetchone()["n"]
    return {
        "present": True,
        "valid_schema": True,
        "path": str(path),
        "label": "legacy_historical_classifications (exports proxy)",
        "size_mb": size_mb,
        "records": records,
        "unique_cn8": unique_cn8,
        "top_50_cn8": top_cn8,
        "top_50_descriptions": top_desc,
        "quality": {
            "empty_descriptions": empty_desc,
            "invalid_cn8": invalid_cn8,
            "duplicate_records": dup_records,
        },
    }


def _audit_xlsx(path: Path, *, direction: str) -> dict:
    if not path.is_file():
        return {"present": False, "path": str(path)}
    import pandas as pd

    size_mb = round(path.stat().st_size / 1048576, 2)
    xl = pd.ExcelFile(path)
    sheet = xl.sheet_names[0]
    for s in xl.sheet_names:
        if "export" in s.lower() or "import" in s.lower() or "aes" in s.lower():
            sheet = s
            break
    df = pd.read_excel(path, sheet_name=sheet, header=1, dtype=str, engine="openpyxl")
    col_count = len(df.columns)
    if col_count >= 6:
        df = df.iloc[:, :6].copy()
        df.columns = ["export_country", "import_country", "item_no", "tariff", "description", "net_mass"]
    elif col_count == 5:
        df = df.iloc[:, :5].copy()
        df.columns = ["export_country", "import_country", "item_no", "tariff", "description"]
        df["net_mass"] = None
    else:
        return {
            "present": True,
            "path": str(path),
            "size_mb": size_mb,
            "sheet": sheet,
            "error": f"Unexpected column count: {col_count}",
            "columns": list(df.columns),
        }

    rows_read = len(df)
    skipped_header = 0
    skipped_invalid_tariff = 0
    skipped_empty_desc = 0
    skipped_countries = 0
    seen = set()
    skipped_dup = 0
    cn8_counter: Counter[str] = Counter()
    desc_counter: Counter[str] = Counter()
    original_tariffs: set[str] = set()
    cn8_set: set[str] = set()
    norm_samples = []
    norm_failures = 0

    for _i, row in enumerate(df.itertuples(index=False, name=None)):
        vals = list(row)
        if _is_header_repeat(vals):
            skipped_header += 1
            continue
        export_country = str(getattr(row, "export_country", vals[0] if vals else "") or "").strip().upper()
        import_country = str(getattr(row, "import_country", vals[1] if len(vals) > 1 else "") or "").strip().upper()
        tariff_raw = str(getattr(row, "tariff", vals[3] if len(vals) > 3 else "") or "").strip()
        description = str(getattr(row, "description", vals[4] if len(vals) > 4 else "") or "").strip()
        digits = re.sub(r"\D", "", tariff_raw)
        cn8 = digits[:8] if len(digits) >= 8 else None

        if not cn8:
            skipped_invalid_tariff += 1
            continue
        if len(description) < 3 or description.lower() == "nan":
            skipped_empty_desc += 1
            continue
        if len(export_country) != 2 or len(import_country) != 2:
            skipped_countries += 1
            continue
        key = (export_country, import_country, cn8, description)
        if key in seen:
            skipped_dup += 1
            continue
        seen.add(key)

        original_tariffs.add(digits)
        cn8_set.add(cn8)
        cn8_counter[cn8] += 1
        desc_counter[description] += 1
        expected = normalize_cn8(digits)
        if expected != cn8:
            norm_failures += 1
        if len(norm_samples) < 100:
            norm_samples.append({"original_tariff": digits, "normalized_cn8": cn8, "expected": expected})

    known = {}
    for orig, exp in [("7318159090", "73181590"), ("3920102190", "39201021"), ("8302420090", "83024200")]:
        known[orig] = {"expected_cn8": exp, "rows_in_xlsx": cn8_counter.get(exp, 0)}

    return {
        "present": True,
        "path": str(path),
        "size_mb": size_mb,
        "sheet": sheet,
        "direction": direction,
        "rows_in_sheet": rows_read,
        "valid_rows_after_cleaning": len(seen),
        "unique_cn8": len(cn8_set),
        "distinct_original_tariffs": len(original_tariffs),
        "distinct_cn8": len(cn8_set),
        "top_50_cn8": [{"cn8": k, "count": v} for k, v in cn8_counter.most_common(50)],
        "top_50_descriptions": [{"description": k, "count": v} for k, v in desc_counter.most_common(50)],
        "normalization_random_100": norm_samples,
        "normalization_failures": norm_failures,
        "known_tariff_checks": known,
        "skipped": {
            "header_repeats": skipped_header,
            "invalid_tariff": skipped_invalid_tariff,
            "empty_description": skipped_empty_desc,
            "invalid_countries": skipped_countries,
            "duplicates": skipped_dup,
        },
    }


def _detect_brands(text: str) -> list[str]:
    lower = text.lower()
    found = []
    for brand in KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", lower):
            c = "wurth" if brand == "würth" else brand
            if c not in found:
                found.append(c)
    return found


def main() -> int:
    exports_xlsx = _audit_xlsx(EXPORTS_XLSX, direction="export")
    imports_xlsx = _audit_xlsx(IMPORTS_XLSX, direction="import")
    legacy = _audit_legacy_exports_db(LEGACY_DB)

    exports_actual_db = EXPORTS_DB.is_file()
    imports_actual_db = IMPORTS_DB.is_file()

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "read_only": True,
        "status": "TARGET_DATABASES_MISSING" if not (exports_actual_db and imports_actual_db) else "OK",
        "note": (
            "aes_exports.db and aes_imports.db are NOT present in app/data. "
            "Audit includes read-only XLSX source analysis and legacy historical_classifications.db proxy."
        ),
        "target_databases": {
            "aes_exports_db": {"present": exports_actual_db, "path": str(EXPORTS_DB)},
            "aes_imports_db": {"present": imports_actual_db, "path": str(IMPORTS_DB)},
        },
        "exports_database": {
            "present": exports_actual_db,
            "path": str(EXPORTS_DB),
            "xlsx_source_audit": exports_xlsx,
            "legacy_proxy": legacy if legacy.get("present") else None,
        },
        "imports_database": {
            "present": imports_actual_db,
            "path": str(IMPORTS_DB),
            "xlsx_source_audit": imports_xlsx,
        },
        "expected_vs_actual": {
            "exports": {
                "expected": 62891,
                "actual_db_records": 0,
                "actual_xlsx_valid_rows": exports_xlsx.get("valid_rows_after_cleaning"),
                "actual_legacy_db_records": legacy.get("records"),
                "within_5pct_db": False,
                "within_5pct_xlsx": (
                    abs((exports_xlsx.get("valid_rows_after_cleaning") or 0) - 62891) / 62891 <= 0.05
                ),
                "explanation": (
                    "aes_exports.db not built yet. "
                    f"XLSX cleaning yields {exports_xlsx.get('valid_rows_after_cleaning')} valid rows; "
                    f"legacy DB has {legacy.get('records')} records."
                ),
            },
            "imports": {
                "expected_minimum": 50000,
                "actual_db_records": 0,
                "actual_xlsx_valid_rows": imports_xlsx.get("valid_rows_after_cleaning"),
                "within_5pct_db": False,
                "explanation": (
                    "aes_imports.db not built yet. "
                    f"XLSX cleaning yields {imports_xlsx.get('valid_rows_after_cleaning')} valid rows."
                ),
            },
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(REPORT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
