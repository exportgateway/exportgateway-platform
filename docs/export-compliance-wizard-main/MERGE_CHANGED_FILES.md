# Changed Files — Platform Merge

Repository: `export-compliance-wizard`  
Date: 2026-06-02

## New files

| Path | Purpose |
|------|---------|
| `app/modules/__init__.py` | Modules package |
| `app/modules/freight/__init__.py` | Freight module |
| `app/modules/freight/commercial_pricing.py` | Markup tiers (from freight-api) |
| `app/modules/freight/schemas.py` | `PriceRequest` model |
| `app/modules/freight/engine.py` | Pricing engine (from freight-api `app.py`) |
| `app/modules/intrastat/__init__.py` | Intrastat module |
| `app/modules/intrastat/schemas.py` | Request/response models |
| `app/modules/intrastat/handlers.py` | Shared route handlers |
| `app/modules/intrastat/services/__init__.py` | Services package |
| `app/modules/intrastat/services/allocation.py` | Cost allocation |
| `app/modules/intrastat/services/country_allocation.py` | Country breakdown |
| `app/modules/intrastat/services/countries.py` | Country normalization |
| `app/modules/intrastat/services/geometry.py` | Haversine / Slovenia polygon |
| `app/modules/intrastat/services/mapbox.py` | Mapbox API client |
| `app/api/freight/__init__.py` | Freight API package |
| `app/api/freight/router.py` | `/api/freight/*` routes |
| `app/api/intrastat/__init__.py` | Intrastat API package |
| `app/api/intrastat/router.py` | `/api/intrastat/*` routes |
| `app/api/legacy.py` | `POST /price`, `/intrastat`, `/intrastat/address` |
| `app/data/freight/freight_prices.csv` | Historical price data |
| `app/data/freight/fuel_prices.json` | Corridor fuel prices |
| `app/data/freight/price_model.pkl` | XGBoost LTL model |
| `tests/test_platform_merge.py` | Route registration + parity tests |
| `DEPLOYMENT_CHECKLIST.md` | Deploy verification steps |
| `MERGE_CHANGED_FILES.md` | This file |

## Modified files

| Path | Change |
|------|--------|
| `app/main.py` | Mount freight/intrastat/legacy routers; freight startup probe |
| `app/core/config.py` | `mapbox_token`, `freight_data_dir` settings |
| `requirements.txt` | Added pandas, scikit-learn, joblib, requests, xgboost |
| `render.yaml` | Added `MAPBOX_TOKEN` env var (sync: false) |
| `.env.example` | Documented MAPBOX_TOKEN and freight env vars |

## Unchanged (by design)

| Path | Note |
|------|------|
| `app/api/routes.py` | All compliance routes unchanged |
| `render.yaml` `name` | Still `export-compliance-wizard` |
| `render.yaml` `plan` | Still `starter` |

## Source repos (read-only import)

| Source | Imported into |
|--------|---------------|
| `freight-api-main/app.py` | `app/modules/freight/engine.py` |
| `freight-api-main/commercial_pricing.py` | `app/modules/freight/commercial_pricing.py` |
| `intrastat-allocation-api/app/*` | `app/modules/intrastat/*` |
