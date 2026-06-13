# Full Historical Knowledge Mode — GitHub Deploy Package

**Date:** 2026-06-09  
**Repo:** https://github.com/exportgateway/export-compliance-wizard  
**Render:** `export-compliance-wizard` (auto-deploy on push to `main`)

## What this deploy includes

- `AES_MODE=full` (exports 60% + imports 40% unified search)
- Separate DBs: `aes_exports.db`, `aes_imports.db`
- Imports XLSX fix: `header=2` (TARIC column)
- Health endpoint: `exports_records`, `imports_records`, `exports_unique_cn8`, `imports_unique_cn8`
- Import scripts, audit scripts, lexicon/brand/taxonomy generators

## Copy to GitHub

Copy **all files in this folder** into repo root (preserve paths), then:

```bash
git add .
git commit -m "Add full AES historical knowledge mode (exports + imports)"
git push origin main
```

## Production data on Render

**Option A (recommended):** Commit `AES_EXPORTS.xlsx` and `AES_IMPORTS.xlsx` to repo root.  
Render `buildCommand` auto-imports both DBs on deploy.

**Option B:** After deploy, run in Render Shell:

```bash
PYTHONPATH=. python scripts/import_aes_exports.py --rebuild
PYTHONPATH=. python scripts/import_aes_imports.py --rebuild
PYTHONPATH=. python scripts/build_full_aes_knowledge.py
```

DB files are gitignored — they are built on Render, not committed.

## Verify live

```bash
curl https://export-compliance-wizard.onrender.com/health
```

Expect:

```json
"aes_mode": "full",
"exports_records": 62888,
"imports_records": 17321,
"exports_unique_cn8": 2430,
"imports_unique_cn8": 1550
```

## Local test before push

```powershell
$env:PYTHONPATH="."
$env:AES_MODE="full"
pytest tests/test_full_historical_mode.py tests/test_startup_diagnostics.py -q
python scripts/import_aes_exports.py --rebuild
python scripts/import_aes_imports.py --rebuild
```
