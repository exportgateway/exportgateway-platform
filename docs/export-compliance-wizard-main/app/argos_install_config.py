"""Shared Argos install metadata for build script and runtime diagnostics."""

from __future__ import annotations

import json
from pathlib import Path

INSTALL_SCRIPT_VERSION = "2.1.0"

DEFAULT_PACKAGE_INDEX = (
    "https://raw.githubusercontent.com/argosopentech/argospm-index/main/"
)

# Minimum pairs required for production_ready (also used by Render gates).
CORE_LANG_PAIRS = ("de->en", "fr->en", "it->en", "sl->en")
BOOTSTRAP_LANGS = ("de", "fr", "it", "sl")

PRODUCTION_LANGS = (
    "de",
    "fr",
    "it",
    "es",
    "pl",
    "pt",
    "nl",
    "cs",
    "sk",
    "hu",
    "ro",
    "hr",
    "sl",
    "sr",
    "bg",
    "el",
)

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILD_REPORT_PATH = REPO_ROOT / "app" / "data" / "argos_build_report.json"


def expected_model_pairs(languages: tuple[str, ...] = PRODUCTION_LANGS) -> list[str]:
    return sorted(f"{code}->en" for code in languages if code != "en")


def write_build_report(payload: dict) -> Path:
    BUILD_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    BUILD_REPORT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return BUILD_REPORT_PATH


def read_build_report() -> dict | None:
    if not BUILD_REPORT_PATH.is_file():
        return None
    try:
        return json.loads(BUILD_REPORT_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
