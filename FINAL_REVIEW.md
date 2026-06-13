# Export Auditor — Customs Workflow Redesign (Final Review)

Date: 2026-06-13

## Implemented Fixes

### 1. OCR metrics redesign
- **OCR Confidence** — `confidence.ocrQuality` (OCR engine success / fallback penalty)
- **Data Extraction Completeness** — `ocrObservability.dataExtractionCompleteness` / `ocrQualityScore` (line/HS/COO/total field coverage; not an OCR failure signal)
- **Customs Readiness** — `customsReadiness.status`: `CUSTOMS_READY` | `CUSTOMS_REVIEW` | `CUSTOMS_BLOCKED`

Updated: `ConfidenceScoreSection.tsx`, `OcrObservabilitySection.tsx`, `validation-pdf-export.ts`, `ExecutiveSummaryCard.tsx`, `types.ts`.

### 2. Weight extraction hierarchy
- New `weight-extraction-hierarchy.ts` — priority: document net → document gross → aggregated line items (fallback only)
- Document-level values are never overwritten by calculated totals
- Source tracking: `DOCUMENT` | `CALCULATED` | `OCR_TABLE` | `OCR_TEXT` on `ShipmentSummary`
- Integrated in `shipment-summary-extractor.ts` (`enrichInvoiceShipmentData`) and mapped in `map-api-response.ts`

### 3. Preferential origin workflow
- New `PreferentialOriginEvidenceStatus`: `DECLARED` | `NOT_DECLARED` | `UNVERIFIED`
- Rewrote `preferential-origin-decision-engine.ts` — `eur1Recommended` deprecated (always `false`)
- PEM rules:
  - ≤ EUR 6000 + declaration → `DECLARED`; no declaration → `NOT_DECLARED`
  - > EUR 6000 + declaration + auth ref → `DECLARED`
  - > EUR 6000 + declaration without auth → `UNVERIFIED`
  - No declaration → `NOT_DECLARED` with LTSD/EUR.1 verification message
- EUR.1 never auto-recommended/rejected from invoice data alone
- `PreferenceOriginSection.tsx` — removed EUR.1 row; shows evidence status badge

### 4. Customs Readiness engine
- New `customs-readiness-engine.ts`
- `CUSTOMS_BLOCKED`: missing exporter/consignee/invoice number/value, OCR failure, invalid destination
- `CUSTOMS_REVIEW`: missing HS, gross weight, package count, incoterms, preferential `UNVERIFIED`
- `CUSTOMS_READY`: required declaration data available
- Wired into `map-api-response.ts` → `ExportAuditReport.customsReadiness`

### 5. Severity classification
- `issue-readiness.ts`: `resolveIssueSeverity()` → `CRITICAL` | `WARNING` | `INFO`
- Applied on all mapped issues via `applyIssueSeverity()`
- CRITICAL: foundation fields, destination, OCR failure
- WARNING: HS, gross weight, packages, incoterms
- INFO: origin declaration, LTSD, proforma

### 6. HS aggregation exports
- `mrn-export.ts` — simplified HS group columns: HS Code, Description, Quantity, Value, Country of Origin, Source Positions
- Extended columns retained as `MRN_EXPORT_EXTENDED_COLUMNS` for legacy reference

### 7. Declaration Readiness Check
- New `declaration-readiness-check.ts` — validates SAD boxes 8, 14, 15, 17a, 18, 31, 33, 34, 38, 44
- New `DeclarationReadinessSection.tsx` — `READY FOR DECLARATION` or `REVIEW REQUIRED` with missing field list
- Added to `ExportAuditorResultsDashboard.tsx` (overview + enterprise tabs)

### 8. Golden regression suite
- `scripts/test-golden-customs-workflow.ts`
- npm script: `test:golden-customs-workflow`

## Business Logic Changes

| Area | Before | After |
|------|--------|-------|
| OCR “Quality” in UI | Single score mixing OCR + completeness | Three distinct metrics |
| Net weight | Line items could override document totals | Document-first hierarchy |
| EUR.1 | Auto-recommended above EUR 6000 | Never auto-recommended; evidence status only |
| Customs status | Readiness score only | Explicit `CUSTOMS_*` tri-state |
| Issues | type error/warning/info only | Normalized `severity` field |
| HS Excel/CSV | 11 columns per row | 6 focused aggregation columns |

## Remaining Risks

1. **Declaration box 18 (transport)** — proxied from incoterms when transport identity absent on invoice; may show false-ready on incomplete logistics data.
2. **Box 44 (additional documents)** — satisfied by VAT article or origin text; does not validate actual certificate attachments.
3. **UK/REX schemes** — mapped to `DECLARED`/`NOT_DECLARED` only; no `UNVERIFIED` path for high-value PEM-style gaps.
4. **Customs Readiness vs Export Readiness** — two parallel verdicts; operators must understand both scores.
5. **Legacy tests** — golden invoice PDF paths remain environment-dependent (`GOLDEN_PDF_*` env vars).

## Future Improvements

- Map real transport identity (box 18) from packing list / CMR when detected
- Attach declaration readiness to MRN export footer and validation PDF
- Per-box confidence scores for declaration readiness
- Admin-configurable EUR 6000 threshold by destination scheme
- Wire `UNVERIFIED` origin into automated broker task queue
- Expand `test:golden-customs-workflow` to invoke all existing golden PDF fixtures when paths available

## Declaration Readiness Roadmap

1. **Phase 1 (done)** — Static box checklist from mapped invoice/report fields
2. **Phase 2** — Cross-field validation (value vs line totals, weight vs packages)
3. **Phase 3** — Country-specific mandatory documents (EUR.1, LTSD, REX) as box 44 sub-checks without auto-recommendation
4. **Phase 4** — Pre-submission export to national customs XML (SLO/CRO) with readiness gate
