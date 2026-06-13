"""SQLite FTS5 storage for AES historical customs declarations."""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "aes_historical.db"
SCHEMA_VERSION = 2


@dataclass(frozen=True)
class AesHistoricalRecord:
    item_description: str
    cn_code: str
    cn_digits: str
    heading_code: str
    source_id: str = ""
    country_code: str = "SI"


def cn_digits(cn_code: str) -> str:
    return re.sub(r"\D", "", cn_code)


def normalize_cn_code(cn_code: str) -> str:
    digits = cn_digits(cn_code)
    if len(digits) >= 8:
        return f"{digits[:4]} {digits[4:6]} {digits[6:8]}"
    return cn_code.strip()


def database_available(db_path: Path | None = None) -> bool:
    path = db_path or DEFAULT_DB_PATH
    if not path.is_file() or path.stat().st_size == 0:
        return False
    try:
        with _connect(path) as conn:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='aes_items'"
            ).fetchone()
            return row is not None
    except sqlite3.Error:
        return False


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


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
            cn_code TEXT NOT NULL,
            cn_digits TEXT NOT NULL,
            heading_code TEXT NOT NULL,
            country_code TEXT NOT NULL DEFAULT 'SI'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS aes_items_fts USING fts5(
            item_description,
            cn_code UNINDEXED,
            cn_digits UNINDEXED,
            heading_code UNINDEXED,
            content='aes_items',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS aes_items_ai AFTER INSERT ON aes_items BEGIN
            INSERT INTO aes_items_fts(rowid, item_description, cn_code, cn_digits, heading_code)
            VALUES (new.id, new.item_description, new.cn_code, new.cn_digits, new.heading_code);
        END;

        CREATE TRIGGER IF NOT EXISTS aes_items_ad AFTER DELETE ON aes_items BEGIN
            INSERT INTO aes_items_fts(aes_items_fts, rowid, item_description, cn_code, cn_digits, heading_code)
            VALUES ('delete', old.id, old.item_description, old.cn_code, old.cn_digits, old.heading_code);
        END;

        CREATE TRIGGER IF NOT EXISTS aes_items_au AFTER UPDATE ON aes_items BEGIN
            INSERT INTO aes_items_fts(aes_items_fts, rowid, item_description, cn_code, cn_digits, heading_code)
            VALUES ('delete', old.id, old.item_description, old.cn_code, old.cn_digits, old.heading_code);
            INSERT INTO aes_items_fts(rowid, item_description, cn_code, cn_digits, heading_code)
            VALUES (new.id, new.item_description, new.cn_code, new.cn_digits, new.heading_code);
        END;

        CREATE INDEX IF NOT EXISTS idx_aes_items_cn_digits ON aes_items(cn_digits);
        CREATE INDEX IF NOT EXISTS idx_aes_items_heading ON aes_items(heading_code);
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)",
        (str(SCHEMA_VERSION),),
    )
    _migrate_schema(conn)


def _migrate_schema(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(aes_items)")}
    if "country_code" not in columns:
        conn.execute("ALTER TABLE aes_items ADD COLUMN country_code TEXT NOT NULL DEFAULT 'SI'")


def clear_all(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM aes_items")
    conn.execute("INSERT INTO aes_items_fts(aes_items_fts) VALUES ('rebuild')")


def insert_records(conn: sqlite3.Connection, records: list[AesHistoricalRecord]) -> int:
    if not records:
        return 0
    conn.executemany(
        """
        INSERT INTO aes_items(source_id, item_description, cn_code, cn_digits, heading_code, country_code)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                record.source_id,
                record.item_description.strip(),
                normalize_cn_code(record.cn_code),
                cn_digits(record.cn_code)[:8],
                record.heading_code[:4] if record.heading_code else cn_digits(record.cn_code)[:4],
                (record.country_code or "SI").upper(),
            )
            for record in records
        ],
    )
    return len(records)


def get_record_count(db_path: Path | None = None) -> int:
    path = db_path or DEFAULT_DB_PATH
    if not database_available(path):
        return 0
    with _connect(path) as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM aes_items").fetchone()
        return int(row["n"]) if row else 0


def sample_records(
    *,
    limit: int,
    db_path: Path | None = None,
    seed: int | None = None,
) -> list[AesHistoricalRecord]:
    path = db_path or DEFAULT_DB_PATH
    if not database_available(path):
        return []
    order = "RANDOM()"
    if seed is not None:
        order = f"ABS(id * {seed % 9973})"
    with _connect(path) as conn:
        rows = conn.execute(
            f"""
            SELECT source_id, item_description, cn_code, cn_digits, heading_code
            FROM aes_items
            ORDER BY {order}
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        AesHistoricalRecord(
            source_id=row["source_id"],
            item_description=row["item_description"],
            cn_code=row["cn_code"],
            cn_digits=row["cn_digits"],
            heading_code=row["heading_code"],
        )
        for row in rows
    ]
