"""Classification audit SQLite store v1 (Phase A)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.models.cpr import CanonicalProductRecord
from app.services.classification_policy import ClassificationState
from app.services.cn_database import SearchHit

DEFAULT_AUDIT_PATH = Path(__file__).resolve().parent.parent / "data" / "classification_audit.db"


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_audit_schema(db_path: Path | None = None) -> None:
    path = db_path or DEFAULT_AUDIT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS classification_runs (
                run_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                product_description TEXT NOT NULL,
                classification_text TEXT NOT NULL,
                cpr_json TEXT NOT NULL,
                classification_state TEXT NOT NULL,
                data_quality_score REAL,
                nomenclature_version TEXT,
                translation_engine TEXT,
                detected_language TEXT,
                suggestions_json TEXT,
                disambiguation_json TEXT,
                allowed_chapters TEXT,
                excluded_chapters TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_classification_runs_created
                ON classification_runs(created_at);
            """
        )


def get_nomenclature_version() -> str:
    try:
        from app.services.cn_database import DEFAULT_DB_PATH, _connect

        path = DEFAULT_DB_PATH
        if not path.is_file():
            return "unknown"
        with _connect(path) as conn:
            row = conn.execute(
                "SELECT value FROM meta WHERE key = 'cn_year'"
            ).fetchone()
            if row:
                return str(row["value"])
    except Exception:
        pass
    return "unknown"


def record_classification_run(
    *,
    product_description: str,
    classification_text: str,
    cpr: CanonicalProductRecord,
    state: ClassificationState,
    suggestions: list[SearchHit],
    translation_engine: str,
    disambiguation_questions: list[dict],
    auto_answered_questions: list[str] | None = None,
    detected_attributes: dict[str, str] | None = None,
    db_path: Path | None = None,
) -> str:
    path = db_path or DEFAULT_AUDIT_PATH
    init_audit_schema(path)
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    suggestions_payload = [
        {
            "cn_code": s.cn_code,
            "description": s.description,
            "confidence_level": s.confidence_level,
            "matched_keywords": list(s.matched_keywords),
        }
        for s in suggestions
    ]

    disambiguation_payload: dict | list = disambiguation_questions
    if auto_answered_questions or detected_attributes:
        disambiguation_payload = {
            "questions": disambiguation_questions,
            "auto_answered_questions": auto_answered_questions or [],
            "detected_attributes": detected_attributes or {},
            "resolved_answers": cpr.disambiguation_resolved,
        }

    with _connect(path) as conn:
        conn.execute(
            """
            INSERT INTO classification_runs (
                run_id, created_at, product_description, classification_text,
                cpr_json, classification_state, data_quality_score,
                nomenclature_version, translation_engine, detected_language,
                suggestions_json, disambiguation_json, allowed_chapters, excluded_chapters
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                now,
                product_description,
                classification_text,
                cpr.model_dump_json(),
                state.value,
                cpr.data_quality_score,
                get_nomenclature_version(),
                translation_engine,
                cpr.detected_language,
                json.dumps(suggestions_payload),
                json.dumps(disambiguation_payload),
                json.dumps(cpr.allowed_chapters),
                json.dumps(cpr.excluded_chapters),
            ),
        )
    return run_id


def count_runs(db_path: Path | None = None) -> int:
    path = db_path or DEFAULT_AUDIT_PATH
    if not path.is_file():
        return 0
    with _connect(path) as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM classification_runs").fetchone()
    return int(row["n"]) if row else 0
