"""SQLite FTS5 storage for full AES exports and imports datasets."""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.services.aes_mode import EXPORTS_DB_PATH, IMPORTS_DB_PATH
from app.services.historical_normalize import format_cn_display

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1


@dataclass(frozen=True)
class AesDatasetRecord:
    item_description: str
    original_tariff: str
    cn8: str
    heading_code: str
    description_normalized: str = ""
    export_country: str | None = None
    import_country: str | None = None
    net_mass_kg: float | None = None
    quality_flags: str = "[]"
    source_id: str = ""
    country_code: str = "SI"


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def database_available(db_path: Path) -> bool:
    if not db_path.is_file() or db_path.stat().st_size == 0:
        return False
    try:
        with _connect(db_path) as conn:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='aes_items'"
            ).fetchone()
            return row is not None
    except sqlite3.Error:
        return False


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS aes_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL DEFAULT '',
            item_description TEXT NOT NULL,
            description_normalized TEXT NOT NULL DEFAULT '',
            original_tariff TEXT NOT NULL,
            cn8 TEXT NOT NULL,
            cn_code TEXT NOT NULL,
            cn_digits TEXT NOT NULL,
            heading_code TEXT NOT NULL,
            export_country TEXT,
            import_country TEXT,
            net_mass_kg REAL,
            quality_flags TEXT NOT NULL DEFAULT '[]',
            country_code TEXT NOT NULL DEFAULT 'SI'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS aes_items_fts USING fts5(
            item_description,
            description_normalized,
            cn_code UNINDEXED,
            cn_digits UNINDEXED,
            cn8 UNINDEXED,
            heading_code UNINDEXED,
            content='aes_items',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS aes_items_ai AFTER INSERT ON aes_items BEGIN
            INSERT INTO aes_items_fts(
                rowid, item_description, description_normalized,
                cn_code, cn_digits, cn8, heading_code
            )
            VALUES (
                new.id, new.item_description, new.description_normalized,
                new.cn_code, new.cn_digits, new.cn8, new.heading_code
            );
        END;

        CREATE TRIGGER IF NOT EXISTS aes_items_ad AFTER DELETE ON aes_items BEGIN
            INSERT INTO aes_items_fts(
                aes_items_fts, rowid, item_description, description_normalized,
                cn_code, cn_digits, cn8, heading_code
            )
            VALUES (
                'delete', old.id, old.item_description, old.description_normalized,
                old.cn_code, old.cn_digits, old.cn8, old.heading_code
            );
        END;

        CREATE TRIGGER IF NOT EXISTS aes_items_au AFTER UPDATE ON aes_items BEGIN
            INSERT INTO aes_items_fts(
                aes_items_fts, rowid, item_description, description_normalized,
                cn_code, cn_digits, cn8, heading_code
            )
            VALUES (
                'delete', old.id, old.item_description, old.description_normalized,
                old.cn_code, old.cn_digits, old.cn8, old.heading_code
            );
            INSERT INTO aes_items_fts(
                rowid, item_description, description_normalized,
                cn_code, cn_digits, cn8, heading_code
            )
            VALUES (
                new.id, new.item_description, new.description_normalized,
                new.cn_code, new.cn_digits, new.cn8, new.heading_code
            );
        END;

        CREATE INDEX IF NOT EXISTS idx_aes_items_cn8 ON aes_items(cn8);
        CREATE INDEX IF NOT EXISTS idx_aes_items_heading ON aes_items(heading_code);
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)",
        (str(SCHEMA_VERSION),),
    )


def clear_all(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM aes_items")
    conn.execute("INSERT INTO aes_items_fts(aes_items_fts) VALUES ('rebuild')")


def insert_records(conn: sqlite3.Connection, records: list[AesDatasetRecord]) -> int:
    if not records:
        return 0
    conn.executemany(
        """
        INSERT INTO aes_items(
            source_id, item_description, description_normalized,
            original_tariff, cn8, cn_code, cn_digits, heading_code,
            export_country, import_country, net_mass_kg, quality_flags, country_code
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                record.source_id,
                record.item_description.strip(),
                record.description_normalized.strip() or record.item_description.strip(),
                record.original_tariff,
                record.cn8,
                format_cn_display(record.cn8),
                record.cn8,
                record.heading_code[:4],
                record.export_country,
                record.import_country,
                record.net_mass_kg,
                record.quality_flags,
                (record.country_code or "SI").upper(),
            )
            for record in records
        ],
    )
    return len(records)


def record_import_meta(conn: sqlite3.Connection, stats: dict) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES ('import_stats', ?)",
        (json.dumps(stats),),
    )


def get_import_stats(db_path: Path) -> dict | None:
    if not database_available(db_path):
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT value FROM meta WHERE key = 'import_stats'"
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["value"])
    except json.JSONDecodeError:
        return None


def get_record_count(db_path: Path) -> int:
    if not database_available(db_path):
        return 0
    with _connect(db_path) as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM aes_items").fetchone()
        return int(row["n"]) if row else 0


def get_unique_cn8_count(db_path: Path) -> int:
    if not database_available(db_path):
        return 0
    with _connect(db_path) as conn:
        row = conn.execute("SELECT COUNT(DISTINCT cn8) AS n FROM aes_items").fetchone()
        return int(row["n"]) if row else 0


def iter_records(db_path: Path) -> list[tuple[str, str, str, str]]:
    """Yield (description, cn8, heading_code, original_tariff) for generators."""
    if not database_available(db_path):
        return []
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT item_description, cn8, heading_code, original_tariff
            FROM aes_items
            WHERE length(cn8) = 8
            """
        ).fetchall()
    return [
        (
            str(row["item_description"]),
            str(row["cn8"]),
            str(row["heading_code"])[:4],
            str(row["original_tariff"]),
        )
        for row in rows
    ]


def dataset_health(db_path: Path) -> dict:
    return {
        "path": str(db_path),
        "present": database_available(db_path),
        "records": get_record_count(db_path),
        "unique_cn8": get_unique_cn8_count(db_path),
        "import_stats": get_import_stats(db_path),
    }


def exports_health() -> dict:
    return dataset_health(EXPORTS_DB_PATH)


def imports_health() -> dict:
    return dataset_health(IMPORTS_DB_PATH)
