"""Shared AES Excel loading, cleaning, and deduplication for exports/imports."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from app.services.aes_dataset_database import AesDatasetRecord
from app.services.aes_tariff_normalize import (
    NormalizedTariff,
    normalize_export_tariff,
    normalize_import_tariff,
)
from app.services.historical_normalize import (
    build_quality_flags,
    normalize_aes_description,
    normalize_country_code,
    strip_aes_quantity,
)

HEADER_MARKERS = frozenset(
    {
        "drž.",
        "drz.",
        "tarifa",
        "tariff",
        "taric",
        "opis blaga",
        "opis",
        "izvoznik",
        "prejemnik",
        "uvoznik",
        "drz",
    }
)

COLUMN_ALIASES = {
    "export_country": ("export_country", "izvoznik", "drz_izvoza", "država izvoza"),
    "import_country": ("import_country", "prejemnik", "drz_prejemnika", "država prejemnika"),
    "tariff": ("tariff", "tarifa", "cn8", "cn_code", "ctn", "taric", "carinska tarifa"),
    "description": (
        "description",
        "item_description",
        "opis",
        "opis blaga",
        "artikel",
        "itemdescription",
    ),
    "net_mass": ("net_mass", "neto masa", "net_mass_kg", "masa"),
}


@dataclass(frozen=True)
class ImportStats:
    rows_read: int = 0
    rows_inserted: int = 0
    skipped_invalid_tariff: int = 0
    skipped_empty_description: int = 0
    skipped_invalid_countries: int = 0
    skipped_header_repeats: int = 0
    skipped_duplicates: int = 0

    def to_dict(self) -> dict:
        return {
            "rows_read": self.rows_read,
            "rows_inserted": self.rows_inserted,
            "skipped_invalid_tariff": self.skipped_invalid_tariff,
            "skipped_empty_description": self.skipped_empty_description,
            "skipped_invalid_countries": self.skipped_invalid_countries,
            "skipped_header_repeats": self.skipped_header_repeats,
            "skipped_duplicates": self.skipped_duplicates,
        }


def _is_header_repeat(cells: list) -> bool:
    normalized = [str(cell).strip().lower() for cell in cells if cell is not None and str(cell).strip()]
    if not normalized:
        return True
    return any(cell in HEADER_MARKERS for cell in normalized[:5])


def _parse_mass(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if not text or text.lower() == "nan":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _normalize_col(name: str) -> str:
    folded = re.sub(r"[^\w\s]", "", str(name).strip().lower())
    return re.sub(r"\s+", "_", folded)


def _resolve_columns(columns: list[str]) -> dict[str, str | None]:
    normalized = {_normalize_col(col): col for col in columns}
    resolved: dict[str, str | None] = {}
    for field, aliases in COLUMN_ALIASES.items():
        resolved[field] = None
        for alias in aliases:
            key = _normalize_col(alias)
            if key in normalized:
                resolved[field] = normalized[key]
                break
    return resolved


def _pick_sheet(path: Path, *, direction: str) -> str:
    import pandas as pd

    xl = pd.ExcelFile(path)
    preferred = ("import", "ais") if direction == "import" else ("export", "aes")
    for candidate in xl.sheet_names:
        lower = candidate.lower()
        if any(token in lower for token in preferred):
            return candidate
    return xl.sheet_names[0]


def _load_aes_exports_sheet(path: Path) -> list[dict]:
    """AES_EXPORTS.xlsx — header row 1, tariff in column 4 (after item_no)."""
    import pandas as pd

    sheet = _pick_sheet(path, direction="export")
    df = pd.read_excel(path, sheet_name=sheet, header=1, dtype=str, engine="openpyxl")
    if len(df.columns) >= 5:
        df = df.iloc[:, :6].copy()
        df.columns = [
            "export_country",
            "import_country",
            "item_no",
            "tariff",
            "description",
            "net_mass",
        ]
        return [
            {
                "export_country": row.export_country,
                "import_country": row.import_country,
                "tariff": row.tariff,
                "description": row.description,
                "net_mass": row.net_mass,
            }
            for row in df.itertuples(index=False)
        ]

    columns = _resolve_columns(list(df.columns))
    if not columns["tariff"] or not columns["description"]:
        raise ValueError(f"Could not resolve tariff/description columns in {path}")

    records: list[dict] = []
    for row in df.to_dict(orient="records"):
        records.append(
            {
                "export_country": row.get(columns["export_country"]),
                "import_country": row.get(columns["import_country"]),
                "tariff": row.get(columns["tariff"]),
                "description": row.get(columns["description"]),
                "net_mass": row.get(columns["net_mass"]),
            }
        )
    return records


def _load_aes_imports_sheet(path: Path) -> list[dict]:
    """
    AES_IMPORTS.xlsx — header row 2 (0-based).
    Columns: Izvoznik/Drž., Uvoznik/Drž., Postavka/TARIC, Opis blaga, Neto masa.
    """
    import pandas as pd

    sheet = _pick_sheet(path, direction="import")
    df = pd.read_excel(path, sheet_name=sheet, header=2, dtype=str, engine="openpyxl")
    if len(df.columns) < 5:
        raise ValueError(f"Expected at least 5 columns in imports sheet {sheet}, got {len(df.columns)}")

    df = df.iloc[:, :5].copy()
    df.columns = ["export_country", "import_country", "tariff", "description", "net_mass"]
    return [
        {
            "export_country": row.export_country,
            "import_country": row.import_country,
            "tariff": row.tariff,
            "description": row.description,
            "net_mass": row.net_mass,
        }
        for row in df.itertuples(index=False)
    ]


def _dedupe_key(
    *,
    export_country: str | None,
    import_country: str | None,
    cn8: str,
    description_normalized: str,
    net_mass_kg: float | None,
) -> tuple:
    mass_bucket = round(net_mass_kg, 3) if net_mass_kg is not None else None
    return (export_country, import_country, cn8, description_normalized, mass_bucket)


def _normalize_description(description: str, *, fast: bool) -> tuple[str, str]:
    if fast:
        raw = str(description).strip()
        normalized = strip_aes_quantity(raw) or raw
        return raw, normalized
    raw, normalized, _en, _terms, _lang = normalize_aes_description(description)
    return raw, normalized


def clean_and_build_records(
    raw_rows: list[dict],
    *,
    direction: str,
    tariff_normalizer,
    fast_normalize: bool = True,
) -> tuple[list[AesDatasetRecord], ImportStats]:
    seen: set[tuple] = set()
    records: list[AesDatasetRecord] = []
    stats = ImportStats(rows_read=len(raw_rows))

    skipped_invalid_tariff = 0
    skipped_empty_description = 0
    skipped_invalid_countries = 0
    skipped_header_repeats = 0
    skipped_duplicates = 0

    for index, raw in enumerate(raw_rows):
        row_values = list(raw.values()) if isinstance(raw, dict) else list(raw)
        if _is_header_repeat(row_values):
            skipped_header_repeats += 1
            continue

        export_country = normalize_country_code(raw.get("export_country"))
        import_country = normalize_country_code(raw.get("import_country"))
        description = str(raw.get("description") or "").strip()
        normalized_tariff: NormalizedTariff | None = tariff_normalizer(raw.get("tariff"))

        if not normalized_tariff:
            skipped_invalid_tariff += 1
            continue
        if len(description) < 3 or description.lower() == "nan":
            skipped_empty_description += 1
            continue
        if not export_country or not import_country:
            skipped_invalid_countries += 1
            continue

        desc_raw, desc_norm = _normalize_description(description, fast=fast_normalize)
        net_mass = _parse_mass(raw.get("net_mass"))
        quality_flags = build_quality_flags(
            raw=desc_raw,
            net_mass_kg=net_mass,
            import_country=import_country,
        )
        dedupe = _dedupe_key(
            export_country=export_country,
            import_country=import_country,
            cn8=normalized_tariff.cn8,
            description_normalized=desc_norm,
            net_mass_kg=net_mass,
        )
        if dedupe in seen:
            skipped_duplicates += 1
            continue
        seen.add(dedupe)

        records.append(
            AesDatasetRecord(
                item_description=desc_raw,
                description_normalized=desc_norm,
                original_tariff=normalized_tariff.original_tariff,
                cn8=normalized_tariff.cn8,
                heading_code=normalized_tariff.heading_code,
                export_country=export_country,
                import_country=import_country,
                net_mass_kg=net_mass,
                quality_flags=quality_flags,
                source_id=f"{direction}:{index}",
                country_code=export_country if direction == "export" else import_country,
            )
        )

    return records, ImportStats(
        rows_read=len(raw_rows),
        rows_inserted=len(records),
        skipped_invalid_tariff=skipped_invalid_tariff,
        skipped_empty_description=skipped_empty_description,
        skipped_invalid_countries=skipped_invalid_countries,
        skipped_header_repeats=skipped_header_repeats,
        skipped_duplicates=skipped_duplicates,
    )


def load_exports_xlsx_rows(path: Path) -> list[dict]:
    return _load_aes_exports_sheet(path)


def load_imports_xlsx_rows(path: Path) -> list[dict]:
    return _load_aes_imports_sheet(path)


def build_export_records(
    path: Path,
    *,
    fast_normalize: bool = True,
) -> tuple[list[AesDatasetRecord], ImportStats]:
    raw_rows = load_exports_xlsx_rows(path)
    return clean_and_build_records(
        raw_rows,
        direction="export",
        tariff_normalizer=normalize_export_tariff,
        fast_normalize=fast_normalize,
    )


def build_import_records(
    path: Path,
    *,
    fast_normalize: bool = True,
) -> tuple[list[AesDatasetRecord], ImportStats]:
    raw_rows = load_imports_xlsx_rows(path)
    return clean_and_build_records(
        raw_rows,
        direction="import",
        tariff_normalizer=normalize_import_tariff,
        fast_normalize=fast_normalize,
    )
