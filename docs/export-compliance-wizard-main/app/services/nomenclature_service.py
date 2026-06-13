"""EU CN8 nomenclature search backed by the local SQLite full-text database."""

from __future__ import annotations

import logging
import re

from app.services.cn_database import (
    DEFAULT_DB_PATH,
    SearchHit,
    cn_digits,
    database_available,
    get_record_count,
    lookup_by_digits as db_lookup_by_digits,
    normalize_cn_code,
    search_nomenclature as db_search_nomenclature,
)

logger = logging.getLogger(__name__)

MAX_SUGGESTIONS = 5


def ensure_database_ready() -> None:
    if not database_available():
        raise RuntimeError(
            f"EU CN nomenclature database not found at {DEFAULT_DB_PATH}. "
            "Run: python scripts/import_full_cn_nomenclature.py --download"
        )


def lookup_by_digits(digits: str):
    ensure_database_ready()
    return db_lookup_by_digits(digits)


def search_nomenclature(product_description: str, limit: int = MAX_SUGGESTIONS) -> list[SearchHit]:
    ensure_database_ready()
    return db_search_nomenclature(product_description, limit=limit)


def nomenclature_stats() -> dict[str, str | int]:
    if not database_available():
        return {"available": False, "record_count": 0, "db_path": str(DEFAULT_DB_PATH)}
    return {
        "available": True,
        "record_count": get_record_count(),
        "db_path": str(DEFAULT_DB_PATH),
    }


# Re-export helpers used by classification_service
__all__ = [
    "SearchHit",
    "cn_digits",
    "normalize_cn_code",
    "lookup_by_digits",
    "search_nomenclature",
    "nomenclature_stats",
    "MAX_SUGGESTIONS",
]
