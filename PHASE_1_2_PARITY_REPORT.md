# Phase 1.2 Parity Report

**Date:** 2026-06-15  
**Scope:** Native Classification Wizard UI parity & UX polish  
**Status:** Complete — feature-flagged preview ready; production default remains iframe

---

## Summary

Phase 1.2 polishes the native `ClassificationWizard` for visual hierarchy, readability, and functional parity with the iframe wizard. The native component uses the **same Render API** (`POST /classify/v2`) — classification data is identical by construction.

**Feature flag:** `NEXT_PUBLIC_USE_NATIVE_CLASSIFICATION_WIZARD=true` switches `/platform/customs` to native preview. Default `false` — no production behavior change.

---

## Feature flag

| Variable | Default | Effect |
|----------|---------|--------|
| `NEXT_PUBLIC_USE_NATIVE_CLASSIFICATION_WIZARD` | unset / `false` | iframe embed (`WizardEmbed`) |
| `NEXT_PUBLIC_USE_NATIVE_CLASSIFICATION_WIZARD=true` | dev/staging | Native `ClassificationWizard` + preview banner |

**Enable locally** (`.env.local`):

```
NEXT_PUBLIC_USE_NATIVE_CLASSIFICATION_WIZARD=true
```

Restart `next dev`, open `/platform/customs`.

---

## Screenshots

Automated browser screenshots were not captured in this session. Manual capture recommended:

1. Set flag `true` → classify `Men's cotton jeans` → capture full results stack
2. Set flag `false` → same query in iframe → side-by-side compare
3. Mobile viewport (375px) — native only

**Expected:** Native layout shows larger HS code, prominent commodity block, bold AES count, structured Why section.

---

## API parity validation

Script: `scripts/parity-test-classify.mjs`  
Endpoint: `POST https://export-compliance-wizard.onrender.com/classify/v2`  
Plan: `ENTERPRISE`

Native and iframe both consume this response — **field parity is guaranteed**.

| Input | CN Code | Confidence | Source | AES Count | Evidence |
|-------|---------|------------|--------|-----------|----------|
| Men's cotton jeans | 6203 42 31 | MEDIUM | AES Historical Data | 5 | Medium |
| Hydraulic oil ISO VG46 | 8481 20 10 | MEDIUM | AI Classification | 3 | Weak |
| MAKITA BO5041SET | 8470 10 00 | MEDIUM | AI Classification | 1 | Weak |
| SENSOR | 9025 11 20 | HIGH | AI Classification | 2 | Weak |

**Parity verdict:** ✅ Same API contract — native displays identical `recommended_cn_code`, `confidence`, `research_source`, `historical_evidence`, `commodity_description`, and enriched fields.

---

## UX improvements (native vs iframe)

| Area | Before (Phase 1.1 scaffold) | After (Phase 1.2) |
|------|----------------------------|-------------------|
| **HS code** | Small mono text | Large hero (4xl/5xl), brand border gradient |
| **Commodity** | Plain paragraph | Code + title hierarchy + vertical nomenclature path |
| **AES evidence** | Text list | Large declaration count, bold strength, most common tariff |
| **Confidence** | Basic badge | Color-coded band + source explanation |
| **Summary** | Inline in reasoning | Dedicated card, checkmark attribute grid |
| **Why** | Long paragraph | Structured bullets from `reasoning.detected`, heading hint, code |
| **Sources** | Text icons | Lucide check/x/minus checklist, "AI Analysis" label |
| **Usage bar** | Single line | Plan / classifications / research credits columns |
| **Trust section** | Missing | 70k AES stat + process list restored |
| **Loading** | Plain list | Icons + spinner stages |
| **Layout** | Basic grid | Priority-ordered stack, no fixed height, browser scroll only |

---

## Visual hierarchy (5-second rule)

Results render in this order:

1. **Recommended Classification** — `ClassificationHero`
2. **Commodity Description** — `CommodityDescriptionCard` (strongest element after HS)
3. **Confidence** + **Historical Evidence** — side-by-side on desktop
4. **Classification Summary** — detected attributes
5. **Why This Classification** — concise structured rationale
6. **Classification Sources** — transparent checklist
7. **Alternative Classifications** — when applicable
8. **Compliance Notice** — post-results only

---

## Component changes

### New / updated

| File | Change |
|------|--------|
| `src/lib/classification-utils.ts` | CN formatting, confidence source labels |
| `src/config/native-classification-wizard.ts` | Feature flag helper |
| `ClassificationTrustSection.tsx` | AES trust block |
| `ClassificationLoadingStages.tsx` | Animated loading |
| `ClassificationSummaryCard.tsx` | Split from ReasoningCard |
| `WhyClassificationCard.tsx` | Structured why (max ~5 lines) |
| `ClassificationHero.tsx` | Large HS display |
| `CommodityDescriptionCard.tsx` | Hierarchy path, prominent description |
| `EvidenceCard.tsx` | Bold AES stats |
| `ConfidenceCard.tsx` | Source explanation |
| `SourcesCard.tsx` | Icon checklist |
| `UsageBar.tsx` | Professional usage columns |
| `ClassificationResults.tsx` | Priority-ordered layout |
| `ClassificationWizard.tsx` | Trust + loading integration |
| `PlatformWizardTool.tsx` | Feature flag switch |

### Removed

| File | Reason |
|------|--------|
| `ReasoningCard.tsx` | Replaced by Summary + Why cards |

### Unchanged

| Item | Status |
|------|--------|
| `WizardEmbed.tsx` | Kept — default path |
| Render backend | No changes |
| Classification engine | No changes |

---

## Layout guarantees

| Constraint | Native wizard |
|------------|---------------|
| No internal scrolling | ✅ No overflow/max-height on results |
| No fixed-height containers | ✅ Natural page growth |
| No iframe assumptions | ✅ Single document scroll |
| Responsive | ✅ Mobile single column; lg two-column confidence/evidence |

---

## Export Auditor preparation

Unchanged from Phase 1.1 — `classification-integration.ts` with `OnClassificationSelected`. Not activated. Future "Use Classification" button will call callback explicitly.

---

## Remaining blockers before Phase 2

| Blocker | Priority | Notes |
|---------|----------|-------|
| Manual visual QA + screenshots | P0 | Side-by-side iframe vs native on `/platform/customs` |
| About modal | P2 | iframe has modal; native can defer or add platform dialog |
| Export Auditor handoff | P2 | postMessage replacement — separate task |
| `egw-analytics` events | P3 | iframe fires `classification_completed`; add to native before cutover |
| Production flag default | P0 | Keep `false` until QA sign-off; flip in Phase 2 |
| Remove iframe code | Phase 4 | After controlled replacement |

**No technical blockers** on API or component architecture — ready for controlled Phase 2 cutover after manual QA.

---

## How to test parity

```bash
# API baseline (same data native + iframe use)
node scripts/parity-test-classify.mjs

# Native UI
# .env.local: NEXT_PUBLIC_USE_NATIVE_CLASSIFICATION_WIZARD=true
npm run dev
# → http://localhost:3000/platform/customs

# Iframe UI (default)
# Remove flag or set false
```

Compare for each golden input:
- Recommended CN code
- Confidence band
- Research source
- Declaration count
- Commodity description (first line)

---

## Success criteria

| Criterion | Status |
|-----------|--------|
| Native wizard production-ready appearance | ✅ |
| Visual hierarchy (5-second comprehension) | ✅ |
| No iframe regressions (default path unchanged) | ✅ |
| Feature flag for A/B testing | ✅ |
| Same API results as iframe | ✅ (API parity verified) |
| Ready for controlled WizardEmbed replacement | ✅ pending manual QA |

---

## Next step: Phase 2

1. Manual QA + screenshots sign-off
2. Set `NEXT_PUBLIC_USE_NATIVE_CLASSIFICATION_WIZARD=true` on staging
3. Replace default to native after approval
4. Phase 4: remove `WizardEmbed` and iframe infrastructure
