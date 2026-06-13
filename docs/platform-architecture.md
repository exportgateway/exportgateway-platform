# ExportGateway — Platform Architecture

> **Source:** Complete audit of `export-compliance-wizard-main`, `freight-api-main`, `intrastat-allocation-api-main`.  
> **Date:** June 9, 2026 (updated)

---

## Ecosystem Overview

ExportGateway is implemented as **three product codebases** consolidated into **one production FastAPI deployment**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THREE REPOSITORIES (source)                          │
├─────────────────────────┬─────────────────────────┬─────────────────────────┤
│ export-compliance-      │ freight-api-main        │ intrastat-allocation-   │
│ wizard-main             │                         │ api-main                │
│                         │                         │                         │
│ • Wizard UI (Bootstrap) │ • POST /price           │ • POST /intrastat       │
│ • Classification engine │ • XGBoost + CSV engine  │ • POST /intrastat/address│
│ • Compliance APIs       │ • No UI                 │ • Mapbox route split    │
│ • PDF, leads, VAT       │ • render.yaml (legacy)  │ • No UI                 │
│ • render.yaml (primary) │                         │ • render.yaml (legacy)  │
└────────────┬────────────┴────────────┬────────────┴────────────┬────────────┘
             │                         │                         │
             └─────────────────────────┼─────────────────────────┘
                                       ▼ MERGE (June 2026)
┌─────────────────────────────────────────────────────────────────────────────┐
│              PRODUCTION: export-compliance-wizard.onrender.com               │
├─────────────────────────────────────────────────────────────────────────────┤
│  GET  /                          → Compliance Wizard UI                      │
│  POST /classify-product, /documents, /duties, /vat, /landed-cost, ...       │
│  POST /api/freight/price, /price → Freight Calculator (from freight-api)    │
│  POST /api/intrastat/*, /intrastat* → Intrastat Allocation (from intrastat)  │
└─────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PLANNED: exportgateway-platform (Next.js)                 │
│  / (homepage)  │  /platform (hub)  │  /tools/* (launch + embed pages)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Decommissioned (post-merge):**
- Render service `freight-app-bra5` (was standalone freight-api)
- Render service `intrastat-freight-allocation-api` (was standalone intrastat)

---

## Repository 1: export-compliance-wizard-main

**Role:** Primary production monolith — wizard UI + all APIs.

**Stack:** Python 3.12, FastAPI, Uvicorn, SQLite, OpenAI, Mapbox, ReportLab, XGBoost, Bootstrap 5 + vanilla JS.

### Client layer

| Client | Access pattern |
|--------|----------------|
| Wizard UI | `GET /` — single-page 4-step wizard |
| WordPress embed | iframe or JS loaded from Render; CORS `exportgateway.eu` |
| API consumers | JSON REST, no auth |
| Next.js platform (planned) | iframe wizard + API playground pages |

### Module map

| Module | Path | Origin |
|--------|------|--------|
| Compliance API | `app/api/routes.py` | Native |
| Classification pipeline | `app/services/classification_pipeline.py` | Native |
| Freight engine | `app/modules/freight/engine.py` | **freight-api-main/app.py** |
| Commercial pricing | `app/modules/freight/commercial_pricing.py` | **freight-api-main** |
| Intrastat engine | `app/modules/intrastat/` | **intrastat-allocation-api-main/app/** |
| Legacy aliases | `app/api/legacy.py` | WordPress `/price`, `/intrastat` |
| Sample transport | `app/services/transport_service.py` | Native — **not freight engine** |

### Wizard flow (UI exists)

```
Step 1 Product → POST /classify-product
Step 2 Shipment → form state
Step 3 Transport → POST /calculate-transport (SAMPLE — gap)
Step 4 Results → /documents, /duties, /vat, /landed-cost, /generate-pdf, /leads
```

### Deployment

- **File:** `render.yaml` — service `export-compliance-wizard`, starter plan
- **Build:** pip install + optional AES XLSX import
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Secrets:** OpenAI, Mapbox, SMTP, AES DBs built at deploy

---

## Repository 2: freight-api-main

**Role:** Standalone prototype — **source of truth for freight engine code**, now merged.

**Structure:** Flat monolith — `app.py` + `commercial_pricing.py` (16 files total).

### Standalone API (historical)

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/` | `{"status": "ok", "version": "ftl-fuel-engine-v1"}` |
| `POST` | `/price` | Distance + price_eur + price_range + confidence_score |

### Engine architecture (merged into wizard)

```
PriceRequest
  → get_distance() [Mapbox → haversine → 500km fallback]
  → calculate_price() [FTL: fuel-adjusted €/km | LTL: CSV + XGBoost + formula]
  → apply_commercial_markup() → round_to_5eur()
```

### Data assets

| File | Location (merged) | Role |
|------|-------------------|------|
| `freight_prices.csv` | `app/data/freight/` | ~200 historical lanes |
| `fuel_prices.json` | `app/data/freight/` | Corridor diesel (placeholder updater) |
| `price_model.pkl` | `app/data/freight/` | XGBoost LTL model |

### CI/CD (standalone repo)

- `.github/workflows/train.yml` — retrain on CSV change (note: artifact name bug)
- `.github/workflows/update_fuel.yml` — daily placeholder fuel update

### Production routes (on merged host)

- `POST /api/freight/price` — primary
- `POST /price` — legacy WordPress alias

**No UI in any repository.** ExportGateway must build a calculator page or iframe wrapper.

---

## Repository 3: intrastat-allocation-api-main

**Role:** Standalone prototype — **source of truth for Intrastat engine**, now merged.

**Structure:** Package `app/` (22 files); stale duplicates at repo root.

### Standalone API (historical)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Health message |
| `POST` | `/intrastat` | Coordinate-based allocation |
| `POST` | `/intrastat/address` | Address geocode + allocation |

### Engine architecture (merged into wizard)

```
IntrastatRequest (coords + total_cost + domestic_country)
  → mapbox.get_route()
  → country_allocation.estimate_country_breakdown() [sample + reverse geocode]
  → allocation.calculate_costs()
  → IntrastatResponse [domestic/foreign km, costs, route_segments]
```

### Key services

| File | Role |
|------|------|
| `app/services/mapbox.py` | Directions + Geocoding v6 |
| `app/services/country_allocation.py` | Route sampling, segment merge |
| `app/services/countries.py` | EU country alias normalization |
| `app/services/allocation.py` | Cost math |

### Production routes (on merged host)

- `POST /api/intrastat/`, `/api/intrastat/address`
- Legacy: `POST /intrastat`, `/intrastat/address`

**No UI in any repository.** WordPress form `egIntrastatForm` referenced in analytics only.

---

## Classification Pipeline (Compliance Wizard — unchanged detail)

**Entry:** `app/services/classification_pipeline.py`

14-stage pipeline: Product Understanding → Taxonomy Bridge → Lexicon → Commercial Products → Polysemy → Entities → Universal Profile → Family Detection → CPR → AES/Historical → Brand Knowledge → CN FTS Search + Ranking → Policy → Audit.

**AES Knowledge Engine:** `AES_MODE=full`, ~80k declarations, max 20% ranking influence, taxonomy filtering.

---

## Integration Gaps (Critical)

| Gap | Impact | Fix priority |
|-----|--------|--------------|
| Wizard uses `/calculate-transport` not `/api/freight/price` | Users get sample freight, not ML engine | P0 backend+frontend |
| No UI for Freight Calculator | Tool invisible to non-API users | P0 ExportGateway `/tools/freight-calculator` |
| No UI for Intrastat Allocation | Tool invisible to non-API users | P0 ExportGateway `/tools/intrastat-allocation` |
| Next.js site is marketing-only | No tool discovery or testing | P0 `/platform` + `/tools` hub |
| No screenshots in repos | Website needs live captures | P1 asset generation |
| Standalone Render services still referenced | Confusion about production URLs | P1 consolidate docs + env |
| Sample TARIC duties | Cannot claim duty accuracy | P2 live TARIC integration |

---

## Deployment Architecture

```
GitHub repos (3, consolidated in wizard for production)
    │
    ▼
Render: export-compliance-wizard (starter plan, Python 3.12)
    │
    ├─ OpenAI (classification)
    ├─ Mapbox (freight distance + intrastat routing)
    ├─ SMTP (leads)
    └─ SQLite DBs (CN, AES, audit) + CSV/PKL (freight)
    │
    ▼
https://export-compliance-wizard.onrender.com
    │
    ├─ CORS → exportgateway.eu
    ├─ Wizard UI → GET /
    ├─ Freight API → /api/freight/price, /price
    └─ Intrastat API → /api/intrastat/*, /intrastat*
    │
    ▼ (planned)
exportgateway-platform Next.js
    ├─ /tools/export-compliance-wizard → iframe GET /
    ├─ /tools/freight-calculator → built UI calling /api/freight/price
    └─ /tools/intrastat-allocation → built UI calling /api/intrastat/address
```

### Health monitoring (wizard only)

| Endpoint | Purpose |
|----------|---------|
| `/health/live` | Liveness |
| `/health/startup` | Component init timing |
| `/health` | Production readiness (OpenAI required) |

Freight and Intrastat standalone repos had minimal or no health endpoints; merged host inherits wizard health only.

---

## Next.js Frontend (exportgateway-platform)

**Current state:** Marketing site with platform module taxonomy — no live tool integration beyond external links to wizard URL.

**Target state:** Platform hub architecture:

| Route | Purpose |
|-------|---------|
| `/` | Homepage (keep, improve with 3-tool story) |
| `/platform` | Platform Hub — suite overview, launch all tools |
| `/tools` | Tool directory with status badges |
| `/tools/export-compliance-wizard` | iframe embed of live wizard |
| `/tools/freight-calculator` | Custom UI → `/api/freight/price` |
| `/tools/intrastat-allocation` | Custom UI → `/api/intrastat/address` |

**Environment variables needed:**

```
NEXT_PUBLIC_WIZARD_URL=https://export-compliance-wizard.onrender.com
NEXT_PUBLIC_API_BASE_URL=https://export-compliance-wizard.onrender.com
```

---

## Testing & Quality (Cross-Repo)

| Repo | Tests |
|------|-------|
| export-compliance-wizard-main | 26 test files, regression suite, platform merge test |
| freight-api-main | 10 tests (app + commercial pricing) |
| intrastat-allocation-api-main | None in standalone; merge registration tested in wizard |

---

## Asset Inventory (All Repos)

**Screenshots/images:** **Zero** across all three repositories.

**Required for website:** Live captures from:
- Wizard steps 1–4 (`GET /`)
- Freight API response card (build UI mockup from JSON schema)
- Intrastat allocation result with route segments (build UI mockup)
