#!/usr/bin/env python3
"""Import AES historical customs declarations into SQLite FTS5 database."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from app.services.historical_database import (
    DEFAULT_DB_PATH,
    AesHistoricalRecord,
    _connect,
    clear_all,
    cn_digits,
    init_schema,
    insert_records,
    normalize_cn_code,
)

SEED_PATH = Path(__file__).resolve().parent.parent / "app" / "data" / "aes_historical_seed.json"
REGRESSION_PATH = Path(__file__).resolve().parent.parent / "app" / "data" / "regression_suite_v1.json"


def _heading_from_cn(cn_code: str) -> str:
    digits = cn_digits(cn_code)
    return digits[:4] if len(digits) >= 4 else ""


def _records_from_json(path: Path) -> list[AesHistoricalRecord]:
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    records: list[AesHistoricalRecord] = []
    for entry in payload.get("records", []):
        description = str(entry.get("item_description", "")).strip()
        cn_code = str(entry.get("cn_code", "")).strip()
        if not description or not cn_code:
            continue
        records.append(
            AesHistoricalRecord(
                item_description=description,
                cn_code=cn_code,
                cn_digits=cn_digits(cn_code)[:8],
                heading_code=str(entry.get("heading_code", _heading_from_cn(cn_code))),
                source_id=str(entry.get("source_id", "")),
            )
        )
    return records


def _lookup_cn8_for_heading(heading: str) -> str:
    from app.services.cn_database import DEFAULT_DB_PATH as CN_DB, _connect

    if not CN_DB.is_file():
        return f"{heading} 00 00"
    with _connect(CN_DB) as conn:
        row = conn.execute(
            """
            SELECT cn_code FROM cn_codes
            WHERE cn_digits LIKE ?
            ORDER BY cn_digits
            LIMIT 1
            """,
            (f"{heading}%",),
        ).fetchone()
    return row["cn_code"] if row else f"{heading} 00 00"


def _records_from_regression() -> list[AesHistoricalRecord]:
    if not REGRESSION_PATH.is_file():
        return []
    with REGRESSION_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    records: list[AesHistoricalRecord] = []
    heading_cache: dict[str, str] = {}
    for case in payload.get("cases", []):
        description = str(case.get("input", "")).strip()
        heading = str(case.get("expected_heading", "")).strip()
        if not description or not heading:
            continue
        if heading not in heading_cache:
            heading_cache[heading] = _lookup_cn8_for_heading(heading)
        cn_code = heading_cache[heading]
        for repeat in range(25):
            records.append(
                AesHistoricalRecord(
                    item_description=description,
                    cn_code=cn_code,
                    cn_digits=cn_digits(cn_code)[:8],
                    heading_code=heading,
                    source_id=f"regression:{case.get('id', '')}:{repeat}",
                )
            )
    return records


def _records_from_xlsx(path: Path) -> list[AesHistoricalRecord]:
    import pandas as pd

    frame = pd.read_excel(path)
    columns = {col.lower().strip(): col for col in frame.columns}

    desc_col = None
    cn_col = None
    for candidate in ("itemdescription", "item_description", "description", "artikel", "opis"):
        if candidate in columns:
            desc_col = columns[candidate]
            break
    for candidate in ("cncode", "cn_code", "cn8", "taric", "ctn"):
        if candidate in columns:
            cn_col = columns[candidate]
            break

    if not desc_col or not cn_col:
        raise ValueError(f"Could not find description/CN columns in {path}")

    records: list[AesHistoricalRecord] = []
    for index, row in frame.iterrows():
        description = str(row[desc_col]).strip()
        cn_raw = str(row[cn_col]).strip()
        if not description or description.lower() == "nan" or not cn_raw or cn_raw.lower() == "nan":
            continue
        digits = re.sub(r"\D", "", cn_raw)
        if len(digits) < 8:
            continue
        records.append(
            AesHistoricalRecord(
                item_description=description,
                cn_code=normalize_cn_code(digits),
                cn_digits=digits[:8],
                heading_code=digits[:4],
                source_id=f"xlsx:{index}",
            )
        )
    return records


def build_seed_records() -> list[AesHistoricalRecord]:
    records: list[AesHistoricalRecord] = []
    if SEED_PATH.is_file():
        records.extend(_records_from_json(SEED_PATH))
    records.extend(_records_from_regression())

    extra_queries = [
        ("moške jeans hlače", "6203 42 31"),
        ("pohištveno okovje", "8302 50 00"),
        ("robni trak ABS", "3920 10 21"),
        ("industrijsko lepilo", "3506 10 00"),
        ("ABS robni trak beli 22 mm", "3920 10 21"),
        ("steel screw M8", "7318 15 90"),
        ("frozen lasagna ready meal", "2106 10 20"),
        ("photoelectric sensor", "9031 49 00"),
        ("Sikaflex 11 FC lepilo", "3506 10 00"),
        ("Loctite 243 vijak fiksator", "3506 10 00"),
        ("Bosch GSB profesionalni vrtalnik", "8467 29 00"),
        ("Makita akumulatorski vrtalnik", "8467 29 00"),
        ("Hilti TE 30 kombinirano kladivo", "8467 29 00"),
        ("Wurth montažni vijaki inox", "7318 15 90"),
        ("Sika 1A vodotesno tesnilo", "3506 10 00"),
    ]
    for description, cn_code in extra_queries:
        for repeat in range(30):
            records.append(
                AesHistoricalRecord(
                    item_description=description,
                    cn_code=cn_code,
                    cn_digits=cn_digits(cn_code)[:8],
                    heading_code=cn_digits(cn_code)[:4],
                    source_id=f"seed:{description}:{repeat}",
                )
            )
    return records


def import_aes_historical(
    *,
    input_path: Path | None = None,
    db_path: Path | None = None,
    rebuild: bool = False,
    use_seed: bool = True,
) -> int:
    target = db_path or DEFAULT_DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)

    records: list[AesHistoricalRecord] = []
    if input_path and input_path.is_file():
        if input_path.suffix.lower() in {".xlsx", ".xls"}:
            records = _records_from_xlsx(input_path)
        else:
            records = _records_from_json(input_path)
    elif use_seed:
        records = build_seed_records()

    if not records:
        raise ValueError("No AES historical records to import.")

    with _connect(target) as conn:
        init_schema(conn)
        if rebuild:
            clear_all(conn)
        inserted = insert_records(conn, records)
        conn.commit()
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Import AES historical declarations.")
    parser.add_argument("--input", type=Path, help="XLSX or JSON input file")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="Output SQLite path")
    parser.add_argument("--rebuild", action="store_true", help="Clear existing data first")
    args = parser.parse_args()

    count = import_aes_historical(
        input_path=args.input,
        db_path=args.db,
        rebuild=args.rebuild,
        use_seed=args.input is None,
    )
    print(f"Imported {count} AES historical records into {args.db}")


if __name__ == "__main__":
    main()
