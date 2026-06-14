# Changelog

## [Unreleased] - 2026-06-14 — Fix wizard UI 500 (Starlette TemplateResponse)

### Fixed

- **GET `/` Internal Server Error** (`app/main.py`)
  - Starlette ≥0.29 / 1.0 changed `Jinja2Templates.TemplateResponse` to require `request` as the first argument.
  - Old call `TemplateResponse("index.html", {"request": request})` caused 500 while `/health` and `/static` remained OK.
  - Updated to `TemplateResponse(request=request, name="index.html")`.

- **Regression test** (`tests/test_index_route.py`) — asserts GET `/` returns HTML 200.

## [Unreleased] - 2026-06-02 — P0 compliance & transparency

Implements Priority P0 items from `EXPORT_WIZARD_AUDIT.md`. No API endpoint changes, no TARIC integration, no UI redesign.

### Added

- **Global disclaimer banner** (`app/templates/index.html`, `app/static/css/styles.css`)
  - Visible notice that all outputs are indicative and must be verified before commercial or customs use.

- **Classification confidence display** (`app/static/js/app.js`, `app/static/css/styles.css`)
  - Prominent confidence percentage with color coding: green (&gt;90%), orange (70–90%), red (&lt;70%).
  - Warning when confidence &lt;70%: verify CN code before customs use.
  - CN fallback warning when `source` is `sample-fallback` or CN digits match `84798997`.

- **Sample data source labels** (`app/static/js/app.js`)
  - Maps API `source` / `method` values to human-readable labels (Sample Rule Engine, Sample Tariff Structure, Sample Freight Logic).
  - Shown on classification panel, duties block, transport result, and results summary.

- **Duty disclaimer** (`app/templates/index.html`)
  - Static text above duties table: illustrative estimates, not official tariff data.

- **VAT section transparency** (`app/templates/index.html`)
  - Title renamed to **VAT Estimate (Simplified Model)**.
  - Explanation of simplified customs value and VAT model limitations.

- **PDF legal notice** (`app/services/pdf_service.py`)
  - In-document IMPORTANT NOTICE block before footer.
  - Expanded page footer with the same disclaimer text.
  - Section title updated to **Duty and VAT Estimate (Simplified Model)**.
  - Increased bottom margin so footer text does not overlap content.

- **Sample measures handling** (`app/static/js/app.js`)
  - When duty `source` contains `sample`, TARIC-like codes (Y917, C400, etc.) are hidden.
  - Replaced with: “Sample customs measures for demonstration purposes only.”

- **Results step summary** (`app/templates/index.html`, `app/static/js/app.js`)
  - Re-displays classification confidence/source on step 4.
  - Shows transport source when freight was calculated via the modal.

### Changed

- **Frontend rendering** (`app/static/js/app.js`)
  - User/API text escaped via `escapeHtml` when building HTML (reduces XSS risk from descriptions and notes).
  - `state.transport` stores last transport API response for source labeling.
  - Lead email context includes classification source and indicative-estimate reminder.

### Unchanged (by design)

- All API routes and request/response schemas.
- Pricing, duty, VAT, transport, and classification calculation logic.
- TARIC / AI integrations (flags remain unused).

### Files modified

| File | Change |
|------|--------|
| `app/templates/index.html` | Disclaimer banner, duty/VAT copy, results summary placeholders |
| `app/static/js/app.js` | Confidence UI, source labels, sample measures, escaping |
| `app/static/css/styles.css` | Disclaimer, confidence, warning, source styles |
| `app/services/pdf_service.py` | PDF disclaimer body and footer |
| `CHANGELOG.md` | This file |
