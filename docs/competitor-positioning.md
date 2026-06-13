# ExportGateway — Competitor Positioning

> **Date:** June 9, 2026 (updated)  
> **Method:** Capability comparison based on complete audit of export-compliance-wizard-main, freight-api-main, and intrastat-allocation-api-main.

---

## Positioning Map

```
                    HIGH COMPLIANCE DEPTH
                            │
         Avalara ●          │          ● Descartes
                            │
                            │    ★ ExportGateway
                            │      (classification + 
                            │       historical AES +
                            │       EU wizard)
         iLovePDF ●         │
                            │
    LOW ────────────────────┼──────────────────── HIGH
    FREIGHT/logistics       │              FREIGHT/logistics
                            │
              Stripe ●      │     ● Flexport
              Mercury ●     │     ● Freightos
              Wise ●        │
                            │
                    LOW COMPLIANCE DEPTH
```

ExportGateway sits in the **upper-middle**: deeper than document tools and fintech, lighter than enterprise GTM suites — with a **unique AES historical classification angle** and a **three-tool trade intelligence suite** (customs + freight + Intrastat) none of the listed competitors replicate for SMEs.

---

## Competitor-by-Competitor Analysis

### 1. iLovePDF

**What they are:** Consumer/prosumer PDF toolkit — merge, split, convert, compress.

| | iLovePDF | ExportGateway |
|---|---------|---------------|
| **Core product** | PDF manipulation | CN classification + compliance wizard |
| **Target user** | Anyone with PDFs | Exporters, brokers, forwarders |
| **Trade domain** | None | Full export workflow |
| **AI** | Basic OCR in some tools | Structured product understanding for customs |

**iLovePDF strengths:**
- Massive brand recognition, freemium conversion
- Simple UX, instant utility
- PDF export is a tangible deliverable users understand

**iLovePDF weaknesses:**
- Zero customs, classification, or freight logic
- Not B2B trade software

**ExportGateway differentiation:**
- ExportGateway's PDF is a **compliance report**, not a document editor
- Do not compete on PDF features — compete on **what goes into the PDF** (CN code, duties, docs checklist)
- **Opportunity:** ExportGateway could add PDF invoice templates later, but today the moat is classification not PDF tooling

**Website implication:** Never position as "PDF export platform." Position PDF as one output of the compliance wizard.

---

### 2. Freightos

**What they are:** Digital freight marketplace — ocean/air quotes, booking, marketplace of forwarders.

| | Freightos | ExportGateway |
|---|----------|---------------|
| **Freight modes** | Ocean, air, trucking marketplace | EU road pricing API only |
| **Classification** | None | Core product |
| **Booking** | Yes | No |
| **Geography** | Global | EU-centric (SI lanes) |
| **Data** | Carrier rate marketplace | Historical CSV + ML model |

**Freightos strengths:**
- Real carrier network and booking workflow
- Global ocean/air — the modes most exporters search for
- Marketplace liquidity

**Freightos weaknesses:**
- No customs classification or compliance wizard
- Complex pricing, forwarder-dependent
- Overkill for SME exporters needing CN codes

**ExportGateway differentiation:**
- **Compliance-first, freight-second** — opposite entry point
- Historical customs data for classification (Freightos has none)
- Better for exporter asking "what is my product code?" before "what is freight cost?"

**Opportunity:** Partner narrative — "Classify with ExportGateway, book freight with your forwarder" rather than competing on marketplace.

**Website implication:** Do not show ocean containers as hero. If freight is shown, label "EU road estimate" not "global freight marketplace."

---

### 3. Flexport

**What they are:** Full-stack digital freight forwarder + customs brokerage + supply chain platform (enterprise).

| | Flexport | ExportGateway |
|---|---------|---------------|
| **Model** | Forwarder + tech platform | Software-only decision support |
| **Customs** | Licensed brokerage services | Classification suggestions (not brokerage) |
| **Freight** | End-to-end execution | Estimates only |
| **Target** | Mid-market to enterprise shippers | SME exporters, brokers, forwarders |
| **Price point** | High-touch, shipment-based | Free wizard + future SaaS tiers |

**Flexport strengths:**
- Owns the shipment — pickup to delivery
- Licensed customs clearance
- Supply chain visibility, inventory, financing

**Flexport weaknesses:**
- Expensive, enterprise sales cycle
- Overkill for classification-only use case
- Not accessible to solo exporters

**ExportGateway differentiation:**
- **Self-serve, instant, free** classification vs. Flexport's sales-led onboarding
- **Historical AES data** as classification signal — Flexport uses internal ops data, not exposed as self-serve tool
- ExportGateway is a **tool for brokers and forwarders**, not a forwarder competitor

**Opportunity:** Position as **pre-Flexport planning tool** or **broker assistant** — "Validate CN codes before handing to your forwarder."

**Website implication:** Target SMEs and brokers Flexport ignores. Emphasize speed and no commitment.

---

### 4. Wise (formerly TransferWise)

**What they are:** International money transfer and multi-currency accounts — fintech.

| | Wise | ExportGateway |
|---|------|---------------|
| **Domain** | Payments, FX, banking | Customs, classification, compliance |
| **Overlap** | None direct | Both serve international business |
| **UX benchmark** | Transparent fees, honest limitations | Should emulate transparency |

**Wise strengths:**
- Radical fee transparency — shows exactly what you pay
- Clean, trustworthy UI
- Clear "what we don't do" messaging

**Wise weaknesses:**
- No trade compliance features

**ExportGateway differentiation:**
- Different category entirely — no payment overlap
- **Learn from Wise:** ExportGateway's P0 disclaimer audit mirrors Wise's transparency approach

**Website implication:** Adopt Wise-style honesty — show "indicative estimate" labels prominently like Wise shows mid-market rates vs. bank rates. Do not borrow fintech visual language (cards, balances).

---

### 5. Stripe

**What they are:** Payment infrastructure API — developer-first fintech platform.

| | Stripe | ExportGateway |
|---|--------|---------------|
| **Product** | Payments, billing, Connect | Trade compliance |
| **Audience** | Developers | Exporters, brokers |
| **Design** | Gold standard developer UX | Should aspire to clarity, not copy patterns |

**Stripe strengths:**
- Best-in-class documentation and API design
- Developer trust through precise technical communication
- Premium aesthetic without being corporate

**Stripe weaknesses:**
- Irrelevant to trade compliance domain

**ExportGateway differentiation:**
- None in product — **design and documentation benchmark only**

**Website implication:**
- Borrow: section rhythm, gradient hero restraint, precise copy, code/API snippets when API launches
- Avoid: payment form patterns, "Stripe for X" positioning cliché, purple-blue fintech gradients without trade context

---

### 6. Mercury

**What they are:** Startup banking — business accounts, treasury, expense management.

| | Mercury | ExportGateway |
|---|---------|---------------|
| **Domain** | Banking | Trade compliance |
| **Audience** | US startups | EU exporters |
| **Overlap** | International business customers | Minimal |

**Mercury strengths:**
- Premium dark/light design for SaaS
- Clear persona targeting (startups)
- Clean dashboard aesthetics

**Mercury weaknesses:**
- No trade, customs, or logistics features
- US-focused banking

**ExportGateway differentiation:**
- Different vertical — Mercury is not a competitor

**Website implication:**
- Borrow: premium card layouts, persona clarity
- Avoid: dark dashboard mockups (ExportGateway has no dashboard), startup banking tone

---

### 7. Avalara

**What they are:** Tax compliance automation — sales tax, VAT, customs duty calculation at scale (enterprise).

| | Avalara | ExportGateway |
|---|---------|---------------|
| **Classification** | HS/CBT engines (enterprise) | AI + AES historical (SME-focused) |
| **Duty rates** | Live tariff data integrations | Sample TARIC only (gap) |
| **Target** | Enterprise, ERP integrations | SME exporters, brokers |
| **Pricing** | Enterprise contracts | Free wizard + future €49/mo |
| **Geography** | Global | EU-focused |

**Avalara strengths:**
- Live tariff and tax rate data
- ERP/shopify integrations at scale
- Established enterprise trust
- AvaTax cross-border capabilities

**Avalara weaknesses:**
- Expensive, complex implementation
- Not self-serve for a single product classification
- Overwhelming for SME exporter

**ExportGateway differentiation:**
- **Self-serve, free, instant** — Avalara requires sales
- **AES historical declaration evidence** — Avalara uses tariff databases, not customs declaration history injection
- **Integrated wizard workflow** — classify + docs + VAT + PDF in one flow
- **Multilingual EU product understanding** — optimized for SI/DE/HR exporters

**ExportGateway weaknesses vs. Avalara:**
- No live TARIC (critical gap for duty accuracy)
- No ERP integrations
- No enterprise compliance certifications listed

**Opportunity:** Own the **"Avalara for European SMEs"** positioning at 1/100th the complexity — but only after live TARIC or honest "planning estimate" framing.

**Website implication:** Never claim parity with Avalara on duty accuracy. Lead with classification depth and self-serve speed.

---

### 8. Descartes

**What they are:** Global logistics technology — customs filing (Global Logistics Network), trade content, denied party screening, TMS.

| | Descartes | ExportGateway |
|---|----------|---------------|
| **Customs filing** | Production customs declarations | Planning estimates only |
| **Content** | Licensed trade content (tariffs, regs) | Own AES data + EU CN index |
| **Target** | Enterprise logistics, customs brokers | SME + broker assistant tool |
| **Scale** | Global GTM platform | Single FastAPI app on Render starter |

**Descartes strengths:**
- Official customs filing connectivity
- Comprehensive regulatory content
- Enterprise broker and forwarder network
- Denied party screening, AES filing

**Descartes weaknesses:**
- Expensive, long implementation
- Not accessible to individual exporters
- UI dated compared to modern SaaS

**ExportGateway differentiation:**
- **Pre-filing decision support** — help users before they reach Descartes filing stage
- **AI + historical evidence UX** — modern, self-serve
- **Price/accessibility** — free wizard vs. enterprise contracts

**ExportGateway weaknesses vs. Descartes:**
- Cannot file customs declarations
- No denied party screening
- No regulatory content licensing

**Opportunity:** "Prepare with ExportGateway, file with your broker's Descartes system" — complementary positioning.

---

## Competitive Matrix Summary

| Capability | ExportGateway | iLovePDF | Freightos | Flexport | Wise | Stripe | Mercury | Avalara | Descartes |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| CN/HS Classification | ● | | | ○ | | | | ● | ○ |
| AI Product Understanding | ● | | | | | | | ○ | |
| Historical Customs Data | ● | | | ○ | | | | | ○ |
| Live TARIC Duties | | | | ● | | | | ● | ● |
| Document Checklist | ● | | | ● | | | | ○ | ● |
| PDF Export | ○ | ● | ○ | ● | | | | ○ | ● |
| EU Road Freight Pricing | ○ | | ○ | ● | | | | | ○ |
| Ocean/Air Marketplace | | | ● | ● | | | | | ○ |
| Customs Filing | | | | ● | | | | ○ | ● |
| Self-Serve Free Tier | ● | ● | ○ | | ● | ● | ● | | |
| ERP/API Integration | | | ● | ● | ● | ● | ● | ● | ● |
| Payments/Banking | | | | ○ | ● | ● | ● | | |

● = strong · ○ = partial · blank = none

---

## ExportGateway SWOT

### Strengths
- Unique AES historical declaration injection into CN ranking
- Production OpenAI product understanding with multilingual EU support
- Integrated compliance wizard (classify → ship → cost → docs → PDF)
- **Three live products on one backend:** Wizard UI + Freight API + Intrastat API
- Real EU road freight pricing engine with historical CSV + XGBoost (freight-api-main)
- Intrastat freight allocation — niche capability Avalara/Descartes don't expose to SMEs
- Honest disclaimer/transparency culture (P0 audit)
- Free, no-signup access — low friction

### Weaknesses
- Sample TARIC duties — not production-grade for duty reliance
- Wizard transport uses sample logic, not freight engine (engine exists at `/api/freight/price`)
- **Freight and Intrastat have no UI** — API-only until ExportGateway platform surfaces them
- No invoice upload/OCR
- No auth, teams, billing, or public API product
- Render starter plan — scale limits
- WordPress embed + Bootstrap wizard — not premium SaaS UX

### Opportunities
- Wire freight engine into wizard — immediate product uplift
- Live TARIC integration — closes gap with Avalara/Descartes on duties
- Invoice OCR — unlocks "upload invoice" marketing workflow
- Broker/forwarder white-label API
- EU SME market underserved by enterprise GTM tools
- Intrastat allocation as niche forwarder feature

### Threats
- Avalara or Descartes launching SME self-serve tier
- OpenAI commoditizing basic HS classification
- Flexport/Freightos adding free classification tools
- Users relying on indicative duties and facing customs penalties
- Regulatory liability if disclaimers insufficient

---

## Differentiation Opportunities (Actionable)

| # | Opportunity | Rationale |
|---|------------|-----------|
| 1 | **"Classification with proof"** | Show historical declaration evidence alongside CN suggestion — no competitor in list does this for SMEs |
| 2 | **"Multilingual EU exporter tool"** | Own Slovenia/CEE exporter niche before Avalara localizes |
| 3 | **"Honest compliance estimator"** | Wise-style transparency as brand — trust over hype |
| 4 | **"Broker assistant, not broker replacement"** | Partner with forwarders instead of competing with Flexport |
| 5 | **"Pre-filing planning"** | Position before Descartes/Avalara filing stage |
| 6 | **Freight + compliance bundle** | Wire freight engine into wizard — unique integrated SME offer |

---

## Messaging vs. Competitors

| If user compares to... | ExportGateway response |
|---------------------|----------------------|
| iLovePDF | "We don't edit PDFs — we generate compliance reports from classified products" |
| Freightos | "We help you classify and comply before you book freight" |
| Flexport | "Self-serve classification in 2 minutes — no forwarder contract needed" |
| Avalara | "Free CN classification with customs history — Avalara-grade duty data coming" |
| Descartes | "Plan your export before filing — we prepare, your broker files" |
| DIY Google search | "AI + 80,000 customs declarations beat guessing HS codes" |

---

## Conclusion

ExportGateway's competitive moat is **not** freight marketplaces (Freightos/Flexport), **not** document editing (iLovePDF), and **not** payments (Wise/Stripe/Mercury).

It is a **Trade Intelligence Platform** for EU SMEs:
1. **Classification with proof** — AI + AES historical evidence (Compliance Wizard)
2. **EU road freight intelligence** — historical data + ML, not marketplace booking (Freight Calculator)
3. **Intrastat allocation** — route-based domestic/foreign cost split (Intrastat Allocation)

**Positioning:** Trade Intelligence Platform — not Customs-only, Freight-only, or Intrastat-only.

The website must evolve from brochure to **platform hub** where users launch and test all three tools. Avoid claiming parity with Avalara/Descartes on duty accuracy until live TARIC ships.

Win by being the **fastest integrated path from product description to classification, freight estimate, and Intrastat allocation** for European exporters.
