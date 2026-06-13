# Deployment Checklist — Platform Merge (Freight + Intrastat → export-compliance-wizard)

Deploy to the **existing** Render service `export-compliance-wizard`. Do **not** create a new Render service.

## Pre-deploy

- [ ] Merge branch reviewed and merged to the branch Render deploys from
- [ ] `MAPBOX_TOKEN` copied from freight-api / intrastat-allocation-api Render env into `export-compliance-wizard`
- [ ] `AI_PROVIDER_API_KEY` / OpenAI keys unchanged for compliance classification
- [ ] Freight markup env vars copied if non-default (`FREIGHT_MARKUP_*`)
- [ ] Confirm `app/data/freight/` contains `freight_prices.csv`, `fuel_prices.json`, `price_model.pkl`

## Deploy (Render)

- [ ] Push to GitHub — Render auto-deploys `export-compliance-wizard` (plan: **starter**, unchanged)
- [ ] Build succeeds (`pip install -r requirements.txt` — adds pandas, scikit-learn, joblib, xgboost, requests)
- [ ] Startup completes — check `/health/startup` for `freight` probe block

## Post-deploy smoke tests

### Compliance (unchanged paths)

- [ ] `GET /health/live` → `status: live`
- [ ] `GET /health` → `status: ok` (or `degraded` if OpenAI disabled in staging)
- [ ] `POST /classify-product` — sample product still classifies

### Freight

- [ ] `GET /api/freight/` → `status: ok`
- [ ] `POST /api/freight/price` — returns `success`, `price_eur`, `distance_km`
- [ ] `POST /price` (legacy alias) — same response as prefixed route

### Intrastat

- [ ] `GET /api/intrastat/` → `success: true`
- [ ] `POST /api/intrastat/` — coordinates payload returns allocation breakdown
- [ ] `POST /api/intrastat/address` — address payload returns allocation breakdown
- [ ] `POST /intrastat` (legacy alias) — same behaviour as prefixed route
- [ ] `POST /intrastat/address` (legacy alias) — same behaviour as prefixed route

## WordPress / client cutover

- [ ] Update embed base URLs to `https://export-compliance-wizard.onrender.com` **or** keep legacy paths on merged host after DNS/proxy cutover
- [ ] Verify CORS: `CORS_ORIGINS` includes `https://exportgateway.eu`
- [ ] Decommission old Render services **only after** 48h traffic verification:
  - `freight-app-bra5`
  - `intrastat-allocation-api`

## Rollback

- [ ] Revert deploy to previous commit in Render dashboard
- [ ] Re-point WordPress embeds back to old service URLs if cutover already happened
