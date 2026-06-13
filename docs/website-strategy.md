# ExportGateway — Website Strategy

> **Purpose:** Guide homepage, platform hub, and tools integration based on complete three-product audit.  
> **Date:** June 9, 2026 (updated)  
> **Constraint:** Do not claim features that are not implemented. Label all estimates clearly.

---

## Strategic Positioning Statement

**ExportGateway is a Trade Intelligence Platform — a suite of connected EU trade tools for classification, freight pricing, and Intrastat allocation.**

Not: "Customs platform only."  
Not: "Freight marketplace."  
Not: "The all-in-one global logistics platform."

**Lead message:**  
*"Three working tools. One platform. Classify exports, price EU road freight, allocate Intrastat costs — free to try."*

---

## Positioning Decision (Phase 3)

| Option | Fit | Verdict |
|--------|-----|---------|
| Customs Platform | Wizard is strongest product | Too narrow — ignores freight + intrastat APIs |
| Freight Platform | Freight API exists but no UI | Too narrow — classification is the moat |
| Intrastat Platform | Niche API only | Too narrow — specialist sub-tool |
| **Trade Intelligence Platform** | Covers all three live products | **Recommended** |

**Tagline direction:** *The Trade Operating System* (existing) with subline: *Customs · Freight · Intrastat — connected tools for EU trade.*

---

## Three Products to Surface

| Tool | Status | UI today | Website action |
|------|--------|----------|----------------|
| Export Compliance Wizard | **Live** | Full wizard at `GET /` | iframe embed at `/tools/export-compliance-wizard` |
| Freight Calculator | **Live** (API) | None | Build calculator UI at `/tools/freight-calculator` → `/api/freight/price` |
| Intrastat Allocation | **Live** (API) | None | Build allocation UI at `/tools/intrastat-allocation` → `/api/intrastat/address` |

All three share production host: `https://export-compliance-wizard.onrender.com`

---

## Site Architecture (Target)

```
/                          Homepage (keep — improve with 3-tool story)
/platform                  Platform Hub — suite overview, quick launch
/tools                     Tool directory — cards with status badges
/tools/export-compliance-wizard   Embed + feature overview + Launch
/tools/freight-calculator         API playground UI + Launch
/tools/intrastat-allocation       API playground UI + Launch
/pricing, /faq, /early-access      Existing pages (update copy)
```

**Navigation update:** Add **Tools** and **Platform** to primary nav alongside existing links.

---

## What Should Be on the Homepage (Updated)

### Keep existing homepage structure — enhance with:

1. **Hero** — Add "3 live tools" trust line; primary CTA → `/platform` or wizard
2. **Why ExportGateway** — Emphasize suite, not single wizard
3. **Platform Overview** — Show three product cards with Live/Beta badges
4. **Workflow** — Wizard workflow + mention freight/intrastat as companion tools
5. **New section (recommended):** **Tools Preview** — 3 cards linking to `/tools/*`

### Do not remove:
- Roadmap, disclaimer, pricing teaser, security preview, FAQ, CTA sections

---

## Platform Hub Page (`/platform`)

**Purpose:** ExportGateway behaves like a **suite of connected trade tools**, not just a marketing site.

**Content blocks:**

| Block | Content |
|-------|---------|
| Hero | "Your EU trade toolkit — classify, price, allocate" |
| Tool grid | 3 cards: Wizard (Live), Freight Calculator (Live), Intrastat (Live) |
| Integration story | "One backend, three tools — more coming" |
| Quick start | Launch any tool in one click |
| Roadmap strip | Document Intelligence, AI Assistant — In Development |

**Each tool card:**
- Name + status badge (Live)
- One-line description
- Key capability bullets (3 max)
- `Open Tool →` button

---

## Tools Directory (`/tools`)

**Layout:** Grid of product cards (same 3 tools).

**Each card links to dedicated landing page** with:
- Feature overview (from repo audit — honest scope)
- Status badge
- Screenshot placeholder or live capture (none in repos — generate from production)
- **Launch** button (embed page or external URL)
- Technical note: "Powered by ExportGateway API"

---

## Tool Landing Pages

### `/tools/export-compliance-wizard`

| Element | Source |
|---------|--------|
| Status | Live |
| Features | 4-step wizard, CN classification, AES evidence, PDF, lead capture |
| Launch | iframe `https://export-compliance-wizard.onrender.com/` |
| Screenshots | Capture from production (not in repo) |
| Disclaimer | Indicative duties; sample TARIC |

### `/tools/freight-calculator`

| Element | Source |
|---------|--------|
| Status | Live (API) |
| Features | FTL/LTL, Mapbox distance, historical CSV, XGBoost LTL, price range |
| Launch | Built-in form UI posting to `/api/freight/price` |
| Limitations | EU road only; SI-centric lane data; no booking |
| Note | Wizard transport modal uses sample logic — this is the real engine |

### `/tools/intrastat-allocation`

| Element | Source |
|---------|--------|
| Status | Live (API) |
| Features | Address or coordinate input, Mapbox route, domestic/foreign split, route segments |
| Launch | Built-in form UI posting to `/api/intrastat/address` |
| Limitations | Requires Mapbox; approximate country sampling |
| Audience | Forwarders, SI/EU Intrastat reporters |

---

## Embeddability Strategy (Phase 5)

| Tool | Strategy |
|------|----------|
| Compliance Wizard | **iframe embed** — full UI exists at `GET /` |
| Freight Calculator | **Built UI on ExportGateway** — no external UI exists |
| Intrastat Allocation | **Built UI on ExportGateway** — no external UI exists |

**API base URL:** `NEXT_PUBLIC_API_BASE_URL=https://export-compliance-wizard.onrender.com`

**CORS:** Already configured for `exportgateway.eu` — Next.js dev/production domains may need adding to `CORS_ORIGINS` on Render.

---

## What Should NOT Be on the Website

| Avoid | Why |
|-------|-----|
| Claiming Freight/Intrastat have standalone UIs | They are API-only until ExportGateway builds them |
| Linking to decommissioned Render URLs | Use merged host only |
| "Upload invoice" as primary workflow | Not implemented |
| Ocean/air freight marketplace imagery | Road-focused only |
| Fake testimonials or unverified stats | Already removed in prior redesign |
| Beta badge on Freight/Intrastat if APIs are live | Mark Live for API; note "UI on ExportGateway" |

---

## Main Call-to-Action Hierarchy

| Priority | CTA | Destination |
|----------|-----|-------------|
| Primary | Explore the Platform | `/platform` |
| Secondary | Try Compliance Wizard | `/tools/export-compliance-wizard` |
| Tertiary | Join Early Access | `/early-access` |

---

## Screenshots & Assets Strategy

**No images exist in any of the three repos.**

| Asset | Action |
|-------|--------|
| Wizard UI | Screenshot production `GET /` steps 1–4 |
| Classification result | Capture disambiguation + confidence UI |
| PDF sample | Generate via `/generate-pdf` |
| Freight result | Screenshot built calculator UI after Phase 4 |
| Intrastat result | Screenshot built allocation UI with route segments |

Until captures exist, use **styled API response mockups** from real JSON schemas.

---

## Messaging Framework

**We are:** A trade intelligence platform with three live EU tools  
**We are not:** A freight marketplace, document editor, or global TMS

**Per-tool honesty:**
- Wizard: "Indicative compliance estimates"
- Freight: "EU road pricing from historical data — not a booking platform"
- Intrastat: "Route-based cost allocation for reporting — verify with your broker"

---

## Success Metrics

- Tool launch rate from `/platform` > 20%
- Time-to-first-classification < 30 seconds
- Freight calculator API calls from built UI
- Intrastat allocation completions from built UI
- Zero support tickets expecting invoice upload or ocean freight booking
