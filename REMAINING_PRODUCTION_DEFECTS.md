# Remaining Production Defects — Forensic Review

Date: 2026-06-13  
Scope: Five latest validation reports (AS2026-1069, HENN, Häfele, Klintek, completeness calibration)

## Summary

| Report | Root cause | Fix | Test | Before → After |
|--------|------------|-----|------|----------------|
| AS2026-1069 | Structured parser returned empty fields; OCR text contained full invoice; completeness scored 0% on empty `items[]`; `PARSER_MAPPING_FAILURE` blocked readiness | English OCR field recovery (`english-invoice-field-extractor.ts`); header+line completeness model; suppress parser failure when recovery succeeds | `test:production-defect-fixes` §1 | Completeness **0%**, blocked → **≥80%**, fields populated |
| HENN | API emitted legacy `EUR1_RECOMMENDED` / `NO_AUTHORISED_EXPORTER`; lines stayed NOT_DECLARED despite AT/920/038 + origin block | Auth+declaration → line YES; filter superseded issues when `evidenceStatus=DECLARED` | §2 | UNVERIFIED + stale warnings → **DECLARED**, issues removed |
| Häfele | Blanket `all_products_preferential` overrode position-specific lists | Disable `blanketAllYes` when `explicitYes` positions exist | §3 | All lines YES → **only listed positions YES**, others **UNKNOWN** |
| Klintek | Line net sum entered shipment summary before hierarchy; treated as document weight | Document-only net in `extractShipmentSummary`; hierarchy rejects CALCULATED when document gross exists | §4 | Line sum could override **1574 kg** gross → **1574 kg** authoritative |
| Completeness | COO weighted 20% on lines-only score; empty items → 0% | Header 60% + lines 40%; COO weight 10%; header-only fallback | §5 | Missing COO dragged score below 80 → **≥80%** with major fields |

---

## 1. AS2026-1069 — Parser failure with valid OCR

### Root cause
- Mistral OCR returned rich text (Invoice #, Buyer, Recipient, Pos table, totals).
- Upstream structured parser mapped nothing → `items.length === 0`.
- `computeOcrQualityScore` returned **0%** (no line denominator).
- `PARSER_MAPPING_FAILURE` flag set unconditionally → **CUSTOMS_BLOCKED**.

### Fix
- **`english-invoice-field-extractor.ts`**: recover `invoice_number`, `exporter`, `consignee`, `total_value`, line items from English labels (`Invoice #`, `Buyer`, `Recipient`, `Total invoice amount`, `Amount to be paid`, `Pos Description`).
- **`document-enrichment.ts`**: run English recovery before crosscheck; only set `PARSER_MAPPING_FAILURE` when recovery fails.
- **`ocr-observability.ts`**: `computeDataExtractionCompleteness` — header score (60%) + line score (40%).

### Regression test
```bash
npm run test:production-defect-fixes
```
Assertions: invoice `AS2026-1069`, 2 lines, completeness ≥ 80%, no parser failure flag.

### Before / After
| Metric | Before | After |
|--------|--------|-------|
| Invoice number | — | AS2026-1069 |
| Items extracted | 0 | 2 |
| Data extraction completeness | 0% | ≥ 80% |
| Customs readiness | BLOCKED (parser) | REVIEW/READY (data present) |

---

## 2. HENN — Preferential origin (AT/920/038)

### Root cause
- Authorised exporter `AT/920/038` and EU origin declaration present in OCR.
- Legacy audit API still attached `EUR1_RECOMMENDED` and `NO_AUTHORISED_EXPORTER`.
- Line engine treated auth ref alone as NOT_DECLARED; `except where otherwise indicated` blocked blanket YES.

### Fix
- **`preferential-origin-engine.ts`**: auth + origin declaration → **YES** / `authorised_exporter_statement` when no position-specific list.
- **`issue-readiness.ts`**: `filterSupersededPreferentialAuditIssues` removes legacy codes when `evidenceStatus === DECLARED`.
- **`preferential-origin-decision-engine.ts`**: auth + declaration → **DECLARED** (unchanged, now aligned with lines).

### Regression test
§2 in `test:production-defect-fixes` — DECLARED, all lines YES, EUR1/NO_AUTHORISED issues filtered.

### Before / After
| Metric | Before | After |
|--------|--------|-------|
| evidenceStatus | UNVERIFIED / NOT_DECLARED | **DECLARED** |
| Line preferential | NOT_DECLARED | **YES** |
| EUR1_RECOMMENDED issue | Present | **Removed** |
| NO_AUTHORISED_EXPORTER | Present | **Removed** |

---

## 3. Häfele — Position-specific preferential origin

### Root cause
- Invoice declared preferential origin for **specific positions only**.
- Broad `all_products_preferential` regex matched footer boilerplate → `blanketAllYes=true` → all lines YES.

### Fix
- **`preferential-origin-engine.ts`**: if `explicitYes.size > 0`, force `blanketAllYes = false`.
- Unlisted positions remain **UNKNOWN** (or NOT_DECLARED without COO).

### Regression test
§3 — positions 1 & 3 YES; 2 & 4 UNKNOWN.

### Before / After
| Position | Before | After |
|----------|--------|-------|
| 1, 3 (listed) | YES | **YES** |
| 2, 4 (unlisted) | YES | **UNKNOWN** |

---

## 4. Klintek — Weight hierarchy (1574 kg gross)

### Root cause
- `extractShipmentSummary` called `extractNetWeight(corpus, items)` — line net sum (500 kg) populated summary before hierarchy.
- `resolveWeightHierarchy` treated any existing net as document priority.
- Document gross **1574 kg** could be inconsistent with aggregated line nets in UI/export.

### Fix
- **`shipment-summary-extractor.ts`**: use `extractNetWeightFromDocument` only in summary extraction (never line sum).
- **`weight-extraction-hierarchy.ts`**: ignore `net_weight_source === CALCULATED` as document; replace calculated net when document gross exists.
- **`map-api-response.ts`**: prefer enriched invoice shipment weights over stale audit API values.

### Regression test
§4 — gross stays 1574; line sum 500 not used as document net.

### Before / After
| Field | Before | After |
|-------|--------|-------|
| Gross weight | 1574 kg (or inconsistent) | **1574 kg** |
| Net weight source | CALCULATED (500) | **DOCUMENT / OCR** |
| Line net sum | Could override totals | **Informational only** |

---

## 5. Extraction completeness calibration

### Root cause
- Single line-level formula: 30% lines + 30% HS + **20% COO** + 20% totals.
- Missing COO on all lines penalized ~20 points even when header/shipment complete.
- Zero items → 0% regardless of OCR text quality.

### Fix
- **`ocr-observability.ts`**:
  - Header fields (invoice #, parties, value, destination, shipment): up to 100 points.
  - Line coverage: 45% desc + 25% HS + **10% COO** + 20% totals.
  - Combined: `header * 0.6 + lines * 0.4`; header-only when no items.

### Regression test
§5 — invoice with HS + lines but no COO scores ≥ 80%.

### Before / After
| Scenario | Before | After |
|----------|--------|-------|
| Full header, 2 lines, no COO | ~64–72% | **≥ 80%** |
| Empty items, OCR recovery | 0% | **~60–100%** (header-driven) |

---

## Commands

```bash
npm run test:production-defect-fixes
npm run test:golden-customs-workflow
npx next build
```

## Key files

```
src/lib/export-auditor/english-invoice-field-extractor.ts   (NEW)
src/lib/export-auditor/ocr-observability.ts
src/lib/export-auditor/document-enrichment.ts
src/lib/export-auditor/preferential-origin-engine.ts
src/lib/export-auditor/issue-readiness.ts
src/lib/export-auditor/weight-extraction-hierarchy.ts
src/lib/export-auditor/shipment-summary-extractor.ts
src/lib/export-auditor/map-api-response.ts
scripts/test-production-defect-fixes.ts                   (NEW)
```
