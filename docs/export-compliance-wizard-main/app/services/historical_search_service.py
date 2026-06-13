"""FTS5 search over AES historical customs declarations."""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass
from app.services.historical_database import (
    DEFAULT_DB_PATH,
    _connect,
    cn_digits,
    database_available,
    normalize_cn_code,
)
from app.services.lexicon_service import tokenize_for_search

logger = logging.getLogger(__name__)

MIN_DECLARATIONS_FOR_BOOST = 20


def build_historical_search_query(
    product_description: str,
    english_description: str | None = None,
) -> str:
    """Combine raw user text with English understanding for AES FTS (pass #1)."""
    raw = product_description.strip()
    english = (english_description or "").strip()
    if not english or english.lower() == raw.lower():
        return raw
    return f"{raw} {english}".strip()


@dataclass(frozen=True)
class HistoricalCnMatch:
    cn_code: str
    cn_digits: str
    heading_code: str
    match_count: int
    confidence: float
    top_descriptions: tuple[str, ...]
    similarity_score: float = 0.0
    country_match: float = 1.0


@dataclass(frozen=True)
class HistoricalSearchResult:
    query: str
    database_available: bool
    matches_found: int
    matches: tuple[HistoricalCnMatch, ...]
    total_declarations: int = 0


def _fts_query(tokens: list[str]) -> str:
    parts: list[str] = []
    for token in tokens:
        cleaned = re.sub(r"[^\w]+", "", token.lower())
        if len(cleaned) < 3:
            continue
        parts.append(f'"{cleaned}"' if " " in cleaned else cleaned)
    return " OR ".join(parts) if parts else ""


def _search_rows(query: str, limit: int, db_path) -> tuple[dict, ...]:
    tokens = tokenize_for_search(query)
    fts_query = _fts_query(tokens)
    if not fts_query:
        return ()

    with _connect(db_path) as conn:
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

    return tuple(dict(row) for row in rows)


def search_historical_classifications(
    query: str,
    *,
    limit: int = 5,
    db_path: DEFAULT_DB_PATH.__class__ | None = None,
    country_code: str | None = "SI",
) -> HistoricalSearchResult:
    """Search AES historical knowledge (seed or unified exports+imports)."""
    if db_path is not None:
        if not database_available(db_path):
            return HistoricalSearchResult(
                query=query,
                database_available=False,
                matches_found=0,
                matches=(),
                total_declarations=0,
            )
        try:
            raw_rows = _search_rows(query, limit, db_path)
        except sqlite3.Error as exc:
            logger.warning("Historical FTS search failed: %s", exc)
            return HistoricalSearchResult(
                query=query,
                database_available=True,
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
        target_country = (country_code or "SI").upper()
        aggregated: dict[str, dict] = {}
        for row in raw_rows:
            digits = row["cn_digits"][:8]
            if digits not in aggregated:
                aggregated[digits] = {
                    "cn_code": normalize_cn_code(digits),
                    "cn_digits": digits,
                    "heading_code": row["heading_code"][:4],
                    "match_count": 0,
                    "rank_sum": 0.0,
                    "country_hits": 0,
                    "descriptions": [],
                }
            bucket = aggregated[digits]
            bucket["match_count"] += 1
            bucket["rank_sum"] += abs(float(row["rank_score"] or 0.0))
            row_country = str(row.get("country_code") or "SI").upper()
            if row_country == target_country:
                bucket["country_hits"] += 1
            if len(bucket["descriptions"]) < 3:
                bucket["descriptions"].append(row["item_description"])

        total_hits = len(raw_rows)
        heading_totals: dict[str, int] = {}
        for item in aggregated.values():
            heading_totals[item["heading_code"]] = (
                heading_totals.get(item["heading_code"], 0) + item["match_count"]
            )

        matches: list[HistoricalCnMatch] = []
        max_rank = max(item["rank_sum"] for item in aggregated.values()) or 1.0
        for item in aggregated.values():
            count_share = item["match_count"] / total_hits
            heading_share = heading_totals.get(item["heading_code"], item["match_count"]) / total_hits
            rank_share = item["rank_sum"] / max_rank
            count_saturation = min(1.0, item["match_count"] / 25)
            confidence = (
                0.35 * count_share
                + 0.35 * heading_share
                + 0.15 * rank_share
                + 0.15 * count_saturation
            )
            if item["match_count"] > MIN_DECLARATIONS_FOR_BOOST:
                confidence = min(0.99, confidence + 0.08)
            confidence = round(min(0.99, confidence), 4)
            similarity_score = round(rank_share, 4)
            country_match = round(item["country_hits"] / item["match_count"], 4)
            matches.append(
                HistoricalCnMatch(
                    cn_code=item["cn_code"],
                    cn_digits=item["cn_digits"],
                    heading_code=item["heading_code"],
                    match_count=item["match_count"],
                    confidence=confidence,
                    top_descriptions=tuple(item["descriptions"]),
                    similarity_score=similarity_score,
                    country_match=country_match,
                )
            )
        matches.sort(key=lambda match: (match.match_count, match.confidence), reverse=True)
        top_matches = tuple(matches[:limit])
        return HistoricalSearchResult(
            query=query,
            database_available=True,
            matches_found=total_hits,
            matches=top_matches,
            total_declarations=sum(match.match_count for match in top_matches),
        )

    from app.services.unified_historical_search import search_unified_historical

    return search_unified_historical(query, limit=limit, country_code=country_code)
