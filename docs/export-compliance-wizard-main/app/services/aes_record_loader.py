"""Load AES records for lexicon, brand, and taxonomy generation."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from app.services.aes_dataset_database import database_available, iter_records
from app.services.aes_mode import (
    EXPORTS_DB_PATH,
    EXPORT_SEARCH_WEIGHT,
    IMPORTS_DB_PATH,
    IMPORT_SEARCH_WEIGHT,
    SEED_DB_PATH,
    is_full_mode,
    is_seed_mode,
)
from app.services.historical_database import database_available as seed_available


@dataclass(frozen=True)
class WeightedAesRecord:
    description: str
    cn8: str
    heading_code: str
    weight: float
    source: str
    original_tariff: str = ""


def iter_seed_records() -> Iterator[WeightedAesRecord]:
    if not seed_available(SEED_DB_PATH):
        return
    from app.services.historical_database import _connect

    with _connect(SEED_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT item_description, cn_digits, heading_code
            FROM aes_items
            WHERE length(cn_digits) >= 8
            """
        ).fetchall()
    for row in rows:
        yield WeightedAesRecord(
            description=str(row["item_description"]),
            cn8=str(row["cn_digits"])[:8],
            heading_code=str(row["heading_code"])[:4],
            weight=1.0,
            source="seed",
        )


def iter_full_records(
    *,
    include_exports: bool = True,
    include_imports: bool = True,
) -> Iterator[WeightedAesRecord]:
    if include_exports and database_available(EXPORTS_DB_PATH):
        for description, cn8, heading, original_tariff in iter_records(EXPORTS_DB_PATH):
            yield WeightedAesRecord(
                description=description,
                cn8=cn8,
                heading_code=heading,
                weight=EXPORT_SEARCH_WEIGHT,
                source="export",
                original_tariff=original_tariff,
            )
    if include_imports and database_available(IMPORTS_DB_PATH):
        for description, cn8, heading, original_tariff in iter_records(IMPORTS_DB_PATH):
            yield WeightedAesRecord(
                description=description,
                cn8=cn8,
                heading_code=heading,
                weight=IMPORT_SEARCH_WEIGHT,
                source="import",
                original_tariff=original_tariff,
            )


def iter_active_records(
    *,
    mode: str | None = None,
    exports_only: bool = False,
) -> Iterator[WeightedAesRecord]:
    selected = (mode or ("full" if is_full_mode() else "seed")).lower()
    if selected == "seed":
        yield from iter_seed_records()
        return
    yield from iter_full_records(
        include_exports=True,
        include_imports=not exports_only,
    )


def source_databases_for_mode(mode: str) -> list[str]:
    if mode == "seed":
        return [str(SEED_DB_PATH)]
    paths = []
    if database_available(EXPORTS_DB_PATH):
        paths.append(str(EXPORTS_DB_PATH))
    if mode == "full" and database_available(IMPORTS_DB_PATH):
        paths.append(str(IMPORTS_DB_PATH))
    return paths
