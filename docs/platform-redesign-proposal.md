# ExportGateway — Complete Platform Redesign Proposal

> **Version:** 2.0 — Pre-launch vision  
> **Date:** June 9, 2026  
> **Status:** Proposal only — no code changes yet  
> **Audience:** Product, design, engineering  
> **Inputs:** `business-overview.md`, `platform-architecture.md`, `website-strategy.md`, `homepage-redesign-plan.md`, `competitor-positioning.md`, `export-compliance-wizard-main`

---

## 1. Executive Summary

ExportGateway is repositioning from a **generic logistics SaaS landing page** to the **central operating system for exporters, freight forwarders, and customs professionals** — presented as a complete platform vision with transparent module status labels during pre-launch.

### Strategic shift

| Previous direction | New direction |
|-------------------|---------------|
| Show only deployed features | Show **complete platform vision** across four pillars |
| Hide roadmap capabilities | Display future modules with **Live / Beta / In Development / Coming Soon** badges |
| Generic freight + compliance marketing | **Customs Intelligence · Freight Intelligence · Document Intelligence · AI Trade Assistant** |
| Fabricated testimonials and stats | **Verified benchmark metrics** from production regression suites |
| Dashboard as dark mockup | Dashboard as **future command centre** — labeled In Development |

### One-line positioning

**ExportGateway is the AI-powered trade operating system that connects customs classification, freight intelligence, export documentation, and an intelligent trade assistant — in one platform built for European and global exporters.**

### Primary pre-launch CTA

**Try the Compliance Wizard** → live tool at `export-compliance-wizard.onrender.com`  
Secondary: **Join early access** → waitlist / contact for platform launch

---

## 2. Platform Vision

### The ExportGateway Operating System

ExportGateway is not a point tool. It is designed as the **single workspace** where trade professionals move from product identification to classified, costed, documented, and shippable exports.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ExportGateway Platform OS                            │
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│   Customs    │   Freight    │  Document    │    AI Trade              │
│ Intelligence │ Intelligence │ Intelligence │    Assistant             │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│              Unified Shipment Workspace (Dashboard — In Development)     │
├─────────────────────────────────────────────────────────────────────────┤
│   Data Layer: CN Nomenclature · AES Declarations · Freight History ·    │
│   Taxonomy · Lexicon · EU VAT · Mapbox Routes · OpenAI Understanding      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Target personas

| Persona | Primary pillars | Job to be done |
|---------|----------------|----------------|
| **Exporter / Manufacturer** | Customs + Document + AI | "What is my CN code and what do I need to ship?" |
| **Freight Forwarder** | Freight + Customs | "Quote lane cost and validate classification fast" |
| **Customs Broker** | Customs + AI + Document | "Review classification with historical evidence" |
| **Logistics Manager** | Freight + Document | "Plan landed cost and document checklist" |

### Competitive wedge (unchanged from audit)

Win on **classification with proof** (AES historical data + OpenAI understanding), not on ocean freight marketplaces or payment infrastructure. Present the **full vision** while badges maintain trust.

---

## 3. Module Status Framework

Every capability on the website MUST display a status badge during pre-launch.

### Badge definitions

| Badge | Label | Meaning | Visual treatment |
|-------|-------|---------|------------------|
| **Live** | `Live` | Production-ready, usable today | Green dot + "Live" pill |
| **Beta** | `Beta` | Functional with known limitations | Blue pill + tooltip explaining limits |
| **In Development** | `In Development` | Active engineering, partial backend | Amber pill + "Building now" |
| **Coming Soon** | `Coming Soon` | Planned, not yet in codebase | Muted pill + roadmap quarter |

### Tooltip requirement (Beta / In Development)

Beta modules must show honest limits on hover or expand:
- Example: *"Duty rates use illustrative sample data — live TARIC integration in development."*

---

## 4. Four Product Pillars — Complete Module Map

### Pillar 1: Customs Intelligence

**Tagline:** *Classify with confidence. Prove with history.*

| Module | Status | Backend evidence | Website treatment |
|--------|--------|------------------|-------------------|
| **CN Classification** | **Live** | `POST /classify-product`, 14-stage pipeline, EU CN8 FTS | Hero demo, primary CTA target |
| **HS Classification** | **Live** | Same engine — CN8 is EU HS extension; hierarchy display | Grouped with CN; explain CN ⊃ HS6 |
| **TARIC Assistance** | **In Development** | `taric_service.py` sample data; `TARIC_INTEGRATION_ENABLED=false` | Show sample duty UI; badge + "Live TARIC Q3 2026" |
| **Historical Customs Evidence** | **Live** | AES Knowledge Engine, 80k+ declarations, `POST /api/history/search` | Signature differentiator section |
| **Compliance Guidance** | **Beta** | Document rules, disambiguation, expert review flags, disclaimers | Route/incoterm guidance cards |

**Pillar maturity:** ★★★★☆ — strongest pillar, lead with this

---

### Pillar 2: Freight Intelligence

**Tagline:** *Price lanes with data, not guesswork.*

| Module | Status | Backend evidence | Website treatment |
|--------|--------|------------------|-------------------|
| **Historical Freight Pricing** | **Live** | `freight_prices.csv` ~200 EU lanes | Show lane map + sample prices |
| **Lane Intelligence** | **Beta** | CSV similarity matching; SI/DE/HR/IT/NL/PL focus | Map visualization; "Expanding lanes" note |
| **Route Cost Estimation** | **Beta** | Mapbox in `/api/freight/price`; wizard uses sample `/calculate-transport` | Show API response; note wizard integration In Development |
| **Fuel / Toll Modelling** | **Live** | `fuel_prices.json`, dynamic FTL rate by corridor | Technical credibility block |
| **Freight Calculator** | **Beta** | API live; wizard modal uses sample logic | Two entry points labeled differently |
| **AI Price Recommendations** | **Beta** | XGBoost `price_model.pkl` + CSV blend | "ML-powered LTL estimates" — not LLM chat |

**Pillar maturity:** ★★★☆☆ — strong API, wizard integration gap

---

### Pillar 3: Document Intelligence

**Tagline:** *From checklist to compliant documents.*

| Module | Status | Backend evidence | Website treatment |
|--------|--------|------------------|-------------------|
| **Export Documents** | **Beta** | `document_service.py` — requirements checklist | Workflow step 4 preview |
| **Commercial Invoices** | **Coming Soon** | Not in codebase | Template preview mockup |
| **Packing Lists** | **Coming Soon** | Not in codebase | Template preview mockup |
| **Compliance Reports** | **Live** | `pdf_service.py` — ReportLab PDF | Download sample PDF CTA |
| **PDF Generation** | **Live** | `POST /generate-pdf` | Show PDF thumbnail |

**Pillar maturity:** ★★☆☆☆ — checklist + PDF live; generation Coming Soon

---

### Pillar 4: AI Trade Assistant

**Tagline:** *Your trade copilot — understands products, guides decisions.*

| Module | Status | Backend evidence | Website treatment |
|--------|--------|------------------|-------------------|
| **Product Understanding** | **Live** | OpenAI gpt-4o-mini structured extraction, 13+ EU languages | Show multilingual demo |
| **Invoice Analysis** | **In Development** | CPR `invoice_phrases` matching only; no OCR | Mockup upload UI — badge In Development |
| **Trade Guidance** | **In Development** | No conversational layer | Assistant panel mockup |
| **Customs Guidance** | **Beta** | Disambiguation questions, taxonomy auto-answer | Show Q&A disambiguation UI |
| **Freight Guidance** | **Coming Soon** | No LLM freight chat | Roadmap item |

**Pillar maturity:** ★★★☆☆ — understanding Live; assistant UX Coming Soon

---

## 5. Homepage Structure — Section-by-Section Specification

### Section 1: Hero

**Purpose:** Establish platform OS positioning + immediate action

**Layout:** Full-width, light background, subtle grid. Split 55/45 — copy left, platform preview right.

**Copy:**

```
Eyebrow:     The Trade Operating System · Pre-launch
Headline:    One platform for customs, freight,
             documents, and trade intelligence.
Subhead:     ExportGateway connects AI-powered classification, historical
             customs evidence, EU freight pricing, and export documentation
             — built for exporters, forwarders, and customs professionals.

CTA Primary:    Try Compliance Wizard          [Live]
CTA Secondary:  Explore the platform ↓
CTA Tertiary:   Join early access

Trust strip:  80,000+ customs declarations · EU CN8 nomenclature ·
              Multilingual AI · No signup required
```

**Visual (right column):**
- Animated **platform hub diagram** — four pillars orbiting a central "Shipment" node
- OR: high-fidelity composite of wizard classification result + freight API card + PDF thumbnail
- NOT: generic container ship, dark dashboard, stock warehouse photos

**Status treatment:** Small pill on primary CTA: `Compliance Wizard — Live`

---

### Section 2: Platform Overview

**Purpose:** Explain the OS concept before diving into pillars

**Title:** *Everything trade professionals need — one connected platform*

**Layout:** Central hub illustration + four radiating cards

**Copy block:**
> ExportGateway replaces fragmented spreadsheets, tariff lookup tools, freight calculators, and document templates with a single intelligence layer. Each module shares the same product understanding, shipment context, and historical data — so classification informs freight, freight informs documents, and AI assists every step.

**Four mini-cards (link to pillar anchors):**

| Card | Icon | One line |
|------|------|----------|
| Customs Intelligence | Shield | CN/HS codes backed by 80k+ declarations |
| Freight Intelligence | Truck | EU road pricing from real lane history |
| Document Intelligence | FileText | Checklists today, generated docs tomorrow |
| AI Trade Assistant | Bot | Understands products in 13+ languages |

**Metric strip (verified from repo):**

| Metric | Value | Source |
|--------|-------|--------|
| AES declaration records | 80,000+ | Full historical mode target |
| Classification test cases | 64 across 8 categories | `live_baseline_benchmark.json` |
| Historical match rate | 97.5% | `aes_knowledge_coverage.json` |
| EU languages supported | 13+ | `product_understanding_service.py` |
| Freight lane records | 200+ | `freight_prices.csv` |

---

### Section 3: Four Product Pillars

**Purpose:** Deep dive each pillar with module grid + status badges

**Layout:** Four stacked sections, alternating light/muted backgrounds. Each pillar:
- Header: tagline + description + pillar maturity indicator
- Module grid: 2×3 or 3×2 cards with status badge, icon, one-line description
- "Explore [Pillar]" link → dedicated feature page (future)

---

#### 3A. Customs Intelligence

**Description:**
> The deepest CN/HS classification engine built for EU exporters — combining OpenAI product understanding, a 40-family taxonomy, full EU CN8 nomenclature search, and proprietary AES historical customs declaration evidence.

**Featured demo:** Slovenian jeans example
```
Input:  "500 kos moške bombažne jeans hlače"
Output: CN 6203 42 31 · Confidence 87% · AES evidence: 142 declarations
```

**Module cards:** (all from Section 4 map above)

**Visual:** Classification UI screenshot with confidence badge + collapsed "Historical Evidence" panel

---

#### 3B. Freight Intelligence

**Description:**
> EU road freight pricing powered by historical lane data, corridor fuel adjustment, Mapbox routing, and machine learning — not generic rate tables.

**Featured demo:** API response card
```
Ljubljana → Berlin · 1,009 km · LTL · 800 kg · 2.4 ldm
€380 (range €340–€420) · Confidence 85%
Sources: historical match + ML model + fuel adjustment
```

**Note banner (Beta honesty):**
> *Freight Intelligence API is live. Integration into the Compliance Wizard transport step is In Development.*

**Visual:** EU lane map (SI hub → DE, HR, IT, AT, NL, PL) with price dots

---

#### 3C. Document Intelligence

**Description:**
> Know exactly which documents your shipment requires — and generate compliant paperwork from classified product data.

**Today vs. Tomorrow split:**

| Today (Live/Beta) | Tomorrow (Coming Soon) |
|-------------------|------------------------|
| Route-based document checklist | Commercial invoice templates |
| Compliance PDF report | Auto-filled packing lists |
| Incoterm-aware requirements | Certificate of origin generation |
| CMR / B/L / AWB logic | Digital signatures |

**Visual:** Split panel — live checklist UI left, blurred invoice template mockup right with `Coming Soon`

---

#### 3D. AI Trade Assistant

**Description:**
> AI that understands trade — not a generic chatbot. Structured product extraction today; conversational customs, freight, and trade guidance tomorrow.

**Capability timeline visual:**

```
Live now          Beta              In Development       Coming Soon
────────          ────              ──────────────       ───────────
Product           Customs           Invoice              Freight
Understanding     Guidance          Analysis             Guidance
                  Disambiguation    Trade Guidance
```

**Visual:** Multilingual input → structured JSON output animation (not chat bubbles for unbuilt features)

---

### Section 4: Product Workflow

**Purpose:** Show end-to-end shipment journey across all four pillars

**Title:** *From product description to export-ready shipment*

**Layout:** Horizontal timeline or vertical stepper — 7 steps

| Step | Pillar | Action | Status |
|------|--------|--------|--------|
| 1 | AI Assistant | Describe product or upload invoice | Live / In Development |
| 2 | AI + Customs | AI identifies product attributes | Live |
| 3 | Customs | System suggests CN/HS codes with evidence | Live |
| 4 | Customs | TARIC duties + compliance guidance | Beta / In Development |
| 5 | Freight | Freight engine calculates transport cost | Beta |
| 6 | Document | Export documents generated | Beta / Coming Soon |
| 7 | Platform | Export shipment — PDF, workspace, API | Live / In Development |

**Dual-track labeling:**
- Solid line = **Available today**
- Dashed line = **Coming at launch**

**CTA:** Try step 1–4 now in the Compliance Wizard →

---

### Section 5: Real Data & Intelligence Layer

**Purpose:** Prove this is not a wrapper around ChatGPT — show proprietary data assets

**Title:** *Built on real trade data — not generic AI*

**Layout:** Dark accent section (single dark band on homepage — not full dark theme)

**Data asset cards:**

| Asset | Count / detail | Used by |
|-------|---------------|---------|
| AES Export Declarations | 62,888 records | Customs Intelligence |
| AES Import Declarations | 17,321 records | Customs Intelligence |
| EU CN8 Nomenclature | Full index + FTS5 | CN/HS Classification |
| Product Taxonomy | 40+ families | Classification + disambiguation |
| Customs Lexicon | Multilingual terms | Product Understanding |
| Industrial Lexicon | 422+ phrases | Entity recognition |
| Freight Price History | 200+ lane records | Freight Intelligence |
| EU VAT Rates | 27 member states | Compliance estimates |

**Architecture diagram (simplified):**
```
Product Description
       ↓
OpenAI Understanding ──→ Taxonomy + Lexicon
       ↓                        ↓
CN Nomenclature Search ←── AES Historical FTS
       ↓
Ranked CN Suggestions + Confidence + Evidence
```

**Honesty footer:**
> *Duty estimates currently use illustrative sample data. Live TARIC integration is In Development.*

---

### Section 6: Future Roadmap

**Purpose:** Show ambition without hiding timeline; build waitlist excitement

**Title:** *The platform is growing — here's what's next*

**Layout:** Timeline or kanban-style roadmap with quarters

| Quarter | Milestone | Modules |
|---------|-----------|---------|
| **Now (Live)** | Compliance Wizard, Classification API, Freight API, PDF reports | Customs (core), Freight API, Document (PDF) |
| **Q3 2026** | Live TARIC integration, Wizard ↔ Freight engine merge | TARIC Assistance, Route Cost in wizard |
| **Q4 2026** | ExportGateway Dashboard, user accounts, saved projects | Platform workspace |
| **Q1 2027** | Invoice upload + OCR, Commercial invoice generation | Document Intelligence, Invoice Analysis |
| **Q2 2027** | AI Trade Assistant (conversational), API portal | AI Assistant, Enterprise API |

**Badge legend repeated**

**CTA:** Join early access → email capture / contact form

---

### Section 7: Pricing

**Purpose:** Pre-launch pricing aligned with pillar access

**Title:** *Simple pricing for every stage of your export operation*

| Tier | Price | Pillars included | Status |
|------|-------|------------------|--------|
| **Free** | €0 | Customs (limited), VAT calculator, Compliance Wizard | Live |
| **Pro** | €49/mo | + Freight API, PDF exports, AI understanding, priority support | Beta — early access |
| **Enterprise** | Custom | + API access, team accounts, custom integrations, dedicated support | Coming Soon |

**Feature matrix** with per-module status dots

**Note:**
> *Pro and Enterprise tiers launch with the ExportGateway Dashboard. Compliance Wizard remains free during pre-launch.*

---

### Section 8: Security & Compliance

**Purpose:** Enterprise trust for brokers and forwarders evaluating early access

**Compact homepage version** — link to full `/security` page

**Blocks:**
- AES-256 at rest, TLS 1.3 in transit
- EU data residency (Amsterdam)
- GDPR compliant
- Classification audit trail (Live in backend)
- Indicative estimate disclaimers (P0 compliance culture)

**Status:** Mostly **Live** (practices) + **In Development** (SOC 2 certification if not yet obtained — label honestly)

---

### Section 9: FAQ

**Purpose:** Pre-empt trust questions for vision + pre-launch model

**Homepage preview (3 questions) + link to full FAQ**

1. *What's available today vs. coming soon?*  
   → Compliance Wizard and classification API are Live. Dashboard, invoice generation, and conversational AI are on the roadmap.

2. *Are CN codes official?*  
   → Suggestions use EU nomenclature and historical customs data. Always verify before filing.

3. *How is this different from Avalara or Descartes?*  
   → Self-serve, AI + historical evidence for SMEs; complementary to enterprise filing systems.

4. *Can I use the freight API now?*  
   → Yes — `POST /api/freight/price` is Live for EU road lanes.

(Full FAQ page expands to 12–15 questions)

---

### Section 10: CTA

**Purpose:** Convert vision believers to action

**Layout:** Full-width gradient band (brand blue → indigo)

**Copy:**
```
Headline:  Ready to move trade intelligence into one platform?
Subhead:   Start with the Compliance Wizard today — free, no signup.
           Join early access for the full ExportGateway launch.

CTA 1:  Try Compliance Wizard  [Live]
CTA 2:  Join Early Access
CTA 3:  Talk to our team
```

---

## 6. Navigation Architecture (Pre-launch)

### Primary nav

```
Logo | Platform ▾ | Pricing | Roadmap | FAQ | Security | [Try Wizard] [Join Early Access]
```

**Platform dropdown:**

| Column 1 | Column 2 |
|----------|----------|
| Customs Intelligence | Document Intelligence |
| Freight Intelligence | AI Trade Assistant |
| — | Compliance Wizard (Live) |

### Footer nav

```
Platform · Pricing · Roadmap · FAQ · Security · Contact
Privacy · Terms
Early Access · API Docs (Coming Soon)
```

### Remove from nav (until built)

- Login / Register → replace with **Join Early Access**
- Dashboard link → footer only with `In Development` badge

---

## 7. Visual Design System Updates

### Design principles

1. **Vision-forward, trust-honest** — show everything, badge honestly
2. **Product screenshots over stock imagery** — real wizard UI captures
3. **Light-first marketing** — single dark band for data layer section only
4. **Premium SaaS** — Stripe/Linear rhythm, Wise transparency, not WordPress bootstrap

### Status badge component spec

```tsx
// Proposed component: ModuleStatusBadge
type ModuleStatus = 'live' | 'beta' | 'in-development' | 'coming-soon';

// live:       bg-emerald-50 text-emerald-700 border-emerald-200
// beta:       bg-blue-50 text-blue-700 border-blue-200
// in-development: bg-amber-50 text-amber-700 border-amber-200
// coming-soon: bg-slate-100 text-slate-500 border-slate-200
```

**Rules:**
- Every module card MUST have a badge
- Beta/In Development cards show `ⓘ` tooltip with limitation
- Coming Soon cards are visually present but slightly desaturated (opacity 0.85, not hidden)

### Color palette (extend current)

| Token | Use |
|-------|-----|
| `brand-600` | Primary actions, Customs pillar accent |
| `cyan-600` | Freight Intelligence pillar |
| `emerald-600` | Document Intelligence pillar |
| `violet-600` | AI Trade Assistant pillar |
| `surface-dark` | Data layer section background only |

### Pillar iconography

| Pillar | Icon | Gradient |
|--------|------|----------|
| Customs Intelligence | Shield | blue → indigo |
| Freight Intelligence | Truck | blue → cyan |
| Document Intelligence | FileText | emerald → teal |
| AI Trade Assistant | Bot | violet → purple |

### Typography

- Headlines: bold, tight tracking, `text-balance`
- Module descriptions: 14px, slate-600
- Status badges: 11px uppercase semibold
- Data metrics: tabular nums, large bold

---

## 8. Page Architecture (Beyond Homepage)

| Route | Purpose | Priority |
|-------|---------|----------|
| `/` | Homepage (10 sections) | P0 |
| `/platform` | Platform OS overview + pillar links | P0 |
| `/platform/customs` | Customs Intelligence deep dive | P1 |
| `/platform/freight` | Freight Intelligence deep dive | P1 |
| `/platform/documents` | Document Intelligence deep dive | P1 |
| `/platform/ai-assistant` | AI Trade Assistant deep dive | P1 |
| `/roadmap` | Full roadmap timeline | P1 |
| `/pricing` | Tier matrix with module status | P0 |
| `/wizard` | iframe/embed to live Compliance Wizard | P0 |
| `/early-access` | Waitlist form | P0 |
| `/security` | Existing page — update copy | P1 |
| `/faq` | Expand for pre-launch questions | P1 |
| `/contact` | Existing | P1 |
| `/features` | Redirect → `/platform` | P2 |
| `/dashboard/*` | Keep as In Development preview with banner | P2 |

---

## 9. Component Implementation Map

When approved, refactor `src/` as follows:

### New components

```
src/components/platform/
  ModuleStatusBadge.tsx       # Status pill + tooltip
  PillarSection.tsx           # Reusable pillar layout
  ModuleCard.tsx              # Module with badge, icon, description
  PlatformHubDiagram.tsx      # Hero + overview visualization
  WorkflowStepper.tsx         # 7-step product workflow
  DataLayerSection.tsx        # Dark band with data assets
  RoadmapTimeline.tsx         # Quarter-based roadmap
  EarlyAccessForm.tsx         # Waitlist capture

src/components/home/
  HeroSection.tsx             # REWRITE — platform OS hero
  PlatformOverview.tsx        # NEW — section 2
  ProductPillars.tsx          # NEW — section 3 (replaces FeatureBlocks)
  ProductWorkflow.tsx         # NEW — section 4
  IntelligenceLayer.tsx       # NEW — section 5
  RoadmapPreview.tsx          # NEW — section 6
  PricingTeaser.tsx           # UPDATE — pillar-aware matrix
  SecurityPreview.tsx         # NEW — section 8 compact
  FAQPreview.tsx              # NEW — section 9
  CTASection.tsx              # UPDATE — dual CTA

src/lib/
  platform-modules.ts         # NEW — all modules, statuses, tooltips, pillar mapping
  constants.ts                # UPDATE — remove fabricated testimonials/stats
```

### Remove or deprecate

| Component | Action |
|-----------|--------|
| `TestimonialsSection.tsx` | Remove fabricated quotes; replace with metrics or early-access social proof |
| `CustomerBenefits.tsx` | Replace with verified `IntelligenceLayer` metrics |
| `FeatureBlocks.tsx` | Replace with `ProductPillars` |
| `FeaturesOverview.tsx` | Merge into `PlatformOverview` |

### New data file: `platform-modules.ts`

Central source of truth for all module metadata:

```typescript
export type ModuleStatus = 'live' | 'beta' | 'in-development' | 'coming-soon';

export interface PlatformModule {
  id: string;
  name: string;
  pillar: 'customs' | 'freight' | 'documents' | 'ai';
  status: ModuleStatus;
  description: string;
  limitation?: string;  // tooltip for beta/in-development
  href?: string;        // link to live tool if available
}
```

---

## 10. Copy Framework — Key Messages

### Headlines bank

| Context | Copy |
|---------|------|
| Hero | One platform for customs, freight, documents, and trade intelligence |
| Platform | The trade operating system for exporters and customs professionals |
| Customs pillar | Classify with confidence. Prove with history. |
| Freight pillar | Price lanes with data, not guesswork. |
| Document pillar | From checklist to compliant documents. |
| AI pillar | AI that understands trade — not a generic chatbot. |
| Data layer | Built on 80,000+ real customs declarations |
| Roadmap | The platform is growing — join early access |
| CTA | Start free with the Compliance Wizard |

### Words to use

- Operating system, platform, intelligence, evidence, declarations, nomenclature, lane, compliance, export-ready, early access

### Words to avoid

- "Revolutionary", "best-in-class" (unverified)
- "Global freight marketplace" (not built)
- "Official TARIC" (until live)
- "Upload any invoice" without In Development badge

---

## 11. Integration Points

| Integration | Env var | Used in |
|-------------|---------|---------|
| Compliance Wizard | `NEXT_PUBLIC_WIZARD_URL` | Hero CTA, /wizard embed |
| Freight API docs | `NEXT_PUBLIC_API_URL` | Freight pillar, developer preview |
| Early access | Form → `/contact` or email service | Roadmap, CTA |
| Analytics | `egw-analytics.js` pattern | Track wizard vs. early access clicks |

---

## 12. Migration from Current Site

| Current | New |
|---------|-----|
| Generic hero "Ship smarter across every border" | Platform OS hero with four pillars |
| 4 generic feature cards | 4 pillars × 5 modules each (20 modules, all badged) |
| Fabricated testimonials | Verified metrics + early access CTA |
| Fake stats (73%, €12K) | Benchmark stats from repo |
| Dark dashboard preview in hero | Platform hub diagram; dashboard In Development page |
| `/features` flat page | `/platform` + 4 pillar pages |
| Login / Register | Join Early Access |
| Pricing without status | Pricing with per-module availability |

---

## 13. Acceptance Criteria (Implementation Phase)

Homepage redesign implementation is complete when:

- [ ] All 10 homepage sections present per this spec
- [ ] All 20 modules across 4 pillars visible with correct status badges
- [ ] No module hidden — Coming Soon modules shown desaturated, not removed
- [ ] Beta/In Development modules have limitation tooltips
- [ ] Primary CTA links to live Compliance Wizard
- [ ] Secondary CTA captures early access interest
- [ ] Verified metrics only — no fabricated testimonials
- [ ] `platform-modules.ts` is single source of truth for statuses
- [ ] Roadmap section shows quarterly milestones
- [ ] Product workflow shows dual-track (solid = live, dashed = future)
- [ ] Mobile responsive across all sections
- [ ] `/platform/*` pillar pages exist or are stubbed with shared `PillarSection`

---

## 14. Implementation Phases (Post-Approval)

### Phase A — Foundation (Week 1)
- Create `platform-modules.ts` with all module metadata
- Build `ModuleStatusBadge`, `ModuleCard`, `PillarSection`
- Rewrite `HeroSection`, `PlatformOverview`

### Phase B — Homepage core (Week 1–2)
- Build `ProductPillars` (4 sections)
- Build `ProductWorkflow`, `IntelligenceLayer`
- Update `PricingTeaser`, `CTASection`

### Phase C — Trust & conversion (Week 2)
- Build `RoadmapTimeline`, `EarlyAccessForm`
- Update FAQ, Security preview
- Wire wizard URL, remove fabricated content

### Phase D — Pillar pages (Week 3)
- `/platform`, `/platform/customs`, `/platform/freight`, etc.
- `/roadmap`, `/early-access`, `/wizard` embed page

### Phase E — Dashboard preview (Week 3–4)
- Add `In Development` banner to dashboard routes
- Show planned workspace mockup aligned with four pillars

---

## 15. Summary Decision Matrix

| Question | Decision |
|----------|----------|
| Show future modules? | **Yes** — with Coming Soon / In Development badges |
| Hide unbuilt features? | **No** |
| Primary CTA? | Try Compliance Wizard (Live) |
| Secondary CTA? | Join Early Access |
| Honesty vs. vision? | **Both** — vision in structure, honesty in badges |
| Testimonials? | Remove until real; use benchmark metrics |
| Dashboard? | Show as In Development preview, not production |
| Competitor positioning? | Classification with proof; full OS vision vs. point tools |

---

## 16. Approval Checklist

Before engineering begins, confirm:

- [ ] Four pillar names and module list approved
- [ ] Status assignments per module approved (Section 4)
- [ ] Roadmap quarters realistic
- [ ] Pricing tiers aligned with GTM strategy
- [ ] Wizard URL and early access flow confirmed
- [ ] Legal review of pre-launch badges ("Beta", "Coming Soon")

---

**Next step upon approval:** Implement Phase A — `platform-modules.ts` + status badge system + hero rewrite. No code will be modified until this proposal is approved.
