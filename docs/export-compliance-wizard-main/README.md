# Textile Ranking Fix — GitHub Copy Package

**Date:** 2026-06-02  
**Target repo:** https://github.com/exportgateway/export-compliance-wizard  
**Render service:** `export-compliance-wizard` (existing)

Fixes men's jeans/trousers misclassification (6205 shirts → 6203 42 xx).

---

## Prerequisite

If you have **not** yet deployed **Historical Classifications**, deploy that package first:

`Updates/Update Historical Classifications 2026-06-02 (GitHub)/`

This textile package **overwrites** shared files (`cn_database.py`, `classification_pipeline.py`) with the latest versions that include **both** historical evidence and textile ranking fixes.

If historical is already live, copy **only this folder** into repo root.

---

## Part A — Copy to GitHub

Copy everything in this folder into your repo root (keep paths). Then commit and push.

```bash
git add .
git commit -m "Fix men's woven denim trousers ranking (6203 over 6205)"
git push origin main
```

Render auto-deploys. **No new environment variables.**

---

## Part B — WordPress

**No WordPress HTML change required.**

Classification UI loads JS/CSS from Render CDN.

---

## Files in this package (6)

| Path | Action |
|------|--------|
| `app/services/cn_entities.py` | **MODIFIED** — attribute fields for ranking |
| `app/services/cn_ranking.py` | **MODIFIED** — attribute injection, trousers leakage fix, mens boost |
| `app/services/taxonomy_service.py` | **MODIFIED** — woven priors exclude shirts for trousers |
| `app/services/cn_database.py` | **MODIFIED** — pass detected_attributes to ranker |
| `app/services/classification_pipeline.py` | **MODIFIED** — wire attributes into search |
| `tests/test_textile_ranking_fix.py` | **NEW** — regression tests |

---

## Verify after deploy

```bash
curl -s -X POST https://export-compliance-wizard.onrender.com/classify-product \
  -H "Content-Type: application/json" \
  -d '{"product_description":"500 kos moške bombažne jeans hlače","disambiguation":{"textile_construction":"woven","apparel_gender":"mens"}}'
```

Expect top suggestion: **6203 42 31** (or other `6203 42 xx`), **not** `6205 20 00`.

---

## What changed (summary)

1. **Detected attributes → ranking** — denim/cotton injected into weighted terms  
2. **Woven priors** — `apparel_trousers_mens` gets 6203 only, not 6205  
3. **Trousers leakage** — trousers/jeans/denim cannot score shirt headings  
4. **Mens trousers boost** — boost 6203, penalize 6205/6206/6204  

---

## Source location

`C:\Users\blažso\Documents\CURSOR\export-compliance-wizard\`
