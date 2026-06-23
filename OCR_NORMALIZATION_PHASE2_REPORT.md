# OCR Normalization Phase 2 Report

## Scope

Phase 2 continued the OCR-to-normalization recovery work only.

Modified backend files:

- `C:\CURSOR\export-auditor-repo\app\modules\export_auditor\extraction.py`
- `C:\CURSOR\export-auditor-repo\tests\test_extraction.py`

No changes were made to readiness logic, HS logic, BTI logic, Golden expectations, or UI logic.

## Before

Phase 1 corpus result for `C:\CURSOR\test_data\export-auditor-fixtures\invoices_to_inspect`:

- Totals recovered: `10/26`
- Items recovered: `3/26`

Phase 1 invoices with line items:

- `1.pdf`
- `6.pdf`
- `25.pdf`

## Failure Clustering

The remaining failed invoices were clustered by OCR layout.

### Cluster 1: Flexible Multilingual HTML Product Tables

Frequency: `7` invoices.

Affected invoices:

- `4.pdf`
- `7.pdf`
- `14.pdf`
- `15.pdf`
- `20.pdf`
- `23.pdf`
- `24.pdf`

Table structures:

- Slovenian product table: `St. | Opis | Količina | Enota | Cena brez DDV | ... | Skupaj`
- AS2026 HTML table: `Pos | Description | Barcode | Quantity MU | Price w/o VAT | ... | Amount with VAT`
- Meditrade table: `Ref. number | Description | Country of origin | Qty. | Unit price | ... | Total price`
- German table: `Chiffre | Dienstleistung | Menge | Einheit | Preis | ... | Betrag netto`
- AZ Jordan table: `Item | Item name | Qty | UM | Price | ... | Value`

Why recovery failed:

- `_looks_like_generic_product_table()` only recognized narrow English headers.
- `_parse_generic_html_row()` required numeric item positions and did not support reference-number/code columns.
- Four-decimal OCR monetary formats such as `2.622.0000` and `409,5000` were not safe as normalized line totals.
- HTML summary totals with discount/VAT columns were skipped because row-level exclusion rejected the full row.

### Cluster 2: Plain Text Total Labels Without Recoverable Rows

Frequency: `8` invoices.

Affected invoices:

- `3.pdf`
- `9.pdf`
- `10.pdf`
- `16.pdf`
- `19.pdf`
- `21.pdf`
- `22.pdf`
- `26.pdf`

OCR patterns:

- `Total EUR: ...`
- `For payment EUR ...`
- `Za plačilo EUR ...`
- `Total: ...`

Why row recovery failed:

- These OCR outputs either had no parseable product rows or used non-HTML pipe/free-text row layouts outside the selected Phase 2 pattern.

### Cluster 3: No Clear OCR Total Or Row Structure

Frequency: `5` invoices.

Affected invoices:

- `8.pdf`
- `12.pdf`
- `17.pdf`
- `18.pdf`
- `22.pdf`

Why recovery failed:

- OCR text did not expose a reliable high-confidence row layout for deterministic parsing.
- Some monetary candidates were weights, capital amounts, or other non-invoice values.

## Selected Pattern

Implemented only Cluster 1: flexible multilingual HTML product tables.

Changes:

- Broadened generic HTML table detection to recognize multilingual headers:
  - `St.`, `Opis`, `Količina`, `Skupaj`
  - `Quantity MU`, `Amount with VAT`
  - `Ref. number`, `Country of origin`, `Qty.`, `Total price`
  - `Chiffre`, `Dienstleistung`, `Menge`, `Betrag netto`
  - `Item name`, `Value`
- Broadened HTML row extraction for item code, quantity, unit price, line total, HS/Taric/CN/TS code, and country of origin.
- Added safe normalization for four-decimal OCR monetary forms in recovered HTML rows.
- Added structured HTML summary total recovery for `Total invoice amount`, `Amount to be paid`, `For payment`, `Za plačilo`, and `Zu bezahlen`.

## After

Phase 2 corpus result:

- Totals recovered: `21/26`
- Items recovered: `9/26`

Coverage improvement:

- Totals: `10/26` → `21/26` (`+11`)
- Items: `3/26` → `9/26` (`+6`)

## Exact Invoices Improved

New totals recovered in Phase 2:

- `3.pdf`: `6417.33`
- `7.pdf`: `20820.10`
- `9.pdf`: `4507.22`
- `10.pdf`: `12051.72`
- `16.pdf`: `29953.57`
- `19.pdf`: `50956.50`
- `20.pdf`: `5750.16`
- `21.pdf`: `12550.00`
- `23.pdf`: `12197.94`
- `24.pdf`: `12197.94`
- `26.pdf`: `10872.30`

New line items recovered in Phase 2:

- `4.pdf`: `2` items
- `7.pdf`: `3` items
- `15.pdf`: `8` items
- `20.pdf`: `3` items
- `23.pdf`: `6` items
- `24.pdf`: `6` items

Phase 1 retained:

- `1.pdf`: `1` item, total `13470.30`
- `6.pdf`: `3` items, total `21790.30`
- `25.pdf`: `5` items, total `2620.08`

## Remaining Failures

Still no recovered total:

- `8.pdf`
- `12.pdf`
- `17.pdf`
- `18.pdf`
- `22.pdf`

Still no recovered line items:

- `2.pdf`
- `3.pdf`
- `5.pdf`
- `8.pdf`
- `9.pdf`
- `10.pdf`
- `11.pdf`
- `12.pdf`
- `13.pdf`
- `14.pdf`
- `16.pdf`
- `17.pdf`
- `18.pdf`
- `19.pdf`
- `21.pdf`
- `22.pdf`
- `26.pdf`

Notable next clusters:

- Pipe/free-text tables such as `Item Code MPN | Description Commodity code | COO. | Quantity | Price | Total` (`26.pdf`).
- Fashion/apparel pipe tables such as `Style | Style Description | Color | Unit Price | Quantity | Net Amount` (`11.pdf`).
- Plain-text invoice totals without stable product rows.

## Validation

Backend tests:

- `python -m pytest tests/test_extraction.py -q`: `23 passed`
- `python -m pytest -q`: `95 passed`, `1 warning`

Lints:

- No IDE linter errors reported for the edited backend files.

Bulk rerun:

- Endpoint: local patched backend `http://127.0.0.1:8011/export-auditor/ocr`
- Corpus: `C:\CURSOR\test_data\export-auditor-fixtures\invoices_to_inspect`
- Processed: `26/26`

## Commit Decision

Commit gate status:

- No regression in recovered Phase 1 invoices: satisfied.
- Recovered coverage improves: satisfied.
- Backend tests remain green: satisfied.

The technical commit gate is satisfied for the backend repo. The platform repo has many pre-existing unrelated changes, so only the Phase 2 report should be staged there if a commit is requested.
