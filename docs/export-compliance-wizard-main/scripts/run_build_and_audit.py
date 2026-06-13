#!/usr/bin/env python3
"""Build AES databases and produce final pre-commit audit report."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from scripts.audit_aes_databases import run_audit
from scripts.import_aes_exports import import_aes_exports
from scripts.import_aes_imports import import_aes_imports

ROOT = Path(__file__).resolve().parent.parent
FINAL_REPORT = ROOT / "reports" / "final_pre_commit_audit.json"


def main() -> int:
    exports_result = import_aes_exports(rebuild=True)
    imports_result = import_aes_imports(rebuild=True)
    audit = run_audit()

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "build": {
            "exports": exports_result,
            "imports": imports_result,
        },
        "audit": audit,
    }
    FINAL_REPORT.parent.mkdir(parents=True, exist_ok=True)
    FINAL_REPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(audit["summary"], indent=2))
    print(f"\nFull report: {FINAL_REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
