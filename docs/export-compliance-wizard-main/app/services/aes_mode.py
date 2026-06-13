"""AES knowledge mode — seed (dev) vs full (exports + imports production)."""

from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings
from app.services.historical_database import DEFAULT_DB_PATH

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EXPORTS_DB_PATH = DATA_DIR / "aes_exports.db"
IMPORTS_DB_PATH = DATA_DIR / "aes_imports.db"
SEED_DB_PATH = DEFAULT_DB_PATH

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_EXPORTS_XLSX = PROJECT_ROOT / "AES_EXPORTS.xlsx"
DEFAULT_IMPORTS_XLSX = PROJECT_ROOT / "AES_IMPORTS.xlsx"

EXPORT_SEARCH_WEIGHT = 0.60
IMPORT_SEARCH_WEIGHT = 0.40


def get_aes_mode() -> str:
    mode = get_settings().aes_mode.strip().lower()
    return mode if mode in {"seed", "full"} else "full"


def is_seed_mode() -> bool:
    return get_aes_mode() == "seed"


def is_full_mode() -> bool:
    return get_aes_mode() == "full"


def active_search_db_paths() -> tuple[Path, ...]:
    if is_seed_mode():
        return (SEED_DB_PATH,)
    paths: list[Path] = []
    if EXPORTS_DB_PATH.is_file():
        paths.append(EXPORTS_DB_PATH)
    if IMPORTS_DB_PATH.is_file():
        paths.append(IMPORTS_DB_PATH)
    return tuple(paths)
