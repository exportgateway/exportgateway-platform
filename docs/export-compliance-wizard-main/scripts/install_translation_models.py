"""
Download Argos Translate language packages (source language -> English).

Packages are stored under app/data/argos_packages (or ARGOS_PACKAGES_DIR)
so Render build artifacts include offline models.

Usage:
  python scripts/install_translation_models.py --production
  python scripts/install_translation_models.py --languages de,fr,sl
  python scripts/install_translation_models.py --skip-download
  python scripts/install_translation_models.py --bootstrap-if-empty
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.argos_install_config import (  # noqa: E402
    BOOTSTRAP_LANGS,
    BUILD_REPORT_PATH,
    DEFAULT_PACKAGE_INDEX,
    INSTALL_SCRIPT_VERSION,
    PRODUCTION_LANGS,
    expected_model_pairs,
    write_build_report,
)

DEFAULT_ARGOS_DIR = ROOT / "app" / "data" / "argos_packages"

ALL_EU_LANGS = [
    "de",
    "fr",
    "it",
    "es",
    "pt",
    "nl",
    "pl",
    "cs",
    "sk",
    "hu",
    "ro",
    "bg",
    "el",
    "hr",
    "sl",
    "sr",
    "sv",
    "da",
    "fi",
    "et",
    "lv",
    "lt",
]


def log(message: str) -> None:
    print(message, flush=True)


def resolve_packages_dir(raw: str | Path) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    resolved = path.resolve()
    os.environ["ARGOS_PACKAGES_DIR"] = str(resolved)
    return resolved


def count_package_artifacts(packages_dir: Path) -> list[Path]:
    if not packages_dir.is_dir():
        return []
    artifacts: list[Path] = []
    for item in packages_dir.iterdir():
        if item.suffix == ".argosmodel":
            artifacts.append(item)
        elif item.is_dir() and (item / "metadata.json").is_file():
            artifacts.append(item)
    return artifacts


def argostranslate_paths() -> tuple[str, str, bool]:
    import argostranslate.settings as argos_settings

    configured = os.environ.get("ARGOS_PACKAGES_DIR", "")
    settings_dir = str(argos_settings.package_data_dir)
    aligned = Path(configured).resolve() == Path(settings_dir).resolve()
    index_url = str(getattr(argos_settings, "package_index", DEFAULT_PACKAGE_INDEX))
    return index_url, settings_dir, aligned


def collect_pairs() -> tuple[list[str], list[str], list[str]]:
    import argostranslate.package
    import argostranslate.translate

    installed_labels = sorted(
        {f"{pkg.from_code}->{pkg.to_code}" for pkg in argostranslate.package.get_installed_packages()}
    )
    langs = argostranslate.translate.get_installed_languages()
    detected_codes = sorted({getattr(lang, "code", "") for lang in langs if getattr(lang, "code", None)})
    en_lang = next((lang for lang in langs if lang.code == "en"), None)
    pairs: list[str] = []
    for lang in langs:
        code = getattr(lang, "code", None)
        if not code or code == "en" or en_lang is None:
            continue
        if lang.get_translation(en_lang) is not None:
            pairs.append(f"{code}->en")
    return sorted(pairs), installed_labels, detected_codes


def write_report(
    *,
    mode: str,
    packages_dir: Path,
    exit_code: int,
    targets: list[str],
    installed_count: int,
    skipped_count: int,
    failed_count: int,
    artifacts: list[Path],
    pairs: list[str],
    installed_labels: list[str],
    detected_codes: list[str],
    download_results: list[dict],
    download_errors: list[str],
    index_url: str,
    settings_dir: str,
    settings_aligned: bool,
) -> None:
    payload = {
        "install_script_version": INSTALL_SCRIPT_VERSION,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "exit_code": exit_code,
        "packages_dir": str(packages_dir),
        "package_index_url": index_url,
        "argostranslate_settings_dir": settings_dir,
        "settings_dir_aligned": settings_aligned,
        "expected_models": expected_model_pairs(tuple(targets)),
        "target_languages": targets,
        "detected_language_codes": detected_codes,
        "installed_package_labels": installed_labels,
        "available_pairs": pairs,
        "installed_package_count": installed_count,
        "skipped_count": skipped_count,
        "failed_count": failed_count,
        "package_artifacts_on_disk": len(artifacts),
        "package_artifact_names": [artifact.name for artifact in artifacts[:32]],
        "download_results": download_results,
        "download_errors": download_errors,
        "build_report_path": str(BUILD_REPORT_PATH),
    }
    report_path = write_build_report(payload)
    log(f"Wrote build report: {report_path}")


def install_targets(
    targets: list[str],
    packages_dir: Path,
    min_required: int,
    mode: str,
) -> int:
    import argostranslate.package

    index_url, settings_dir, settings_aligned = argostranslate_paths()
    log(f"install_script_version: {INSTALL_SCRIPT_VERSION}")
    log(f"Package index URL: {index_url}")
    log(f"Configured packages dir: {packages_dir}")
    log(f"Argostranslate settings package_data_dir: {settings_dir}")
    log(f"Settings dir aligned with ARGOS_PACKAGES_DIR: {settings_aligned}")
    if not settings_aligned:
        log(
            "WARNING: argostranslate.settings.package_data_dir does not match ARGOS_PACKAGES_DIR. "
            "Models may install to a different directory than runtime expects.",
        )

    log(f"Target languages -> en: {', '.join(targets)}")
    log("Updating Argos package index...")
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    log(f"Available packages in index: {len(available)}")

    installed = 0
    skipped = 0
    failures = 0
    download_results: list[dict] = []
    download_errors: list[str] = []

    for code in targets:
        if code == "en":
            continue
        package = next(
            (pkg for pkg in available if pkg.from_code == code and pkg.to_code == "en"),
            None,
        )
        if package is None:
            msg = f"No Argos package in index for {code} -> en"
            log(f"  [skip] {msg}")
            skipped += 1
            download_results.append(
                {"language": code, "status": "skipped", "reason": "not_in_index"}
            )
            continue

        log(f"  Installing {code} -> en ({package.package_version})...")
        try:
            download_path = package.download()
            log(f"    download result: {download_path}")
            argostranslate.package.install_from_path(download_path)
            installed += 1
            download_results.append(
                {
                    "language": code,
                    "status": "installed",
                    "version": package.package_version,
                    "download_path": str(download_path),
                }
            )
        except Exception as exc:
            failures += 1
            err = f"{code} -> en: {exc}"
            download_errors.append(err)
            download_results.append(
                {"language": code, "status": "failed", "error": str(exc)}
            )
            log(f"  [fail] {err}", file=sys.stderr)
            log(traceback.format_exc(), file=sys.stderr)

    artifacts = count_package_artifacts(packages_dir)
    pairs, installed_labels, detected_codes = collect_pairs()
    log(f"Installed package count: {installed} (skipped={skipped}, failed={failures})")
    log(f"Package artifacts on disk: {len(artifacts)}")
    if artifacts:
        log(f"Sample artifacts: {', '.join(item.name for item in artifacts[:8])}")
    log(f"Detected language codes: {', '.join(detected_codes) or '(none)'}")
    log(f"Installed package labels: {', '.join(installed_labels) or '(none)'}")
    log(f"Available pairs -> en: {', '.join(pairs) or '(none)'}")

    exit_code = 0
    if installed < min_required:
        msg = f"need at least {min_required} Argos packages installed; got {installed}."
        download_errors.append(msg)
        log(f"ERROR: {msg}", file=sys.stderr)
        exit_code = 1
    if len(pairs) < min_required:
        msg = f"need at least {min_required} Argos xx->en pairs after install; got {len(pairs)}."
        download_errors.append(msg)
        log(f"ERROR: {msg}", file=sys.stderr)
        exit_code = 1

    write_report(
        mode=mode,
        packages_dir=packages_dir,
        exit_code=exit_code,
        targets=targets,
        installed_count=installed,
        skipped_count=skipped,
        failed_count=failures,
        artifacts=artifacts,
        pairs=pairs,
        installed_labels=installed_labels,
        detected_codes=detected_codes,
        download_results=download_results,
        download_errors=download_errors,
        index_url=index_url,
        settings_dir=settings_dir,
        settings_aligned=settings_aligned,
    )
    return exit_code


def verify_existing(packages_dir: Path, min_required: int, mode: str) -> int:
    index_url, settings_dir, settings_aligned = argostranslate_paths()
    pairs, installed_labels, detected_codes = collect_pairs()
    artifacts = count_package_artifacts(packages_dir)

    log(f"install_script_version: {INSTALL_SCRIPT_VERSION}")
    log(f"Package index URL: {index_url}")
    log(f"Argos packages dir: {packages_dir}")
    log(f"Argostranslate settings package_data_dir: {settings_dir}")
    log(f"Settings dir aligned with ARGOS_PACKAGES_DIR: {settings_aligned}")
    log(f"Package artifacts on disk: {len(artifacts)}")
    if artifacts:
        log(f"Sample artifacts: {', '.join(item.name for item in artifacts[:8])}")
    log(f"Detected language codes: {', '.join(detected_codes) or '(none)'}")
    log(f"Installed package labels: {', '.join(installed_labels) or '(none)'}")
    log(f"Available pairs -> en: {', '.join(pairs) or '(none)'}")

    download_errors: list[str] = []
    exit_code = 0
    if len(pairs) < min_required:
        msg = f"need at least {min_required} Argos xx->en pairs; got {len(pairs)}."
        download_errors.append(msg)
        log(f"ERROR: {msg}", file=sys.stderr)
        exit_code = 1

    write_report(
        mode=mode,
        packages_dir=packages_dir,
        exit_code=exit_code,
        targets=list(PRODUCTION_LANGS),
        installed_count=len(installed_labels),
        skipped_count=0,
        failed_count=0,
        artifacts=artifacts,
        pairs=pairs,
        installed_labels=installed_labels,
        detected_codes=detected_codes,
        download_results=[],
        download_errors=download_errors,
        index_url=index_url,
        settings_dir=settings_dir,
        settings_aligned=settings_aligned,
    )
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Argos Translate -> English models.")
    parser.add_argument("--languages", help="Comma-separated ISO 639-1 codes")
    parser.add_argument(
        "--production",
        action="store_true",
        help=f"Install production set ({len(PRODUCTION_LANGS)} languages, recommended for Render)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help=f"Install all EU languages ({len(ALL_EU_LANGS)} languages, larger build)",
    )
    parser.add_argument(
        "--packages-dir",
        default=str(DEFAULT_ARGOS_DIR),
        help="Directory for Argos package files",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Only verify existing packages (CI / post-build smoke check)",
    )
    parser.add_argument(
        "--bootstrap-if-empty",
        action="store_true",
        help="Install production models only when package artifacts are below --min-pairs",
    )
    parser.add_argument(
        "--min-pairs",
        type=int,
        default=None,
        help="Minimum xx->en pairs required (default: ARGOS_MIN_PACKAGES or 3)",
    )
    args = parser.parse_args()

    packages_dir = resolve_packages_dir(args.packages_dir)
    min_required = args.min_pairs if args.min_pairs is not None else int(os.getenv("ARGOS_MIN_PACKAGES", "3"))

    try:
        import argostranslate.package  # noqa: F401
        import argostranslate.translate  # noqa: F401
    except ImportError:
        log("Install argostranslate first: pip install argostranslate")
        write_build_report(
            {
                "install_script_version": INSTALL_SCRIPT_VERSION,
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "mode": "import-error",
                "exit_code": 1,
                "download_errors": ["argostranslate is not installed"],
            }
        )
        return 1

    if args.bootstrap_if_empty:
        artifacts = count_package_artifacts(packages_dir)
        pairs, _, _ = collect_pairs()
        log(
            f"Bootstrap check: artifacts={len(artifacts)}, pairs={len(pairs)}, "
            f"min_required={min_required}",
        )
        if len(artifacts) >= min_required and len(pairs) >= min_required:
            log("Bootstrap skipped — Argos models already present.")
            return verify_existing(packages_dir, min_required, mode="bootstrap-skip")
        bootstrap_targets = (
            list(PRODUCTION_LANGS)
            if os.getenv("ARGOS_BOOTSTRAP_FULL", "").lower() in ("1", "true", "yes")
            else list(BOOTSTRAP_LANGS)
        )
        log(f"Bootstrap installing Argos models: {', '.join(bootstrap_targets)}")
        return install_targets(bootstrap_targets, packages_dir, min_required, mode="bootstrap")

    if args.skip_download:
        return verify_existing(packages_dir, min_required, mode="verify")

    if args.languages:
        targets = [code.strip() for code in args.languages.split(",") if code.strip()]
    elif args.full:
        targets = ALL_EU_LANGS
    elif args.production:
        targets = list(PRODUCTION_LANGS)
    else:
        targets = list(PRODUCTION_LANGS)

    return install_targets(targets, packages_dir, min_required, mode="install")


if __name__ == "__main__":
    raise SystemExit(main())
