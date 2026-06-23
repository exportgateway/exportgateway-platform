# LIVE DEFECT SPRINT 7 IMPLEMENTATION REPORT

## Scope

Implemented only Sprint 6 Cluster A and Cluster B recovery:

- Cluster A: pipe tables with item-code-first rows and multi-line continuation rows.
- Cluster B: clean item-code-first rows from tabular OCR text.

Target invoices:

- `2.pdf`
- `11.pdf`
- `26.pdf`

No readiness, total validation, HS wizard, BTI, exporter, consignee, destination, or invoice-number logic was changed.

## Root Cause

The existing OCR row recovery accepted only rows beginning with numeric positions or already-supported product-table shapes. The three target invoices had commercial rows that started with item codes:

- `2.pdf`: tabular OCR rows normalized into space-separated text, with product code first.
- `11.pdf`: pipe-delimited apparel rows starting with `Style`, followed by continuation rows such as `Origin - Italy | HS Code - 61091000`.
- `26.pdf`: pipe-delimited `Item Code MPN` rows with commodity codes in the description cell, plus a page-2 continuation row containing `85235110 CN`.

## Implemented Fix

Backend files changed:

- `app/modules/export_auditor/extraction.py`
  - Added strict header-gated OCR table recovery for item-code-first tab/space rows.
  - Added strict header-gated OCR table recovery for pipe item-code-first rows.
  - Added continuation enrichment for HS, commodity code, COO, and origin details.
  - Preserved the active table header across page/footer gaps without parsing footer, address, bank, or summary lines.
  - Added origin normalization for `Bulgaria` and `Portugal`.

- `tests/test_extraction.py`
  - Added Sprint 7 regressions for tab item-code-first rows.
  - Added Sprint 7 regressions for apparel pipe rows with continuation HS/COO.
  - Added Sprint 7 regressions for `Item Code MPN` pipe rows with continuation commodity/COO.

## Live Target Results

Local backend endpoint:

- `POST http://127.0.0.1:8011/export-auditor/ocr`

| Invoice | Recovered Lines | HS Count | COO Count | Notes |
| --- | ---: | ---: | ---: | --- |
| `2.pdf` | 11 | 10 | 10 | Recovered item-code-first commercial rows; one service row has no HS/COO evidence. |
| `11.pdf` | 9 | 4 | 4 | Recovered style rows and continuation `Origin` / `HS Code` rows where present. |
| `26.pdf` | 10 | 10 | 1 | Recovered page-1 rows plus page-2 row and `CN` continuation evidence. |

## Full Corpus Rerun

Dataset:

- `C:\CURSOR\test_data\export-auditor-fixtures\invoices_to_inspect`
- Numeric PDFs `1.pdf` through `26.pdf`

Fresh local backend rerun after restart:

- Files processed: `26`
- Files with line items: `14`
- Files with at least one HS-coded line: `11`
- Files with at least one COO-coded line: `8`
- Total recovered line items: `114`
- Total HS-coded lines: `90`
- Total COO-coded lines: `40`

Immediate prior backend corpus baseline from Sprint 5:

- Total recovered line items: `84`
- Total HS-coded lines: `66`
- Total COO-coded lines: `25`
- Documents with at least one COO-coded line: `5`

Net corpus improvement:

- `+30` recovered line items.
- `+24` HS-coded lines.
- `+15` COO-coded lines.
- `+3` documents with recovered lines: `2.pdf`, `11.pdf`, `26.pdf`.
- `+3` documents with at least one COO-coded line: `2.pdf`, `11.pdf`, `26.pdf`.

Regression check against previously recovered backend invoices:

- Previously recovered backend line corpus remained at `84` lines when excluding the three Sprint 7 targets.
- Previously recovered COO-backed invoices `1.pdf`, `15.pdf`, `23.pdf`, `24.pdf`, and `25.pdf` remained recovered.
- No previously recovered backend invoice lost line count in the Sprint 7 full rerun baseline comparison.

Note: direct primary OCR for `3.pdf` still returns zero backend rows in the current local run; this was not changed by Sprint 7 and is outside Cluster A/B. It remains a separate residual issue because `3.pdf` was not part of the immediate backend baseline used for this sprint.

## Validation

Backend unit tests:

- `python -m pytest tests/test_extraction.py`
- Result: `50 passed`

Platform regression tests:

- `npm run test:production-defect-fixes`
- Result: `57 passed, 0 failed`

Live target rerun:

- `2.pdf`: `11` lines, `10` HS, `10` COO.
- `11.pdf`: `9` lines, `4` HS, `4` COO.
- `26.pdf`: `10` lines, `10` HS, `1` COO.

Full corpus rerun:

- Result improved from `84` to `114` backend recovered line items with no baseline loss.

Linter check:

- No linter errors reported for touched backend files.

## Final Determination

Sprint 7 met the commit conditions:

- No validation regressions.
- Full-corpus backend coverage improved.
- Previously recovered backend rows were preserved.
- All required validations passed.
