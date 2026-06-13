"""SQLite storage and FTS5 search for the full EU CN8 nomenclature."""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "cn_nomenclature.db"

SCHEMA_VERSION = 1
MAX_SUGGESTIONS = 5


@dataclass(frozen=True)
class CnRecord:
    cn_code: str
    cn_digits: str
    description: str
    chapter_code: str
    heading_code: str
    hierarchy_path: str
    keywords: str


@dataclass(frozen=True)
class SearchHit:
    cn_code: str
    description: str
    confidence_level: float
    match_explanation: str
    raw_score: float
    matched_keywords: tuple[str, ...] = ()


def normalize_cn_code(cn_code: str) -> str:
    digits = re.sub(r"\D", "", cn_code)
    if len(digits) >= 8:
        return f"{digits[:4]} {digits[4:6]} {digits[6:8]}"
    return cn_code.strip().upper()


def cn_digits(cn_code: str) -> str:
    return re.sub(r"\D", "", cn_code)


def database_available(db_path: Path | None = None) -> bool:
    path = db_path or DEFAULT_DB_PATH
    return path.is_file() and path.stat().st_size > 0


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


@lru_cache(maxsize=1)
def get_record_count(db_path: str | None = None) -> int:
    path = Path(db_path) if db_path else DEFAULT_DB_PATH
    if not path.is_file():
        return 0
    with _connect(path) as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM cn_codes").fetchone()
        return int(row["n"]) if row else 0


def lookup_by_digits(digits: str, db_path: Path | None = None) -> CnRecord | None:
    if len(digits) < 8:
        return None
    path = db_path or DEFAULT_DB_PATH
    if not path.is_file():
        return None
    target = digits[:8]
    with _connect(path) as conn:
        row = conn.execute(
            "SELECT cn_code, cn_digits, description, chapter_code, heading_code, "
            "hierarchy_path, keywords FROM cn_codes WHERE cn_digits = ?",
            (target,),
        ).fetchone()
    if not row:
        return None
    return CnRecord(
        cn_code=row["cn_code"],
        cn_digits=row["cn_digits"],
        description=row["description"],
        chapter_code=row["chapter_code"],
        heading_code=row["heading_code"],
        hierarchy_path=row["hierarchy_path"],
        keywords=row["keywords"],
    )


def _fts_query(tokens: list[str]) -> str:
    from app.services.lexicon_service import MIN_TOKEN_LENGTH, TOKEN_WHITELIST_SHORT

    parts: list[str] = []
    for token in tokens[:16]:
        safe = re.sub(r"[^a-z0-9]", "", token.lower())
        if len(safe) >= MIN_TOKEN_LENGTH or safe in TOKEN_WHITELIST_SHORT:
            parts.append(f'"{safe}"*')
    return " OR ".join(parts) if parts else ""


def _filter_by_chapter_constraints(
    rows: list[sqlite3.Row],
    *,
    allowed_chapters: set[str],
    excluded_chapters: set[str],
) -> list[sqlite3.Row]:
    if not allowed_chapters and not excluded_chapters:
        return rows
    filtered: list[sqlite3.Row] = []
    for row in rows:
        chapter = str(row["chapter_code"] or "")
        if chapter in excluded_chapters:
            continue
        if allowed_chapters and chapter not in allowed_chapters:
            continue
        filtered.append(row)
    return filtered


def _fetch_family_first_rows(
    conn: sqlite3.Connection,
    heading_hints: set[str],
    pool_size: int,
    *,
    allowed_chapters: set[str],
    excluded_chapters: set[str],
    seen: set[str],
) -> list[sqlite3.Row]:
    """Seed candidate pool from taxonomy family headings before keyword retrieval."""
    rows: list[sqlite3.Row] = []
    for heading in list(heading_hints)[:8]:
        prefix = heading[:4]
        chapter_prefix = prefix[:2]
        if allowed_chapters and chapter_prefix not in allowed_chapters:
            continue
        if chapter_prefix in excluded_chapters:
            continue
        for row in conn.execute(
            """
            SELECT cn_code, description, keywords, hierarchy_path, chapter_code, heading_code, 0.25 AS rank
            FROM cn_codes WHERE heading_code LIKE ?
            LIMIT ?
            """,
            (f"{prefix}%", max(pool_size // 3, 40)),
        ).fetchall():
            if row["cn_code"] not in seen:
                seen.add(row["cn_code"])
                rows.append(row)
    return rows


def _fetch_candidate_rows(
    conn: sqlite3.Connection,
    retrieval_terms: list[str],
    chapter_hints: set[str],
    heading_hints: set[str],
    pool_size: int,
    *,
    allowed_chapters: set[str] | None = None,
    excluded_chapters: set[str] | None = None,
    family_first: bool = False,
) -> list[sqlite3.Row]:
    allowed_chapters = allowed_chapters or set()
    excluded_chapters = excluded_chapters or set()
    seen: set[str] = set()
    rows: list[sqlite3.Row] = []

    if family_first and heading_hints:
        rows.extend(
            _fetch_family_first_rows(
                conn,
                heading_hints,
                pool_size,
                allowed_chapters=allowed_chapters,
                excluded_chapters=excluded_chapters,
                seen=seen,
            )
        )

    fts_q = _fts_query(retrieval_terms)
    if fts_q and (not family_first or len(rows) < pool_size // 2):
        for row in conn.execute(
            """
            SELECT
                c.cn_code,
                c.description,
                c.keywords,
                c.hierarchy_path,
                c.chapter_code,
                c.heading_code,
                bm25(cn_fts) AS rank
            FROM cn_fts
            JOIN cn_codes c ON c.cn_digits = cn_fts.cn_digits
            WHERE cn_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (fts_q, pool_size),
        ).fetchall():
            chapter = str(row["chapter_code"] or "")
            if chapter in excluded_chapters:
                continue
            if allowed_chapters and chapter not in allowed_chapters and family_first:
                continue
            if row["cn_code"] not in seen:
                seen.add(row["cn_code"])
                rows.append(row)

    if len(rows) < pool_size // 2 and not family_first:
        rows.extend(_fallback_like_search(conn, retrieval_terms, pool_size, seen))

    rows = _filter_by_chapter_constraints(
        rows,
        allowed_chapters=allowed_chapters,
        excluded_chapters=excluded_chapters,
    )

    for chapter in list(chapter_hints)[:2]:
        if allowed_chapters and chapter not in allowed_chapters:
            continue
        if chapter in excluded_chapters:
            continue
        for row in conn.execute(
            """
            SELECT cn_code, description, keywords, hierarchy_path, chapter_code, heading_code, 0.5 AS rank
            FROM cn_codes WHERE chapter_code = ? LIMIT ?
            """,
            (chapter, pool_size // 4),
        ).fetchall():
            if row["cn_code"] not in seen:
                seen.add(row["cn_code"])
                rows.append(row)

    for heading in list(heading_hints)[:6]:
        prefix = heading[:4]
        chapter_prefix = prefix[:2]
        if allowed_chapters and chapter_prefix not in allowed_chapters:
            continue
        if chapter_prefix in excluded_chapters:
            continue
        for row in conn.execute(
            """
            SELECT cn_code, description, keywords, hierarchy_path, chapter_code, heading_code, 0.5 AS rank
            FROM cn_codes WHERE heading_code LIKE ? LIMIT ?
            """,
            (f"{prefix}%", pool_size // 3),
        ).fetchall():
            if row["cn_code"] not in seen:
                seen.add(row["cn_code"])
                rows.append(row)

    return _filter_by_chapter_constraints(
        rows,
        allowed_chapters=allowed_chapters,
        excluded_chapters=excluded_chapters,
    )


def _filter_family_misleading_rows(
    rows: list[sqlite3.Row],
    entities: object,
) -> list[sqlite3.Row]:
    """Drop CN rows that are common false positives for a detected product family (A.2.1)."""
    from app.services.cn_entities import ProductEntities

    if not isinstance(entities, ProductEntities):
        return rows
    families = set(entities.product_families)
    if not families:
        return rows

    kept: list[sqlite3.Row] = []
    for row in rows:
        heading = str(row["heading_code"] or "")[:4]
        blob = f"{row['description']} {row['hierarchy_path']}".lower()
        if "ups" in families:
            if heading.startswith("8543"):
                continue
            if heading.startswith("8536") and (
                "battery clamp" in blob
                or "motor vehicle" in blob
                or "heading 870" in blob
            ):
                continue
        if "proximity_sensor" in families and heading.startswith(("9025", "9026")):
            if "proximity" not in blob and "inductive" not in blob:
                continue
        if "stationery_marker" in families and heading.startswith("9612"):
            continue
        if "frequency_inverter" in families:
            if "diesel" in blob and "inverter" not in blob and "static converter" not in blob:
                if not heading.startswith("8504"):
                    continue
        if "electric_motor" in families and heading.startswith("87"):
            continue
        if families.intersection(
            {
                "furniture_office_chair",
                "furniture_office_desk",
                "furniture_cabinet",
                "furniture_shelving",
                "furniture_workstation",
            }
        ) and heading.startswith("9402"):
            if any(
                token in blob
                for token in ("dentist", "dental", "barber", "medical", "surgical", "veterinary")
            ):
                continue
        if "stationery_pen" in families and "stationery_pen_refill" not in families:
            if "refills for ballpoint" in blob:
                continue
        if "office_printer_consumable" in families and heading.startswith("8443"):
            continue
        if families.intersection({"power_supply", "ups"}) and heading.startswith("8504"):
            if "exceeding 500" in blob and "kva" in blob:
                continue
        if "shipping_container" in families and heading.startswith("87"):
            continue
        if "food_pasta" in families and heading.startswith(("22", "21", "04")):
            continue
        if "electrical_insulation_tester" in families and heading.startswith("87"):
            continue
        if "furniture_fittings" in families:
            if heading.startswith(("7318", "9403", "9405", "8304", "3926")):
                continue
        if families.intersection({"silicone_sealant", "industrial_adhesive"}):
            if heading.startswith(("4821", "3006")):
                continue
        if "protective_coating_paint" in families:
            if heading.startswith(("4810", "9701", "4821")):
                continue
        kept.append(row)
    return kept


def search_nomenclature(
    product_description: str,
    limit: int = MAX_SUGGESTIONS,
    db_path: Path | None = None,
    cpr: object | None = None,
    detected_attributes: object | None = None,
    *,
    historical_validation: object | None = None,
    aes_knowledge: object | None = None,
    brand_knowledge: object | None = None,
    search_metrics: dict[str, int] | None = None,
) -> list[SearchHit]:
    from app.models.cpr import CanonicalProductRecord
    from app.services.cn_entities import ProductEntities, extract_product_entities
    from app.services.cn_ranking import (
        apply_detected_attributes_to_entities,
        build_weighted_terms,
        collect_structure_hints,
        focus_terms_for_retrieval,
        rank_candidates,
    )
    from app.services.family_ranking import (
        build_family_ranking_context,
        restrict_candidates_to_family_space,
    )
    from app.services.universal_product_profile import UniversalProductProfile, build_universal_profile

    path = db_path or DEFAULT_DB_PATH
    if not path.is_file():
        logger.warning("CN nomenclature database missing at %s", path)
        return []

    entities = extract_product_entities(product_description)
    allowed_chapters: set[str] = set()
    excluded_chapters: set[str] = set()
    if cpr is not None and isinstance(cpr, CanonicalProductRecord):
        allowed_chapters = set(cpr.allowed_chapters)
        excluded_chapters = set(cpr.excluded_chapters)
        entities = ProductEntities(
            brands=tuple(cpr.brands),
            vehicle_types=(),
            product_families=tuple(cpr.product_families),
            excluded_tokens=frozenset(cpr.excluded_tokens),
            model_spans=tuple(cpr.model_spans),
            condition=cpr.condition,
            is_vehicle=cpr.is_vehicle,
            is_industrial_sensor=cpr.is_industrial_sensor,
            is_industrial_automation=cpr.is_industrial_automation,
            chapter_hints=frozenset(cpr.chapter_priors),
            heading_hints=frozenset(cpr.heading_priors),
            search_terms=tuple(cpr.search_terms),
            penalized_headings=frozenset(cpr.penalized_headings),
            universal_product_family=getattr(cpr, "universal_product_family", None),
            universal_product_type=getattr(cpr, "universal_product_type", None),
            universal_material=getattr(cpr, "universal_material", None),
            universal_function=getattr(cpr, "universal_function", None),
            universal_industry=getattr(cpr, "universal_industry", None),
        )

    if detected_attributes is not None and hasattr(detected_attributes, "has_any"):
        if detected_attributes.has_any():
            entities = apply_detected_attributes_to_entities(
                entities,
                material=getattr(detected_attributes, "material", None),
                fabric=getattr(detected_attributes, "fabric", None),
                construction=getattr(detected_attributes, "construction", None),
                gender=getattr(detected_attributes, "gender", None),
            )

    weighted_terms, entities = build_weighted_terms(product_description, entities)
    if not weighted_terms and not entities.is_vehicle and not entities.is_industrial:
        if not (cpr and isinstance(cpr, CanonicalProductRecord) and cpr.allowed_chapters):
            return []

    retrieval_terms = focus_terms_for_retrieval(weighted_terms)
    if not retrieval_terms and (entities.is_vehicle or entities.is_industrial or allowed_chapters):
        retrieval_terms = list(entities.search_terms)[:10] or list(
            (cpr.search_terms if cpr else [])[:10]
        )

    chapter_hints, heading_hints = collect_structure_hints(weighted_terms, entities)
    if cpr and isinstance(cpr, CanonicalProductRecord):
        chapter_hints.update(cpr.chapter_priors)
        heading_hints.update(cpr.heading_priors)

    profile = UniversalProductProfile(
        product_family=entities.universal_product_family,
        product_type=entities.universal_product_type,
        material=entities.universal_material or entities.attribute_material,
        function=entities.universal_function,
        industry=entities.universal_industry,
        primary_taxonomy_family=(
            entities.product_families[0] if entities.product_families else None
        ),
        taxonomy_family_ids=tuple(entities.product_families),
        confidence=0.75 if entities.product_families else 0.0,
    )
    ranking_context = build_family_ranking_context(
        profile=profile,
        entities=entities,
        allowed_chapters=allowed_chapters,
        heading_priors=heading_hints,
        penalized_headings=entities.penalized_headings,
    )

    pool_size = max(limit * 40, 150)

    with _connect(path) as conn:
        rows = _fetch_candidate_rows(
            conn,
            retrieval_terms,
            chapter_hints,
            heading_hints,
            pool_size,
            allowed_chapters=allowed_chapters if ranking_context.restrict_to_family_space else allowed_chapters,
            excluded_chapters=excluded_chapters,
            family_first=ranking_context.restrict_to_family_space,
        )

    if not rows:
        return []

    rows = _filter_family_misleading_rows(rows, entities)

    candidate_dicts = [
        {
            "cn_code": row["cn_code"],
            "description": row["description"],
            "hierarchy_path": row["hierarchy_path"],
            "chapter_code": row["chapter_code"],
            "heading_code": row["heading_code"],
        }
        for row in rows
    ]
    candidate_dicts = restrict_candidates_to_family_space(candidate_dicts, ranking_context)

    injected_count = 0
    if aes_knowledge is not None:
        from dataclasses import replace

        from app.services.aes_knowledge_engine import inject_historical_candidates

        pre_existing = {
            re.sub(r"\D", "", str(row.get("cn_code", "")))[:8] for row in candidate_dicts
        }
        if search_metrics is not None:
            search_metrics["cn_pool_size"] = len(pre_existing)
            search_metrics["cn_pool_cn8"] = sorted(pre_existing)
        candidate_dicts, injected_count = inject_historical_candidates(
            candidate_dicts,
            knowledge=aes_knowledge,
            nomenclature_lookup=lambda digits: lookup_by_digits(digits, path),
        )
        bonus_eligible = frozenset(
            re.sub(r"\D", "", str(row.get("cn_code", "")))[:8]
            for row in candidate_dicts
            if row.get("_aes_knowledge")
            and re.sub(r"\D", "", str(row.get("cn_code", "")))[:8] not in pre_existing
        )
        aes_knowledge = replace(aes_knowledge, bonus_eligible_cn8=bonus_eligible)
        if search_metrics is not None:
            search_metrics["historical_injected_count"] = injected_count

    ranked = rank_candidates(
        candidate_dicts,
        product_description,
        limit=limit,
        entities=entities,
        family_ranking_context=ranking_context,
        aes_knowledge=aes_knowledge,
        brand_knowledge=brand_knowledge,
    )

    if historical_validation is not None:
        from app.services.historical_validation import apply_historical_validation_to_ranked

        focus_count = sum(1 for term in weighted_terms if term.weight >= 1.0)
        ranked = apply_historical_validation_to_ranked(
            ranked,
            validation=historical_validation,
            focus_term_count=max(1, focus_count),
        )

    return [
        SearchHit(
            cn_code=item.cn_code,
            description=item.description,
            confidence_level=item.confidence_level,
            match_explanation=item.match_reason,
            raw_score=item.score,
            matched_keywords=item.matched_keywords,
        )
        for item in ranked
    ]


def _fallback_like_search(
    conn: sqlite3.Connection,
    tokens: list[str],
    limit: int,
    seen: set[str] | None = None,
) -> list[sqlite3.Row]:
    seen = seen or set()
    conditions = []
    params: list[str] = []
    from app.services.lexicon_service import TOKEN_WHITELIST_SHORT, MIN_TOKEN_LENGTH

    for token in tokens[:8]:
        if len(token) < MIN_TOKEN_LENGTH and token not in TOKEN_WHITELIST_SHORT:
            continue
        conditions.append(
            "(keywords LIKE ? OR description LIKE ? OR hierarchy_path LIKE ?)"
        )
        pattern = f"%{token}%"
        params.extend([pattern, pattern, pattern])
    if not conditions:
        return []
    sql = (
        "SELECT cn_code, description, keywords, hierarchy_path, chapter_code, heading_code, 1.0 AS rank "
        "FROM cn_codes WHERE "
        + " OR ".join(conditions)
        + " LIMIT ?"
    )
    params.append(limit)
    rows = []
    for row in conn.execute(sql, params).fetchall():
        if row["cn_code"] not in seen:
            seen.add(row["cn_code"])
            rows.append(row)
    return rows


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cn_codes (
            cn_digits TEXT PRIMARY KEY,
            cn_code TEXT NOT NULL,
            description TEXT NOT NULL,
            chapter_code TEXT NOT NULL,
            heading_code TEXT NOT NULL,
            hierarchy_path TEXT NOT NULL,
            keywords TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS cn_fts USING fts5(
            cn_digits UNINDEXED,
            cn_code,
            description,
            keywords,
            hierarchy_path,
            tokenize='unicode61 remove_diacritics 2'
        );

        CREATE INDEX IF NOT EXISTS idx_cn_codes_chapter ON cn_codes(chapter_code);
        CREATE INDEX IF NOT EXISTS idx_cn_codes_heading ON cn_codes(heading_code);
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        (str(SCHEMA_VERSION),),
    )


def clear_data(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM cn_fts")
    conn.execute("DELETE FROM cn_codes")
