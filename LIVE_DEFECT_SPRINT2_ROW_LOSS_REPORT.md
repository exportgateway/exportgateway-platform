# Live Defect Sprint 2 Row Loss Report

## Scope

Analyzed only:

- `23.pdf`
- `24.pdf`

Dataset:

`C:\CURSOR\test_data\export-auditor-fixtures\invoices_to_inspect`

No changes were made to:

- invoice total extraction
- readiness
- HS logic
- origin logic
- OCR

## Observed Defect

The source invoice contains 6 commercial rows.

Backend OCR normalization returned 6 rows, but Export Auditor final mapping showed only 2 rows. The 2 rows were not commercial invoice rows; they were pallet/dimension rows reconstructed from packing text.

## Root Cause

First loss function:

`src/lib/export-auditor/english-invoice-field-extractor.ts`

Function:

`shouldRecoverLineItemsFromTable()`

Call path:

`enrichInvoiceDocument()`
→ `enrichEnglishInvoiceFieldsFromOcr()`
→ `shouldRecoverLineItemsFromTable()`
→ `extractEnglishLineItemsWithDiagnostics()`
→ table reconstruction accepted
→ `items` overwritten

The guard allowed OCR table reconstruction to run even when the parser already had 6 rows and table reconstruction found only 2 rows. Those 2 rows came from packing/pallet text, so `enrichEnglishInvoiceFieldsFromOcr()` overwrote the valid 6 backend rows with 2 reconstructed pallet rows.

## Count Trace Before Fix

### `23.pdf`

| Stage | Count | Result |
| --- | ---: | --- |
| Source commercial rows | `6` | Invoice has 6 product rows |
| OCR captured rows | `6` | OCR/backend output contained 6 commercial rows |
| HTML table parser captured | `6` | Backend `_recover_items_from_html_tables()` returned 6 rows |
| Normalization kept | `6` | Backend normalized invoice returned 6 items |
| Recovery filter removed | `0` | Backend confidence/dedupe filters preserved all 6 |
| Platform table reconstruction | `2` | English fallback reconstructed 2 pallet rows |
| Final mapper count | `2` | Final report used overwritten 2-row list |

### `24.pdf`

| Stage | Count | Result |
| --- | ---: | --- |
| Source commercial rows | `6` | Same duplicated invoice/PDF content as `23.pdf` |
| OCR captured rows | `6` | OCR/backend output contained 6 commercial rows |
| HTML table parser captured | `6` | Backend `_recover_items_from_html_tables()` returned 6 rows |
| Normalization kept | `6` | Backend normalized invoice returned 6 items |
| Recovery filter removed | `0` | Backend confidence/dedupe filters preserved all 6 |
| Platform table reconstruction | `2` | English fallback reconstructed 2 pallet rows |
| Final mapper count | `2` | Final report used overwritten 2-row list |

## Row-Level Trace

For each of the 6 source rows in both `23.pdf` and `24.pdf`:

| Row | OCR captured? | HTML table parser captured? | Normalization kept? | Recovery filter removed? | Final mapper removed before fix? |
| ---: | --- | --- | --- | --- | --- |
| 1 | yes | yes | yes | no | yes |
| 2 | yes | yes | yes | no | yes |
| 3 | yes | yes | yes | no | yes |
| 4 | yes | yes | yes | no | yes |
| 5 | yes | yes | yes | no | yes |
| 6 | yes | yes | yes | no | yes |

The rows were not lost in OCR, backend HTML parsing, backend normalization, or backend recovery filtering. They were lost when platform OCR table reconstruction overwrote the already-valid parser rows.

## Implemented Fix

Changed only:

`src/lib/export-auditor/english-invoice-field-extractor.ts`

Before:

- Table reconstruction could run when reconstructed positions were outside parser positions, even if reconstructed row count was lower than existing parser row count.

After:

- If parser/backend already has items, table reconstruction is allowed only when recovered row count is greater than the current item count.
- Lower-count or equal-count reconstruction cannot overwrite existing parser rows.

This preserves the intended purpose of table reconstruction: fill missing rows, not replace a better structured parser result with fewer rows.

## Regression Test

Updated:

`scripts/test-production-defect-fixes.ts`

Added:

- AZ Jordan regression where 6 parser rows coexist with OCR text that reconstructs only 2 pallet rows.
- Assertion that `shouldRecoverLineItemsFromTable()` returns false.
- Assertion that `enrichEnglishInvoiceFieldsFromOcr()` preserves 6 rows.

## Validation

Production defect fixes:

- Command: `npm run test:production-defect-fixes`
- Result: `55 passed, 0 failed`

Live corpus validation:

| Invoice | Backend row count | Normalized/enriched row count | Commercial row count | Countable row count | Final report row count |
| --- | ---: | ---: | ---: | ---: | ---: |
| `23.pdf` | `6` | `6` | `6` | `6` | `6` |
| `24.pdf` | `6` | `6` | `6` | `6` | `6` |

Linter diagnostics:

- No linter errors on edited files.

## Outcome

The first row loss occurred in `shouldRecoverLineItemsFromTable()` / `enrichEnglishInvoiceFieldsFromOcr()`.

The smallest deterministic fix preserves the 6 backend commercial rows and prevents lower-count table reconstruction from replacing them.

No readiness, invoice-total, HS, origin, or OCR behavior was changed.
