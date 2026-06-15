# Wizard Frontend Migration Plan

**Date:** 2026-06-15  
**Status:** Approved — implementation ready  
**Decision:** Migrate Export Classification Wizard frontend into ExportGateway; Render becomes backend only.

**Do not invest further in:** iframe resize, iframe scrolling, postMessage synchronization, or embedded layout workarounds. These are deprecated temporary solutions.

---

## Target architecture

```
ExportGateway (Next.js / Vercel)
└── /platform/customs
      └── ClassificationWizard.tsx
            ├── usePlanAccess()          → plan tier (no postMessage)
            ├── classifyProductV2()      → server action
            └── getClassificationUsage() → server action
                    ↓
Render API (export-compliance-wizard)
├── POST /classify/v2
├── GET  /classify/v2/usage
└── GET  /health
```

**Render retains (unchanged):**
- AES database and historical search
- Classification knowledge base
- AI classification engine (`classification_engine_v2.py`)
- Web research pipeline
- Plan usage service
- Health and startup diagnostics

**Render optional (unchanged, out of platform scope):**
- `GET /` — standalone wizard UI for WordPress embeds and direct links
- Legacy `/classify-product` for Export Auditor server-side calls

---

## Implementation phases

### Phase 1 — Native `ClassificationWizard` component

**Goal:** Replicate current wizard functionality in React using the ExportGateway design system (Tailwind, existing platform card patterns — same approach as `FreightCalculatorForm` + `FreightResultCard`).

#### 1.1 API layer

Add server actions following the freight pattern in `src/lib/platform-api.ts` (or dedicated `src/lib/wizard-api.ts`).

| Function | Render endpoint | Purpose |
|----------|-----------------|---------|
| `classifyProductV2({ product_description, plan })` | `POST /classify/v2` | Run classification |
| `getClassificationUsage(plan)` | `GET /classify/v2/usage?plan=` | Usage bar on load / after classify |
| `checkWizardHealth()` | `GET /health` | Backend availability (optional) |

**Types** — mirror `ClassifyV2Response` from wizard `app/models/schemas.py`:

| Type | Fields (key) |
|------|----------------|
| `ClassifyV2Request` | `product_description`, `plan` |
| `ClassifyV2Response` | `recommended_cn_code`, `confidence`, `commodity_description`, `hierarchy_path`, `historical_evidence`, `classification_summary`, `why_explanation`, `alternatives`, `source_breakdown`, `research_source`, `confidence_source`, `manual_classification_recommended`, `usage` |
| `PlanUsageResponse` | `classifications_remaining`, `research_remaining`, `plan` |
| `HistoricalEvidenceSummary` | `level`, `declaration_count`, `most_common_tariff`, `evidence_strength` |

Use `"use server"` — server-side fetch via `getApiBaseUrl()` avoids CORS configuration on Render.

#### 1.2 Component tree

```
src/components/platform/
├── ClassificationWizard.tsx          # Main client component — state, classify flow
├── ClassificationWizardHeader.tsx    # Title, subtitle, legal strip (optional split)
├── ClassificationTrustSection.tsx    # 70k AES stat + process list
├── ClassificationUsageBar.tsx        # Plan usage from API
├── ClassificationInputPanel.tsx      # Product input + Classify button
├── ClassificationLoadingStages.tsx   # AES → KB → AI → Web (client-side animation)
└── classification/
    ├── ClassificationResultHero.tsx       # Recommended code + commodity + hierarchy
    ├── ClassificationConfidenceCard.tsx   # Confidence band + source
    ├── ClassificationHistoricalCard.tsx   # AES evidence
    ├── ClassificationSummaryCard.tsx      # Product type + detected attributes
    ├── ClassificationWhyCard.tsx          # why_explanation
    ├── ClassificationAlternativesCard.tsx # Up to 3 alternatives
    ├── ClassificationSourcesCard.tsx      # Source checklist
    ├── ClassificationComplianceNotice.tsx # Post-results disclaimer
    └── ClassificationManualNotice.tsx     # manual_classification_recommended alert
```

**Minimum viable:** Single `ClassificationWizard.tsx` with inline sections; extract subcomponents when file exceeds ~300 lines.

#### 1.3 Feature parity checklist (from current `index.html` + `app.js`)

| Feature | Behavior to replicate |
|---------|----------------------|
| **Product input** | Single text field, min 2 chars, Enter submits |
| **Usage bar** | Fetch on mount + refresh after classify; show plan + remaining counts |
| **Classify button** | Disabled while loading; label "Classifying…" during request |
| **Loading stages** | Animated: AES → KB → AI → (Web if `research_source === "Web Research"`) |
| **Recommended classification** | Format CN code (no spaces); hero card styling |
| **Commodity description** | From `commodity_description` or `product_type` |
| **Hierarchy path** | Render `hierarchy_path` steps with → separators |
| **Confidence** | HIGH / MEDIUM / LOW bands with color classes |
| **Confidence source** | `confidence_source` or `research_source` |
| **Historical evidence** | Count, most common tariff, evidence strength; empty state when none |
| **Classification summary** | Product type + detected attributes list |
| **Why this classification** | `why_explanation` prose |
| **Alternatives** | Up to 3 non-recommended; hide when HIGH confidence and no alts |
| **Sources** | Checklist: AES, KB, AI, Web (with "Not required" for unused web) |
| **Manual recommendation** | Show alert when `manual_classification_recommended` |
| **Compliance notice** | **Only after results** — not on landing |
| **Classify another** | Reset input + hide results |
| **About modal** | Optional P1 — can defer or use platform FAQ pattern |
| **Export Auditor handoff** | Defer to post-migration — replace `postMessage` with platform navigation |

#### 1.4 State machine

```
idle → loading → results | error
         ↑           │
         └─ restart ─┘
```

| State | UI |
|-------|-----|
| `idle` | Input + trust section + usage bar |
| `loading` | Loading stages visible; results hidden |
| `results` | All result cards + compliance notice |
| `error` | Toast or inline error; return to idle |

#### 1.4 Plan integration

```tsx
const { effectivePlan } = usePlanAccess();
// Pass effectivePlan to classifyProductV2 and getClassificationUsage
```

No `postMessage`, no URL `?plan=` param required on platform route. `PlanFeatureGate` in `PlatformWizardTool` remains unchanged.

#### 1.5 Styling

- Use platform tokens: `border-surface-border`, `rounded-2xl`, `bg-white`, `shadow-sm`, brand colors
- Reference layout from `FreightResultCard`, `ExportAuditorResultsDashboard` card grid
- Responsive: single column mobile; two-column grid for compact cards (confidence + historical) at `sm:` breakpoint
- **No Bootstrap**, no wizard `styles.css` import

#### 1.6 Phase 1 deliverables

- [ ] `src/lib/wizard-types.ts`
- [ ] `src/lib/wizard-api.ts` (or extended `platform-api.ts`)
- [ ] `src/components/platform/ClassificationWizard.tsx` (+ optional subcomponents)
- [ ] Feature flag or dev-only route to preview before cutover (optional: `/platform/customs?native=1`)

**Estimate:** 5–8 working days

---

### Phase 2 — Replace `WizardEmbed`

**Goal:** Wire native component into production route.

| File | Change |
|------|--------|
| `src/components/platform/PlatformWizardTool.tsx` | Replace `<WizardEmbed />` with `<ClassificationWizard />` |
| `src/app/platform/customs/page.tsx` | No structural change; optional page header if not in component |
| `src/app/api/wizard-status/route.ts` | Simplify to API health only — remove `GET /` UI probe |

**Cutover steps:**

1. Deploy platform with `ClassificationWizard` behind feature flag (optional)
2. QA on staging / localhost with `NEXT_PUBLIC_WIZARD_URL` pointing at Render
3. Flip `PlatformWizardTool` to native component
4. Verify plan gating, usage limits, error handling

**Estimate:** 1 working day

---

### Phase 3 — Regression testing

**Goal:** Verify native UI returns **identical classification results** to current iframe wizard for the same inputs.

#### 3.1 API parity (automated)

Golden-input script calling `POST /classify/v2` directly (already possible via curl). Native UI must display the same fields returned by API — no client-side transformation of codes or confidence.

**Test inputs:**

| Input | Validates |
|-------|-----------|
| `Men's cotton jeans` | AES-heavy path, historical evidence |
| `MAKITA BO5041SET` | Brand / product lookup |
| `Hydraulic oil ISO VG46` | Industrial product, possible web research |
| `Steel office cabinet` | Medium confidence, alternatives |
| Short invalid input (`a`) | Client validation, no API call |

#### 3.2 UI regression (manual)

| Check | Pass criteria |
|-------|---------------|
| No iframe in DOM | `document.querySelector('iframe[title*="Classification"]')` is null |
| Browser scroll only | Single document scroll; no nested scroll containers |
| All result sections visible | Hero through compliance notice after classify |
| Usage bar updates | Counts decrease after classification |
| Plan limits | FREE/PRO/ENTERPRISE respected (simulator) |
| Error states | Render down → friendly error, retry |
| Mobile layout | Cards stack single column |

#### 3.3 Side-by-side comparison (pre-removal)

Before Phase 4, optionally run iframe and native in parallel on dev branch:

1. Classify same product in iframe (old) and native (new)
2. Compare: `recommended_cn_code`, `confidence`, `research_source`, `historical_evidence.declaration_count`

#### 3.4 Backend unchanged verification

Confirm **zero changes** required to:
- `classification_engine_v2.py`
- `classification_knowledge_base.py`
- `plan_usage_service.py`
- `/classify/v2` request/response schema

**Estimate:** 2–3 working days

---

### Phase 4 — Remove iframe code

**Goal:** Delete deprecated embed infrastructure from platform.

#### Files to remove

| File | Reason |
|------|--------|
| `src/components/platform/WizardEmbed.tsx` | Iframe embed replaced |

#### Code to remove from remaining files

| Location | Remove |
|----------|--------|
| `PlatformWizardTool.tsx` | `WizardEmbed` import (already replaced in Phase 2) |
| `wizard-status/route.ts` | UI availability check (`fetch(base + '/')`) |
| Any `postMessage` handlers | `egw-wizard-resize`, `egw-request-resize`, `egw-plan` |
| Env docs | References to `embedded=1` iframe params for platform |

#### Docs to archive (do not delete — mark superseded)

- `IFRAME_HEIGHT_REGRESSION_REPORT.md`
- `WIZARD_LAYOUT_REGRESSION_REPORT.md`
- `WIZARD_SCROLL_FIX_REPORT.md`

Add header: *Superseded by native frontend migration — iframe embed removed.*

#### Keep on Render (no deletion)

- `GET /` wizard page — WordPress and standalone users
- `app/static/js/app.js` embedded mode — WordPress iframe consumers
- All API routes

**Estimate:** 0.5–1 working day

---

## File inventory summary

### New (platform)

| Path | Phase |
|------|-------|
| `src/lib/wizard-types.ts` | 1 |
| `src/lib/wizard-api.ts` | 1 |
| `src/components/platform/ClassificationWizard.tsx` | 1 |
| `src/components/platform/classification/*.tsx` | 1 (optional split) |

### Modified (platform)

| Path | Phase |
|------|-------|
| `src/components/platform/PlatformWizardTool.tsx` | 2 |
| `src/app/api/wizard-status/route.ts` | 2, 4 |

### Removed (platform)

| Path | Phase |
|------|-------|
| `src/components/platform/WizardEmbed.tsx` | 4 |

### Unchanged (Render backend)

| Path |
|------|
| `app/services/classification_engine_v2.py` |
| `app/services/classification_knowledge_base.py` |
| `app/services/plan_usage_service.py` |
| `app/api/routes.py` (`/classify/v2`, `/classify/v2/usage`) |
| `app/main.py` |

---

## Environment variables

| Variable | Platform use after migration |
|----------|------------------------------|
| `NEXT_PUBLIC_WIZARD_URL` | Rename optional → `NEXT_PUBLIC_API_BASE_URL` already aliases to same host |
| `NEXT_PUBLIC_API_BASE_URL` | Server actions target for `/classify/v2` |

No new secrets. Render API URL remains the single backend pointer.

---

## Out of scope (this migration)

| Item | Notes |
|------|-------|
| Iframe resize / scroll fixes | **Frozen** — do not implement |
| WordPress embed migration | Continues iframe → Render `GET /` |
| Export Auditor postMessage bridge | Follow-up: platform navigation + query state |
| Wizard backend refactor | Render stays as-is |
| Removing Render `GET /` UI | Keep for non-platform consumers |
| OpenAPI codegen | Optional future improvement |

---

## Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1 — Native component | 5–8 days | 5–8 days |
| Phase 2 — Replace embed | 1 day | 6–9 days |
| Phase 3 — Regression testing | 2–3 days | 8–12 days |
| Phase 4 — Remove iframe code | 0.5–1 day | **8–13 days (~2 weeks)** |

---

## Success criteria

| Criterion | Verification |
|-----------|--------------|
| `/platform/customs` contains **no iframe** | DOM inspection; no `WizardEmbed` import |
| **Browser scroll only** | No nested scroll containers on wizard page |
| **Single design system** | Tailwind/platform components only; no Bootstrap |
| **Single frontend deploy path** | UI changes ship via Vercel only |
| **Render remains classification backend** | All classify calls hit `POST /classify/v2` on Render |
| **Same classification results** | Golden inputs match iframe baseline |
| **Plan gating works** | `PlanFeatureGate` + usage limits unchanged |
| **No postMessage** | Zero iframe sync code in platform repo |

---

## Rollback plan

If critical regression found after Phase 2 cutover:

1. Revert `PlatformWizardTool.tsx` to import `WizardEmbed` (keep file until Phase 4)
2. Redeploy platform only
3. Render backend unaffected

**Do not rollback to iframe fixes** — fix forward in native component.

---

## Next action

Start **Phase 1.1** — create `wizard-types.ts` and `wizard-api.ts` with `classifyProductV2` server action, then scaffold `ClassificationWizard.tsx` with input + classify + loading states.

Reference implementation: `FreightCalculatorForm.tsx` + `src/lib/platform-api.ts`.
