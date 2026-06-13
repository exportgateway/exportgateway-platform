#!/usr/bin/env python3
"""Import AES_EXPORTS.xlsx into app/data/aes_exports.db."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.aes_dataset_database import (
    _connect,
    clear_all,
    init_schema,
    insert_records,
    record_import_meta,
)
from app.services.aes_import_common import build_export_records
from app.services.aes_mode import DEFAULT_EXPORTS_XLSX, EXPORTS_DB_PATH


def import_aes_exports(
    *,
    input_path: Path | None = None,
    db_path: Path | None = None,
    rebuild: bool = False,
) -> dict:
    source = input_path or DEFAULT_EXPORTS_XLSX
    target = db_path or EXPORTS_DB_PATH
    if not source.is_file():
        raise FileNotFoundError(f"AES exports file not found: {source}")

    records, stats = build_export_records(source)
    if not records:
        raise ValueError(f"No valid export records parsed from {source}")

    target.parent.mkdir(parents=True, exist_ok=True)
    with _connect(target) as conn:
        init_schema(conn)
        if rebuild:
            clear_all(conn)
        inserted = insert_records(conn, records)
        payload = {
            **stats.to_dict(),
            "source_file": str(source),
            "unique_cn8": len({record.cn8 for record in records}),
        }
        record_import_meta(conn, payload)
        conn.commit()

    return {
        "inserted": inserted,
        "unique_cn8": payload["unique_cn8"],
        "stats": payload,
        "db_path": str(target),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import AES exports XLSX.")
    parser.add_argument("--input", type=Path, default=DEFAULT_EXPORTS_XLSX)
    parser.add_argument("--db", type=Path, default=EXPORTS_DB_PATH)
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()

    result = import_aes_exports(
        input_path=args.input,
        db_path=args.db,
        rebuild=args.rebuild,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
