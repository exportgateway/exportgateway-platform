# Phase 1.1 Implementation Report

**Date:** 2026-06-15  
**Scope:** Native Export Classification Wizard foundation — types, API client, component scaffold  
**Status:** Complete — no production route changes

---

## Summary

Phase 1.1 adds a **native wizard foundation** to ExportGateway without modifying the Render backend, without replacing `WizardEmbed`, and without changing `/platform/customs` user-visible behavior.

The platform now has typed API contracts, server-side fetch functions, and a decomposed React component tree ready for Phase 1.2 visual implementation and Phase 2 cutover.

---

## Created files

### API layer

| File | Purpose |
|------|---------|
| `src/lib/wizard-types.ts` | TypeScript types mirroring `app/models/schemas.py` |
| `src/lib/wizard-api.ts` | Server actions: `classifyProductV2`, `getClassificationUsage`, `healthCheck` |

### Integration contract (future Export Auditor)

| File | Purpose |
|------|---------|
| `src/components/platform/classification/classification-integration.ts` | `ClassificationSelectedPayload`, `OnClassificationSelected`, `buildClassificationSelectedPayload()` |

### Component scaffold

| File | Responsibility |
|------|----------------|
| `src/components/platform/classification/ClassificationWizard.tsx` | State machine, API orchestration, loading stages |
| `src/components/platform/classification/ClassificationInput.tsx` | Product input + classify button |
| `src/components/platform/classification/ClassificationResults.tsx` | Results layout container |
| `src/components/platform/classification/ClassificationHero.tsx` | Recommended CN code |
| `src/components/platform/classification/CommodityDescriptionCard.tsx` | Commodity description + hierarchy |
| `src/components/platform/classification/UsageBar.tsx` | Plan usage snapshot |
| `src/components/platform/classification/ConfidenceCard.tsx` | Confidence band + source |
| `src/components/platform/classification/EvidenceCard.tsx` | AES historical evidence |
| `src/components/platform/classification/ReasoningCard.tsx` | Summary + why explanation |
| `src/components/platform/classification/AlternativeClassificationsCard.tsx` | Up to 3 alternatives |
| `src/components/platform/classification/SourcesCard.tsx` | Source checklist |
| `src/components/platform/classification/ComplianceCard.tsx` | Post-results disclaimer |

**Total:** 15 new files

---

## API contracts

### `POST /classify/v2`

**Request — `ClassifyV2Request`**

```typescript
{
  product_description: string;  // min 2, max 500
  plan?: string | null;         // FREE | PRO | ENTERPRISE | ADMIN
}
```

**Response — `ClassifyV2Response`**

| Field | Type |
|-------|------|
| `query` | `string` |
| `recommended_cn_code` | `string \| null` |
| `confidence` | `HIGH \| MEDIUM \| LOW` |
| `historical_evidence` | `HistoricalEvidenceSummary` |
| `reasoning` | `ClassificationReasoning` |
| `alternatives` | `AlternativeClassification[]` |
| `research_source` | `ResearchSource` |
| `manual_classification_recommended` | `boolean` |
| `product_type` | `string` |
| `usage` | `UsageResponse` |
| `from_cache` | `boolean` |
| `commodity_description` | `string` |
| `hierarchy_path` | `HierarchyStep[]` |
| `classification_summary` | `ClassificationSummary \| null` |
| `why_explanation` | `string` |
| `confidence_source` | `string` |
| `source_breakdown` | `SourceBreakdown \| null` |

**Client wrapper — `classifyProductV2()`**

```typescript
{ success: true, data: ClassifyV2Response }
| { success: false, detail: string }
```

### `GET /classify/v2/usage?plan=`

**Response — `UsageResponse`**

| Field | Type |
|-------|------|
| `plan` | `string` |
| `month_key` | `string` |
| `classifications_used` | `number` |
| `classifications_limit` | `number` |
| `classifications_remaining` | `number` |
| `research_used` | `number` |
| `research_limit` | `number` |
| `research_remaining` | `number` |

**Client wrapper — `getClassificationUsage(plan)`**

### `GET /health`

**Client wrapper — `healthCheck()`** → `{ success, data: WizardHealthResponse }`

### Enums (from engine + schema)

| Enum | Values |
|------|--------|
| `ConfidenceBand` | `HIGH`, `MEDIUM`, `LOW` |
| `ResearchSource` | `AES Historical Data`, `Knowledge Base`, `AI Classification`, `Web Research` |
| `EvidenceLevel` | `none`, `weak`, `medium`, `strong` |
| `EvidenceStrength` | `None`, `Weak`, `Medium`, `Strong` (+ string fallback) |

---

## Component tree

```
ClassificationWizard
├── header (title, subtitle, legal strip)
├── UsageBar
├── ClassificationInput
├── loading stages (inline in wizard)
├── error banner (inline in wizard)
└── ClassificationResults
    ├── ClassificationHero
    ├── CommodityDescriptionCard
    ├── grid
    │   ├── ConfidenceCard
    │   ├── EvidenceCard
    │   ├── ReasoningCard (summary + why — 2 articles)
    │   ├── AlternativeClassificationsCard
    │   └── SourcesCard
    ├── manual classification alert (inline)
    ├── ComplianceCard
    └── restart button (inline)
```

**State machine in `ClassificationWizard`:**

```
idle → loading → results
              ↘ error
```

---

## Export Auditor integration point (prepared, not activated)

**File:** `classification-integration.ts`

```typescript
interface ClassificationSelectedPayload {
  cn_code: string;
  query: string;
  confidence: ConfidenceBand | string;
  source: ResearchSource | string;
  commodity_description: string;
}

type OnClassificationSelected = (payload: ClassificationSelectedPayload) => void;
```

**`ClassificationWizard` props (future):**

| Prop | Purpose |
|------|---------|
| `onClassificationSelected?` | Callback when user confirms tariff for auditor line |
| `auditorContext?` | Flag to show future "Use Classification" action |

**Not activated in Phase 1.1:** No automatic callback on classify. Future Phase will add explicit user action matching current wizard `Use Classification` button.

**Future flow:**

```
Export Auditor → missing HS → navigate to wizard (auditorContext=true)
→ user classifies → user clicks "Use Classification"
→ onClassificationSelected(payload) → return tariff to auditor workflow
```

---

## Intentionally unchanged

| Item | Status |
|------|--------|
| `WizardEmbed.tsx` | Kept — still serves `/platform/customs` |
| `PlatformWizardTool.tsx` | Still imports `WizardEmbed` |
| Render `/classify/v2` backend | No changes |
| Classification engine / AES / KB / plan limits | No changes |
| Export Auditor | No changes |
| iframe / postMessage / resize logic | No changes |

---

## How to preview scaffold (dev only)

Import `ClassificationWizard` in a dev-only page or Storybook — **not wired to production route**.

Example (do not merge until Phase 2):

```tsx
import { ClassificationWizard } from "@/components/platform/classification/ClassificationWizard";

export default function DevWizardPage() {
  return <ClassificationWizard />;
}
```

Requires `NEXT_PUBLIC_WIZARD_URL` or `NEXT_PUBLIC_API_BASE_URL` pointing at Render.

---

## Success criteria

| Criterion | Status |
|-----------|--------|
| Complete native wizard foundation | ✅ |
| No production behavior changes | ✅ — `/platform/customs` unchanged |
| No user-visible regressions | ✅ |
| Backend unchanged | ✅ |
| No iframe / postMessage in new code | ✅ |
| Ready for Phase 1.2 | ✅ |

---

## Next step: Phase 1.2

- Visual polish (trust section, loading animation, platform design parity)
- Optional dev preview route behind flag
- Side-by-side parity testing vs iframe wizard
- Then Phase 2: replace `WizardEmbed` in `PlatformWizardTool`
