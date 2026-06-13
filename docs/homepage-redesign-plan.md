# ExportGateway — Homepage Redesign Plan

> **Prerequisite:** Read `business-overview.md`, `platform-architecture.md`, and `website-strategy.md`.  
> **Date:** June 9, 2026 (updated for three-product audit)  
> **Status:** Homepage implemented in prior phase; this plan adds platform hub + tools integration.

---

## Problem Statement (Updated)

The Next.js site was rebuilt around the Compliance Wizard but **did not surface Freight Calculator or Intrastat Allocation** — two live APIs merged from separate repositories. Users cannot discover or test the full platform.

**Goal:** Evolve ExportGateway from marketing site to **platform hub** while **keeping the existing homepage** and improving it with three-product awareness.

---

## Three-Product Narrative

```
ExportGateway Trade Intelligence Platform
├── Export Compliance Wizard (Live) — UI at GET /
├── Freight Calculator (Live API) — POST /api/freight/price
└── Intrastat Allocation (Live API) — POST /api/intrastat/address
```

All hosted on: `https://export-compliance-wizard.onrender.com`

---

## Homepage Changes (Incremental — Do Not Remove)

### Additions to existing homepage sections:

| Section | Change |
|---------|--------|
| Hero | Add "3 live tools" badge; secondary CTA → `/platform` |
| Platform Overview | Ensure three pillar tools visible with correct Live status |
| New: Tools Preview | 3-card grid → `/tools/*` (optional if Platform Overview suffices) |
| Product Pillars | Align freight/intrastat modules with "Live API" not "Beta" where accurate |
| CTA | "Explore Platform" alongside "Try Compliance Wizard" |

### Keep unchanged:
- Why ExportGateway, Workflow, Intelligence Layer, Roadmap, Disclaimer, Pricing, Security, FAQ, CTA structure

---

## New Pages (Phase 4–6)

### `/platform` — Platform Hub

**Purpose:** Central launch pad for the tool suite.

```
Section 1: Hero — "Your EU trade toolkit"
Section 2: Live Tools grid (3 cards with Launch buttons)
Section 3: How tools connect (wizard classifies → freight prices → intrastat allocates)
Section 4: Roadmap preview (Document Intelligence, AI Assistant)
Section 5: CTA — Early Access
```

### `/tools` — Tool Directory

Same 3 cards as platform hub, with filter by status (Live / In Development / Planned).

### `/tools/export-compliance-wizard`

- Feature list from wizard audit
- Status: Live
- iframe embed of `NEXT_PUBLIC_WIZARD_URL`
- Disclaimer banner
- Screenshot gallery (when captured)

### `/tools/freight-calculator`

- Feature list from freight-api audit
- Status: Live
- Interactive form: origin/destination coords or countries, weight, pallets, LTL/FTL
- Calls `POST /api/freight/price`
- Shows price_eur, range, confidence, distance_source, warnings

### `/tools/intrastat-allocation`

- Feature list from intrastat audit
- Status: Live
- Interactive form: pickup/delivery address fields, total cost, domestic country
- Calls `POST /api/intrastat/address`
- Shows domestic/foreign split + optional route segment summary

---

## Component Mapping (Implementation)

```
src/app/platform/page.tsx              → NEW: Platform Hub
src/app/tools/page.tsx                 → NEW: Tool directory
src/app/tools/export-compliance-wizard/page.tsx → NEW: Wizard landing + iframe
src/app/tools/freight-calculator/page.tsx       → NEW: Freight UI + API
src/app/tools/intrastat-allocation/page.tsx     → NEW: Intrastat UI + API

src/lib/tools.ts                       → NEW: Tool definitions (name, status, URLs, features)
src/components/tools/
  ToolCard.tsx                         → NEW: Reusable card
  ToolStatusBadge.tsx                  → NEW: Live/Beta badge
  WizardEmbed.tsx                      → NEW: iframe wrapper
  FreightCalculatorForm.tsx            → NEW: API client UI
  IntrastatAllocationForm.tsx          → NEW: API client UI

src/components/home/                   → UPDATE: Hero CTA, platform section links
src/lib/constants.ts                   → UPDATE: nav links (Tools, Platform)
```

---

## Integration Requirements

| Requirement | Status |
|-------------|--------|
| `NEXT_PUBLIC_WIZARD_URL` | In `.env.example` |
| `NEXT_PUBLIC_API_BASE_URL` | Add for freight/intrastat API calls |
| CORS on Render for Next.js domain | May need update beyond exportgateway.eu |
| Wizard iframe | Production URL confirmed |
| Freight/Intrastat UI | Must be built — no external UI exists |
| Screenshots | None in repos — capture from production or built UI |

---

## Phased Rollout (Updated)

### Phase A: Documentation & positioning (complete)
- Three-repo audit
- Update business/architecture/strategy docs
- Executive summary + positioning decision

### Phase B: Platform hub + tools (next)
- `/platform`, `/tools`, three tool landing pages
- Wizard iframe embed
- Freight + Intrastat built UI
- Nav updates

### Phase C: Homepage polish
- Hero/platform CTAs
- Tools preview section
- Correct Live badges on platform modules

### Phase D: Assets & integration
- Production screenshots
- Wire wizard transport to freight engine (backend — separate task)
- CORS production config

---

## Acceptance Criteria

Platform integration complete when:

- [ ] `/platform` launches all three tools
- [ ] `/tools` lists three products with accurate status badges
- [ ] Wizard embeds live at `/tools/export-compliance-wizard`
- [ ] Freight calculator returns real prices from `/api/freight/price`
- [ ] Intrastat allocation returns real splits from `/api/intrastat/address`
- [ ] Homepage retained with improved three-tool messaging
- [ ] No links to decommissioned standalone Render services
- [ ] All estimates labeled indicative
