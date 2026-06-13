"""Startup timing, memory snapshots, and Argos bootstrap diagnostics."""

from __future__ import annotations

import logging
import os
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterator

logger = logging.getLogger(__name__)

_STARTUP_REPORT: dict[str, Any] | None = None


@dataclass
class StepTiming:
    name: str
    duration_ms: float
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class StartupTracker:
    began_at: float = field(default_factory=time.perf_counter)
    completed_at: float | None = None
    steps: list[StepTiming] = field(default_factory=list)

    def mark_begin(self) -> None:
        self.began_at = time.perf_counter()
        logger.info(
            "startup begin (pid=%s, python=%s, app_env=%s)",
            os.getpid(),
            sys.version.split()[0],
            os.getenv("APP_ENV", "development"),
        )

    @contextmanager
    def step(self, name: str, **detail: Any) -> Iterator[None]:
        mem_before = memory_snapshot_mb()
        started = time.perf_counter()
        logger.info("startup step begin: %s", name)
        try:
            yield
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            mem_after = memory_snapshot_mb()
            step_detail = {
                **detail,
                "memory_mb_before": mem_before,
                "memory_mb_after": mem_after,
            }
            self.steps.append(StepTiming(name=name, duration_ms=elapsed_ms, detail=step_detail))
            logger.info(
                "startup step complete: %s (%.1f ms, mem=%s→%s MB)",
                name,
                elapsed_ms,
                mem_before,
                mem_after,
            )

    def mark_complete(self) -> None:
        self.completed_at = time.perf_counter()

    @property
    def total_ms(self) -> float:
        end = self.completed_at or time.perf_counter()
        return (end - self.began_at) * 1000

    def to_dict(self) -> dict[str, Any]:
        return {
            "startup_begin_logged": True,
            "startup_complete_logged": self.completed_at is not None,
            "total_duration_ms": round(self.total_ms, 1),
            "steps": [
                {
                    "name": step.name,
                    "duration_ms": round(step.duration_ms, 1),
                    **step.detail,
                }
                for step in self.steps
            ],
            "memory_final_mb": memory_snapshot_mb(),
        }


def memory_snapshot_mb() -> float | None:
    """Best-effort RSS in MB (Linux /proc on Render)."""
    try:
        with open("/proc/self/status", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("VmRSS:"):
                    return round(int(line.split()[1]) / 1024, 1)
    except OSError:
        pass
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        rss = usage.ru_maxrss
        if sys.platform == "darwin":
            return round(rss / (1024 * 1024), 1)
        return round(rss / 1024, 1)
    except Exception:
        return None


def probe_product_understanding() -> dict[str, Any]:
    from app.services.product_understanding_service import probe_product_understanding

    return probe_product_understanding()


def memory_footprint_report() -> dict[str, Any]:
    """Compare current RSS with documented legacy Argos/torch footprint."""
    from app.services.product_understanding_service import legacy_argos_memory_estimate_mb

    current = memory_snapshot_mb()
    legacy_overhead = legacy_argos_memory_estimate_mb()
    legacy_estimated_total = round((current or 0) + legacy_overhead, 1) if current else None
    savings = legacy_overhead if current else None
    merged_freight_headroom_mb = 100
    render_recommendation = "starter"
    if current and current + merged_freight_headroom_mb > 450:
        render_recommendation = "standard"

    return {
        "current_rss_mb": current,
        "legacy_argos_torch_overhead_mb": legacy_overhead,
        "legacy_estimated_total_mb": legacy_estimated_total,
        "estimated_memory_savings_mb": savings,
        "render_plan_recommendation": render_recommendation,
        "notes": (
            "legacy_overhead measured locally from translation_init RSS delta (~262 MB). "
            "Merged freight+intrastat typically fits Render Starter after cleanup."
        ),
    }


def probe_cn_database() -> dict[str, Any]:
    from app.services.cn_database import DEFAULT_DB_PATH, database_available, get_record_count

    available = database_available()
    count = get_record_count(str(DEFAULT_DB_PATH)) if available else 0
    size_mb = None
    if available:
        size_mb = round(DEFAULT_DB_PATH.stat().st_size / (1024 * 1024), 2)
    return {
        "available": available,
        "path": str(DEFAULT_DB_PATH),
        "record_count": count,
        "size_mb": size_mb,
    }


def probe_taxonomy() -> dict[str, Any]:
    from app.services.taxonomy_service import TAXONOMY_PATH, _load_taxonomy

    data = _load_taxonomy()
    families = data.get("families") or []
    return {
        "path": str(TAXONOMY_PATH),
        "family_count": len(families),
        "loaded": bool(families),
    }


def probe_cpr() -> dict[str, Any]:
    from app.services.commercial_product_service import DATA_PATH as commercial_products_path
    from app.services.lexicon_service import LEXICON_PATH

    return {
        "lexicon_path": str(LEXICON_PATH),
        "lexicon_exists": LEXICON_PATH.is_file(),
        "commercial_products_path": str(commercial_products_path),
        "commercial_products_exists": commercial_products_path.is_file(),
    }


def ensure_aes_historical_database() -> int:
    """Import seed AES history when the SQLite database is missing (e.g. fresh Render deploy)."""
    from app.services.historical_database import DEFAULT_DB_PATH, database_available, get_record_count

    if database_available(DEFAULT_DB_PATH):
        return get_record_count(DEFAULT_DB_PATH)

    try:
        from scripts.import_aes_historical import import_aes_historical

        import_aes_historical(rebuild=True, use_seed=True)
    except Exception as exc:
        logger.warning("AES historical database bootstrap failed: %s", exc)
        return 0
    return get_record_count(DEFAULT_DB_PATH)


def runtime_aes_import_allowed() -> bool:
    """Heavy AES XLSX imports belong in Render buildCommand, not web process startup."""
    return os.getenv("AES_RUNTIME_IMPORT", "").lower() in ("1", "true", "yes")


def ensure_aes_full_databases() -> dict[str, int]:
    """Bootstrap full AES exports/imports databases when XLSX sources are available."""
    from app.services.aes_dataset_database import database_available, get_record_count
    from app.services.aes_mode import DEFAULT_EXPORTS_XLSX, DEFAULT_IMPORTS_XLSX, EXPORTS_DB_PATH, IMPORTS_DB_PATH

    exports_records = get_record_count(EXPORTS_DB_PATH) if database_available(EXPORTS_DB_PATH) else 0
    imports_records = get_record_count(IMPORTS_DB_PATH) if database_available(IMPORTS_DB_PATH) else 0

    if not runtime_aes_import_allowed():
        if exports_records == 0 or imports_records == 0:
            logger.warning(
                "AES databases missing (exports=%s, imports=%s); runtime import disabled — "
                "run import scripts during build or set AES_RUNTIME_IMPORT=true",
                exports_records,
                imports_records,
            )
        return {
            "exports_records": exports_records,
            "imports_records": imports_records,
        }

    if exports_records == 0 and DEFAULT_EXPORTS_XLSX.is_file():
        try:
            from scripts.import_aes_exports import import_aes_exports

            import_aes_exports(rebuild=True)
            exports_records = get_record_count(EXPORTS_DB_PATH)
        except Exception as exc:
            logger.warning("AES exports bootstrap failed: %s", exc)

    if imports_records == 0 and DEFAULT_IMPORTS_XLSX.is_file():
        try:
            from scripts.import_aes_imports import import_aes_imports

            import_aes_imports(rebuild=True)
            imports_records = get_record_count(IMPORTS_DB_PATH)
        except Exception as exc:
            logger.warning("AES imports bootstrap failed: %s", exc)

    return {
        "exports_records": exports_records,
        "imports_records": imports_records,
    }


def ensure_aes_databases() -> dict[str, Any]:
    """Ensure AES databases for the active mode (seed or full)."""
    from app.services.aes_mode import get_aes_mode

    mode = get_aes_mode()
    if mode == "seed":
        seed_records = ensure_aes_historical_database()
        return {"mode": "seed", "seed_records": seed_records}
    counts = ensure_aes_full_databases()
    return {"mode": "full", **counts}


def probe_aes_knowledge_engine() -> dict[str, Any]:
    from app.services.aes_dataset_database import (
        database_available as dataset_available,
        get_record_count as dataset_count,
        get_unique_cn8_count,
    )
    from app.services.aes_mode import EXPORTS_DB_PATH, IMPORTS_DB_PATH, get_aes_mode
    from app.services.brand_knowledge import BRAND_MAP_PATH, _load_brand_map
    from app.services.historical_database import DEFAULT_DB_PATH, database_available, get_record_count
    from app.services.lexicon_service import INDUSTRIAL_LEXICON_PATH, _load_industrial_lexicon

    mode = get_aes_mode()
    legacy_path = DEFAULT_DB_PATH.parent / "historical_classifications.db"
    seed_present = database_available(DEFAULT_DB_PATH)
    seed_records = get_record_count(DEFAULT_DB_PATH) if seed_present else 0

    exports_present = dataset_available(EXPORTS_DB_PATH)
    imports_present = dataset_available(IMPORTS_DB_PATH)
    exports_records = dataset_count(EXPORTS_DB_PATH) if exports_present else 0
    imports_records = dataset_count(IMPORTS_DB_PATH) if imports_present else 0
    exports_unique_cn8 = get_unique_cn8_count(EXPORTS_DB_PATH) if exports_present else 0
    imports_unique_cn8 = get_unique_cn8_count(IMPORTS_DB_PATH) if imports_present else 0

    industrial = _load_industrial_lexicon()
    industrial_phrases = len(industrial.get("entries", []))

    brand_payload = _load_brand_map()
    brand_entries = len(brand_payload.get("brands", []))

    enabled = True
    active_records = (
        exports_records + imports_records if mode == "full" else seed_records
    )
    candidate_injection_active = enabled and active_records > 0

    return {
        "enabled": enabled,
        "aes_mode": mode,
        "historical_db_present": seed_present,
        "historical_records": seed_records,
        "exports_records": exports_records,
        "imports_records": imports_records,
        "exports_unique_cn8": exports_unique_cn8,
        "imports_unique_cn8": imports_unique_cn8,
        "industrial_lexicon_phrases": industrial_phrases,
        "brand_entries": brand_entries,
        "candidate_injection_active": candidate_injection_active,
        "historical_db_path": str(DEFAULT_DB_PATH),
        "exports_db_path": str(EXPORTS_DB_PATH),
        "imports_db_path": str(IMPORTS_DB_PATH),
        "legacy_historical_classifications_db_present": legacy_path.is_file(),
        "legacy_historical_classifications_db_path": str(legacy_path),
        "industrial_lexicon_path": str(INDUSTRIAL_LEXICON_PATH),
        "industrial_lexicon_loaded": INDUSTRIAL_LEXICON_PATH.is_file() and industrial_phrases > 0,
        "brand_map_path": str(BRAND_MAP_PATH),
        "brand_knowledge_loaded": BRAND_MAP_PATH.is_file() and brand_entries > 0,
    }


def record_startup_complete(tracker: StartupTracker, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    global _STARTUP_REPORT
    report = tracker.to_dict()
    if extra:
        report.update(extra)
    _STARTUP_REPORT = report
    logger.info(
        "startup complete (total=%.1f ms, steps=%s, mem=%s MB)",
        report["total_duration_ms"],
        len(report["steps"]),
        report.get("memory_final_mb"),
    )
    return report


def get_startup_report() -> dict[str, Any]:
    if _STARTUP_REPORT is None:
        return {
            "startup_complete_logged": False,
            "message": "Startup lifespan has not completed yet",
        }
    return _STARTUP_REPORT


def run_startup_initialization(tracker: StartupTracker) -> dict[str, Any]:
    """Run deferred startup probes. Safe to call from a background thread."""
    cn_info: dict[str, Any] = {}
    taxonomy_info: dict[str, Any] = {}
    cpr_info: dict[str, Any] = {}
    understanding_info: dict[str, Any] = {}

    with tracker.step("cn_database_init"):
        cn_info = probe_cn_database()

    with tracker.step("taxonomy_init"):
        taxonomy_info = probe_taxonomy()

    with tracker.step("cpr_init"):
        cpr_info = probe_cpr()

    with tracker.step("product_understanding_init"):
        understanding_info = probe_product_understanding()

    with tracker.step("audit_schema_init"):
        from app.services.classification_audit import init_audit_schema

        init_audit_schema()

    aes_knowledge_info: dict[str, Any] = {}
    with tracker.step("aes_knowledge_init"):
        ensure_aes_databases()
        aes_knowledge_info = probe_aes_knowledge_engine()

    freight_info: dict[str, Any] = {}
    with tracker.step("freight_data_init"):
        from app.modules.freight.engine import probe_freight_data

        freight_info = probe_freight_data()

    tracker.mark_complete()
    record_startup_complete(
        tracker,
        {
            "cn_database": cn_info,
            "taxonomy": taxonomy_info,
            "cpr": cpr_info,
            "product_understanding": understanding_info,
            "aes_knowledge_engine": aes_knowledge_info,
            "freight": freight_info,
            "memory_footprint": memory_footprint_report(),
            "routes_registered_before_lifespan": True,
        },
    )
    return {
        "understanding_info": understanding_info,
        "aes_knowledge_info": aes_knowledge_info,
    }
