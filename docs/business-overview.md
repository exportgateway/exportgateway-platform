# ExportGateway — Business Overview

> **Source:** Complete platform audit of all three product repositories:
> - `docs/export-compliance-wizard-main`
> - `docs/freight-api-main`
> - `docs/intrastat-allocation-api-main`  
> **Date:** June 9, 2026 (updated)  
> **Production host (merged):** `https://export-compliance-wizard.onrender.com`

---

## What ExportGateway Actually Is

ExportGateway is an **EU-focused trade intelligence platform** — a suite of connected tools for customs classification, freight pricing, and Intrastat cost allocation. It is not a generic logistics TMS, document editor, or payment platform.

**Three products, one production deployment:**

| Product | Repository | User-facing UI | Production status |
|---------|------------|----------------|-------------------|
| **Export Compliance Wizard** | `export-compliance-wizard-main` | **Yes** — 4-step wizard at `GET /` | **Live** on Render |
| **Freight Calculator** (Freight Intelligence Engine) | `freight-api-main` → merged into wizard | **No** — API only | **Live** at `/api/freight/price`, legacy `/price` |
| **Intrastat Allocation** | `intrastat-allocation-api-main` → merged into wizard | **No** — API only | **Live** at `/api/intrastat/*`, legacy `/intrastat*` |

The standalone Render services (`freight-app-bra5`, `intrastat-freight-allocation-api`) are **slated for decommission** after verification on the merged host (`DEPLOYMENT_CHECKLIST.md`).

The Next.js marketing site (`exportgateway-platform`) describes a broader SaaS vision. **The implemented product today is three tools on one FastAPI backend**, with only the Compliance Wizard having a built-in UI.

---

## Repository Lineage & Consolidation

```
freight-api-main (standalone prototype, API-only)
    └── merged → export-compliance-wizard/app/modules/freight/

intrastat-allocation-api-main (standalone prototype, API-only)
    └── merged → export-compliance-wizard/app/modules/intrastat/

export-compliance-wizard-main (monolith — production)
    ├── Wizard UI + Compliance APIs
    ├── Freight Engine (from freight-api-main)
    └── Intrastat Engine (from intrastat-allocation-api-main)
```

**Strategic implication:** ExportGateway is already a **platform architecture** in the backend. The gap is **frontend surfacing** — users cannot discover or test Freight and Intrastat without API knowledge or WordPress embeds.

---

## Problems It Solves

| Problem | Product | How ExportGateway addresses it |
|--------|---------|--------------------------------|
| **CN/HS classification is slow and error-prone** | Compliance Wizard | Multi-stage pipeline: OpenAI → taxonomy → EU CN8 FTS → AES historical evidence → disambiguation |
| **Multilingual product descriptions** | Compliance Wizard | OpenAI detects language; lexicon fallback for 13+ EU languages |
| **Exporters don't know which documents they need** | Compliance Wizard | Rule-based checklist by route, incoterm, transport mode |
| **Landed cost is opaque before shipping** | Compliance Wizard | Goods + transport + sample duty + VAT estimate + PDF |
| **EU road freight quoting** | Freight Calculator | Historical CSV (~200 lanes) + XGBoost LTL model + Mapbox distance + commercial markup |
| **Intrastat freight allocation** | Intrastat Allocation | Mapbox route + country sampling → domestic vs. foreign km/cost split |

---

## Product 1: Export Compliance Wizard

**What it does:** End-to-end export planning for a single shipment — classify product, enter shipment details, estimate transport, get documents/duties/VAT/PDF.

**4-step wizard UI** (`app/templates/index.html`):

| Step | Capability | API |
|------|------------|-----|
| 1 Product | Text description → CN suggestions, disambiguation | `POST /classify-product` |
| 2 Shipment | Origin, destination, value, weights, incoterm, mode | — |
| 3 Transport | Manual cost OR modal calculator | `POST /calculate-transport` (**sample logic**) |
| 4 Results | Documents, duties, VAT, landed cost, PDF, lead form | `/documents`, `/duties`, `/vat`, `/landed-cost`, `/generate-pdf`, `/leads` |

**Classification engine (core IP):**
- OpenAI gpt-4o-mini product understanding
- EU CN8 nomenclature SQLite + FTS5
- 40+ taxonomy families, lexicon, polysemy, commercial product recognition
- AES Knowledge Engine — ~80,000 historical declarations in full mode
- Confidence scoring, disambiguation UI, classification audit log

**Compliance estimates (honest scope):**

| Feature | Data quality |
|---------|--------------|
| Document checklist | Real rule-based logic |
| Customs duties | **Sample TARIC** — illustrative only (`TARIC_INTEGRATION_ENABLED=false`, unused flag) |
| VAT | EU standard rates — simplified model |
| PDF report | Real ReportLab output with legal disclaimer |
| Transport (wizard modal) | **Sample formula** — not the Freight Calculator engine |

**Production URL:** `https://export-compliance-wizard.onrender.com/`  
**Embeddable:** Yes — iframe-friendly, CORS for `exportgateway.eu`, analytics hooks for `#egw-compliance-wizard`

**Screenshots in repo:** None — capture from live deployment required.

---

## Product 2: Freight Calculator (Freight Intelligence Engine)

**What it does:** Estimates EU road freight prices (FTL/LTL) from coordinates, load dimensions, and corridor fuel data.

**Origin repo:** `docs/freight-api-main` — flat FastAPI monolith (`app.py`), no UI, no auth.

**Merged routes on production host:**

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/freight/` | Service status |
| `POST` | `/api/freight/price` | Primary pricing endpoint |
| `POST` | `/price` | Legacy alias (WordPress embeds) |

**Pipeline:** Mapbox distance (→ haversine → 500 km fallback) → FTL fuel-adjusted rate OR LTL blend (60% CSV nearest-neighbor, 30–40% XGBoost, formula fallback) → commercial markup → round to €5.

**Data assets:** `freight_prices.csv` (~200 SI-centric lanes), `fuel_prices.json` (placeholder diesel prices), `price_model.pkl` (XGBoost — may be missing from repo copy; trained via `train_model.py`).

**Critical gap:** Wizard transport modal calls `POST /calculate-transport` (sample), **not** `/api/freight/price`. The advanced engine exists but is disconnected from the wizard UX.

**Standalone deployment:** `render.yaml` → service name `freight-api`; legacy service `freight-app-bra5` being retired.

**Screenshots in repo:** None.

**Production readiness:** Functional engine with tests; no auth, no `/health`, placeholder fuel data, CI artifact name bug in `train.yml`.

---

## Product 3: Intrastat Allocation

**What it does:** Splits total freight cost between domestic and foreign portions of an EU road route for Intrastat reporting.

**Origin repo:** `docs/intrastat-allocation-api-main` — FastAPI package (`app/main.py`), no UI, no tests in standalone repo.

**Merged routes on production host:**

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/intrastat/` | Service status |
| `POST` | `/api/intrastat/` | Coordinate-based allocation |
| `POST` | `/api/intrastat/address` | Address-based (geocode → route → allocate) |
| `POST` | `/intrastat` | Legacy alias |
| `POST` | `/intrastat/address` | Legacy alias |

**Pipeline:** Mapbox driving route → sample midpoints every `COUNTRY_SAMPLE_KM` → reverse geocode to country → domestic vs. foreign km split → cost allocation + `route_segments` for map overlay.

**Hard dependency:** `MAPBOX_TOKEN` required — 502 without it.

**WordPress integration:** Analytics expects form id `egIntrastatForm` (`egw-analytics.js`) — form HTML **not in any repo**.

**Standalone deployment:** `render.yaml` → `intrastat-freight-allocation-api`; being retired after merge verification.

**Screenshots in repo:** None.

**Production readiness:** Core logic complete; no auth, minimal health check, stale duplicate files at repo root, no standalone tests.

---

## Who the Customers Are

**Primary:**
- **EU exporters** — especially Slovenia-origin (AES data bias, default origin)
- **Freight forwarders** — freight API + Intrastat allocation for quotes and reporting
- **Customs brokers** — classification with historical evidence

**Secondary:**
- **WordPress visitors** on `exportgateway.eu` using embedded tools
- **API integrators** calling `/price`, `/intrastat` from custom frontends

**Not yet served:**
- Enterprise SSO, team accounts, audit trails
- Public API keys, rate limits, developer portal
- Users expecting a UI for Freight or Intrastat without building one

---

## Product Maturity Assessment

| Product / Area | Maturity | Notes |
|----------------|----------|-------|
| CN classification | **High** | Core IP; 26 test files, live benchmark |
| Compliance Wizard UI | **Medium** | Functional Bootstrap wizard; only product with UI |
| Freight Calculator API | **Medium** | Real data + ML; SI-centric; no UI |
| Intrastat Allocation API | **Medium** | Mapbox-dependent; niche but complete |
| Wizard ↔ Freight integration | **Low** | Engine exists; wizard uses sample transport |
| Duties/TARIC | **Low** | Sample data only |
| Platform discovery (website) | **Low** | Tools not surfaced on Next.js site |
| Auth / billing / teams | **None** | Frontend scaffold only |

---

## Key URLs & API Surface (Unified Production Host)

| Endpoint | Product | Purpose |
|----------|---------|---------|
| `GET /` | Compliance Wizard | Wizard UI |
| `POST /classify-product` | Compliance Wizard | CN classification |
| `POST /calculate-transport` | Compliance Wizard | Sample transport (wizard) |
| `POST /api/freight/price` | Freight Calculator | Advanced freight engine |
| `POST /price` | Freight Calculator | Legacy alias |
| `POST /api/intrastat/` | Intrastat Allocation | Coordinate allocation |
| `POST /api/intrastat/address` | Intrastat Allocation | Address allocation |
| `POST /intrastat*` | Intrastat Allocation | Legacy aliases |
| `POST /documents`, `/duties`, `/vat`, `/landed-cost` | Compliance Wizard | Compliance outputs |
| `POST /generate-pdf`, `/leads` | Compliance Wizard | PDF + lead capture |
| `GET /health*` | Platform | Liveness, startup, readiness |

---

## Strategic Summary

ExportGateway's **real product today** is a **three-tool trade intelligence suite** on one FastAPI backend:

1. **Compliance Wizard** — the flagship with UI (classify → comply → PDF)
2. **Freight Calculator** — production API, needs UI or embed on ExportGateway
3. **Intrastat Allocation** — production API, needs UI or embed on ExportGateway

The competitive moat remains **AI classification + AES historical evidence**. Freight and Intrastat add **logistics intelligence** that competitors like Avalara and iLovePDF do not offer in an integrated SME package.

**Recommended positioning:** **Trade Intelligence Platform** — not a single-vertical customs, freight, or Intrastat product.

The marketing website must evolve from **brochure** to **platform hub** where users launch and test working tools directly.
