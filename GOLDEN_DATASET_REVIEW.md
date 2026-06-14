# Golden Dataset Review

Generated: 2026-06-14T10:09:05.501Z

## Summary

| Metric | Value |
|--------|-------|
| Total invoices | 22 |
| Passed | 21 |
| Failed | 1 |
| **Pass rate** | **95.5%** |
| **Failure rate** | **4.5%** |
| Avg extraction accuracy | 99.8% |
| Customs readiness accuracy | 100.0% |
| **Production readiness** | **98.1%** |
| Critical anomalies | 0 |

## Targets

| Target | Status |
|--------|--------|
| 95%+ extraction accuracy | ✓ MET (99.8%) |
| 95%+ customs readiness accuracy | ✓ MET (100.0%) |
| Zero critical customs contradictions | ✓ MET |

## Field Failure Counts

- dataExtractionCompleteness: 1

## Fix Recommendations

- No recurring defects — dataset stable.

## Per-Invoice Results

| Invoice | Status | Extraction | Customs match | Issues |
|---------|--------|------------|---------------|--------|
| as2026-1069 | PASS | 100.0% | ✓ | 0 |
| complete-no-coo | PASS | 100.0% | ✓ | 0 |
| denkirs-2026-156 | PASS | 100.0% | ✓ | 0 |
| elcar-70399 | FAIL | 94.7% | ✓ | 1 |
| fa26022525 | PASS | 100.0% | ✓ | 0 |
| gomline-i26-0515 | PASS | 100.0% | ✓ | 0 |
| gw-001 | PASS | 100.0% | ✓ | 0 |
| hafele-hf001 | PASS | 100.0% | ✓ | 0 |
| henn-001 | PASS | 100.0% | ✓ | 0 |
| high-value-unverified | PASS | 100.0% | ✓ | 0 |
| hs-discrepancy-94 | PASS | 100.0% | ✓ | 0 |
| hs-verified-73072980 | PASS | 100.0% | ✓ | 0 |
| klintek-weight | PASS | 100.0% | ✓ | 0 |
| low-value-declared | PASS | 100.0% | ✓ | 0 |
| mix-001 | PASS | 100.0% | ✓ | 0 |
| pgp-2600246 | PASS | 100.0% | ✓ | 0 |
| pro-2026-01 | PASS | 100.0% | ✓ | 0 |
| reni-26-381-000014 | PASS | 100.0% | ✓ | 0 |
| transpak-a0054-2026 | PASS | 100.0% | ✓ | 0 |
| unior-2602002968 | PASS | 100.0% | ✓ | 0 |
| weight-hierarchy-ref | PASS | 100.0% | ✓ | 0 |
| wizard-hs-wiz001 | PASS | 100.0% | ✓ | 0 |

## Failure Details

### elcar-70399 — EL-CAR 70399 → Kosovo

- `dataExtractionCompleteness`: expected `98` → actual `94`

## Architecture

```
golden-invoices/{id}/
  invoice.pdf              ← source PDF (external or local)
  validation-report.pdf    ← exported validation PDF
  invoice-source.json      ← OCR / normalized invoice payload
  expected-results.json    ← captured golden expectations
```

Run: `npm run test:golden-dataset`
Bootstrap: `npm run golden-dataset:bootstrap`
Add invoice: `npm run golden-dataset:add -- <id>`