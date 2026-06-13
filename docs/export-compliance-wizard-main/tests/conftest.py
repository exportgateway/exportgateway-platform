import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "app" / "data" / "cn_nomenclature.db"
SOURCE_XLSX = ROOT / "app" / "data" / "sources" / "CN_2025_official_texts.xlsx"


@pytest.fixture(scope="session", autouse=True)
def ensure_cn_database():
    if DB_PATH.is_file() and DB_PATH.stat().st_size > 100_000:
        return
    cmd = [sys.executable, str(ROOT / "scripts" / "import_full_cn_nomenclature.py")]
    if SOURCE_XLSX.is_file():
        cmd.extend(["--input", str(SOURCE_XLSX)])
    else:
        cmd.append("--download")
    subprocess.run(cmd, cwd=ROOT, check=True, timeout=300)
