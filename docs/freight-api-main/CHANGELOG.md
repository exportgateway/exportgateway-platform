# Changelog

All notable changes from the Freight Calculator reliability review (read-only audit follow-up).

## [Unreleased] - 2026-06-02

### Fixed

- **GitHub Actions model artifact mismatch** (`.github/workflows/train.yml`)
  - **What:** `git add` now stages `price_model.pkl` instead of `model.pkl`.
  - **Why:** `train_model.py` writes `price_model.pkl` and `app.py` loads that file; the workflow never committed the trained model.
  - **Files:** `.github/workflows/train.yml`

### Changed

- **Distance calculation and fallback transparency** (`app.py`)
  - **What:**
    - When all four coordinates are provided but Mapbox is unavailable (missing token, HTTP error, empty routes, or invalid response), distance is computed with a haversine (straight-line) estimate instead of silently using 500 km.
    - `get_distance()` returns `(distance, distance_source, warning)`.
    - `POST /price` adds an optional `warning` string when distance is degraded.
    - `distance_source` values: `mapbox` (road route), `haversine` (straight-line estimate), `fallback` (fixed 500 km when coordinates are missing).
  - **Why:** Silent 500 km fallback produced plausible but wrong prices when coordinates were present; clients could not tell when distance was unreliable.
  - **Files:** `app.py`
  - **API compatibility:** Existing response fields unchanged; `warning` is additive. `distance_source` still present; new value `haversine` is additive. No-coordinates behavior still uses 500 km and `fallback`.

- **Documentation for distance behavior** (`README.md`)
  - **What:** Describes `distance_source` values and when `warning` is returned.
  - **Why:** Align docs with runtime behavior after distance fixes.
  - **Files:** `README.md`

### Added

- **Environment template** (`.env.example`)
  - **What:** Documents `MAPBOX_TOKEN`, `CORS_ORIGINS`, and `LOG_LEVEL`.
  - **Why:** README referenced `.env.example` but the file was missing, breaking onboarding.
  - **Files:** `.env.example`

- **Render deployment blueprint** (`render.yaml`)
  - **What:** Web service definition with build/start commands and env var placeholders.
  - **Why:** No Render config existed; deployment relied on manual setup and was inconsistent with sibling projects.
  - **Files:** `render.yaml`

- **Tests for distance transparency** (`tests/test_app.py`)
  - **What:** Assert `warning` on fixed fallback; assert `haversine` source when coordinates exist without `MAPBOX_TOKEN`.
  - **Why:** Guard regression on critical distance behavior.
  - **Files:** `tests/test_app.py`

### Not changed (by design)

- Pricing formulas (`ftl_price`, LTL blends, fuel adjustments, rounding).
- API routes (`GET /`, `POST /price`) and request schema.
- Authentication / rate limiting (noted in audit; deferred as non-critical for this pass).
- Project structure (single `app.py` module retained).
