"""Unified AES knowledge search across exports (60%) and imports (40%)."""

from __future__ import annotations

import logging
import re
import sqlite3
from pathlib import Path

from app.services.aes_dataset_database import _connect, database_available as dataset_available
from app.services.aes_mode import (
    EXPORTS_DB_PATH,
    EXPORT_SEARCH_WEIGHT,
    IMPORTS_DB_PATH,
    IMPORT_SEARCH_WEIGHT,
    SEED_DB_PATH,
    is_seed_mode,
)
from app.services.historical_database import _connect as seed_connect
from app.services.historical_database import database_available as seed_available
from app.services.historical_database import normalize_cn_code
from app.services.historical_search_service import (
    HistoricalCnMatch,
    HistoricalSearchResult,
    MIN_DECLARATIONS_FOR_BOOST,
)
from app.services.lexicon_service import tokenize_for_search

logger = logging.getLogger(__name__)

SOURCE_WEIGHTS = {
    "export": EXPORT_SEARCH_WEIGHT,
    "import": IMPORT_SEARCH_WEIGHT,
    "seed": 1.0,
}


def _fts_query(tokens: list[str]) -> str:
    parts: list[str] = []
    for token in tokens:
        cleaned = re.sub(r"[^\w]+", "", token.lower())
        if len(cleaned) < 3:
            continue
        parts.append(f'"{cleaned}"' if " " in cleaned else cleaned)
    return " OR ".join(parts) if parts else ""


def _search_dataset_rows(
    query: str,
    limit: int,
    db_path: Path,
    *,
    source: str,
) -> tuple[dict, ...]:
    tokens = tokenize_for_search(query)
    fts_query = _fts_query(tokens)
    if not fts_query or not dataset_available(db_path):
        return ()

    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT
                i.item_description,
                i.cn_code,
                i.cn_digits,
                i.cn8,
                i.heading_code,
                COALESCE(i.country_code, 'SI') AS country_code,
                bm25(aes_items_fts) AS rank_score
            FROM aes_items_fts
            JOIN aes_items i ON i.id = aes_items_fts.rowid
            WHERE aes_items_fts MATCH ?
            ORDER BY rank_score
            LIMIT ?
            """,
            (fts_query, max(limit * 25, 100)),
        ).fetchall()

    weight = SOURCE_WEIGHTS[source]
    return tuple(
        {
            **dict(row),
            "source": source,
            "source_weight": weight,
        }
        for row in rows
    )


def _search_seed_rows(query: str, limit: int) -> tuple[dict, ...]:
    tokens = tokenize_for_search(query)
    fts_query = _fts_query(tokens)
    if not fts_query or not seed_available(SEED_DB_PATH):
        return ()

    with seed_connect(SEED_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT
                i.item_description,
                i.cn_code,
                i.cn_digits,
                i.heading_code,
                COALESCE(i.country_code, 'SI') AS country_code,
                bm25(aes_items_fts) AS rank_score
            FROM aes_items_fts
            JOIN aes_items i ON i.id = aes_items_fts.rowid
            WHERE aes_items_fts MATCH ?
            ORDER BY rank_score
            LIMIT ?
            """,
            (fts_query, max(limit * 25, 100)),
        ).fetchall()

    return tuple(
        {
            **dict(row),
            "cn8": str(row["cn_digits"])[:8],
            "source": "seed",
            "source_weight": 1.0,
        }
        for row in rows
    )


def _aggregate_weighted_rows(
    raw_rows: tuple[dict, ...],
    *,
    limit: int,
    country_code: str | None,
) -> HistoricalSearchResult:
    if not raw_rows:
        return HistoricalSearchResult(
            query="",
            database_available=True,
            matches_found=0,
            matches=(),
            total_declarations=0,
        )

    target_country = (country_code or "SI").upper()
    aggregated: dict[str, dict] = {}

    for row in raw_rows:
        digits = str(row.get("cn8") or row.get("cn_digits", ""))[:8]
        if len(digits) < 8:
            continue
        weight = float(row.get("source_weight", 1.0))
        if digits not in aggregated:
            aggregated[digits] = {
                "cn_code": normalize_cn_code(digits),
                "cn_digits": digits,
                "heading_code": str(row["heading_code"])[:4],
                "weighted_count": 0.0,
                "raw_count": 0,
                "rank_sum": 0.0,
                "country_hits": 0.0,
                "descriptions": [],
                "sources": set(),
            }
        bucket = aggregated[digits]
        bucket["weighted_count"] += weight
        bucket["raw_count"] += 1
        bucket["rank_sum"] += abs(float(row.get("rank_score") or 0.0)) * weight
        row_country = str(row.get("country_code") or "SI").upper()
        if row_country == target_country:
            bucket["country_hits"] += weight
        if len(bucket["descriptions"]) < 3:
            bucket["descriptions"].append(row["item_description"])
        bucket["sources"].add(str(row.get("source", "")))

    total_weight = sum(item["weighted_count"] for item in aggregated.values()) or 1.0
    heading_totals: dict[str, float] = {}
    for item in aggregated.values():
        heading_totals[item["heading_code"]] = (
            heading_totals.get(item["heading_code"], 0.0) + item["weighted_count"]
        )

    matches: list[HistoricalCnMatch] = []
    max_weighted = max(item["weighted_count"] for item in aggregated.values()) or 1.0
    max_rank = max(item["rank_sum"] for item in aggregated.values()) or 1.0

    for item in aggregated.values():
        count_share = item["weighted_count"] / total_weight
        heading_share = heading_totals.get(item["heading_code"], item["weighted_count"]) / total_weight
        rank_share = item["rank_sum"] / max_rank
        count_saturation = min(1.0, item["weighted_count"] / 25.0)
        confidence = (
            0.35 * count_share
            + 0.35 * heading_share
            + 0.15 * rank_share
            + 0.15 * count_saturation
        )
        if item["weighted_count"] > MIN_DECLARATIONS_FOR_BOOST:
            confidence = min(0.99, confidence + 0.08)
        confidence = round(min(0.99, confidence), 4)
        similarity_score = round(rank_share, 4)
        country_match = round(
            item["country_hits"] / item["weighted_count"] if item["weighted_count"] else 0.0,
            4,
        )
        matches.append(
            HistoricalCnMatch(
                cn_code=item["cn_code"],
                cn_digits=item["cn_digits"],
                heading_code=item["heading_code"],
                match_count=max(1, round(item["weighted_count"])),
                confidence=confidence,
                top_descriptions=tuple(item["descriptions"]),
                similarity_score=similarity_score,
                country_match=country_match,
            )
        )

    matches.sort(key=lambda match: (match.match_count, match.confidence), reverse=True)
    top_matches = tuple(matches[:limit])
    return HistoricalSearchResult(
        query="",
        database_available=True,
        matches_found=len(raw_rows),
        matches=top_matches,
        total_declarations=sum(match.match_count for match in top_matches),
    )


def search_unified_historical(
    query: str,
    *,
    limit: int = 5,
    country_code: str | None = "SI",
) -> HistoricalSearchResult:
    if is_seed_mode():
        if not seed_available(SEED_DB_PATH):
            return HistoricalSearchResult(
                query=query,
                database_available=False,
                matches_found=0,
                matches=(),
                total_declarations=0,
            )
        try:
            raw_rows = _search_seed_rows(query, limit)
        except sqlite3.Error as exc:
            logger.warning("Seed historical FTS search failed: %s", exc)
            return HistoricalSearchResult(
                query=query,
                database_available=True,
                matches_found=0,
                matches=(),
                total_declarations=0,
            )
        result = _aggregate_weighted_rows(raw_rows, limit=limit, country_code=country_code)
        return HistoricalSearchResult(
            query=query,
            database_available=result.database_available,
            matches_found=result.matches_found,
            matches=result.matches,
            total_declarations=result.total_declarations,
        )

    raw_rows: list[dict] = []
    any_db = False
    for source, db_path in (("export", EXPORTS_DB_PATH), ("import", IMPORTS_DB_PATH)):
        if not dataset_available(db_path):
            continue
        any_db = True
        try:
            raw_rows.extend(_search_dataset_rows(query, limit, db_path, source=source))
        except sqlite3.Error as exc:
            logger.warning("AES %s FTS search failed: %s", source, exc)

    if not any_db:
        if seed_available(SEED_DB_PATH):
            try:
                raw_rows = _search_seed_rows(query, limit)
            except sqlite3.Error as exc:
                logger.warning("Seed fallback FTS search failed: %s", exc)
                return HistoricalSearchResult(
                    query=query,
                    database_available=True,
                    matches_found=0,
                    matches=(),
                    total_declarations=0,
                )
            result = _aggregate_weighted_rows(raw_rows, limit=limit, country_code=country_code)
            return HistoricalSearchResult(
                query=query,
                database_available=True,
                matches_found=result.matches_found,
                matches=result.matches,
                total_declarations=result.total_declarations,
            )
        return HistoricalSearchResult(
            query=query,
            database_available=False,
            matches_found=0,
            matches=(),
            total_declarations=0,
        )

    if not raw_rows:
        return HistoricalSearchResult(
            query=query,
            database_available=True,
            matches_found=0,
            matches=(),
            total_declarations=0,
        )

    result = _aggregate_weighted_rows(tuple(raw_rows), limit=limit, country_code=country_code)
    return HistoricalSearchResult(
        query=query,
        database_available=True,
        matches_found=result.matches_found,
        matches=result.matches,
        total_declarations=result.total_declarations,
    )
