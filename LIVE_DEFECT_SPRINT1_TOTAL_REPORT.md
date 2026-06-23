# Live Defect Sprint 1 Total Extraction Report

## Scope

Analyzed only invoice total extraction for:

- `21.pdf`
- `22.pdf`
- `26.pdf`

Dataset:

`C:\CURSOR\test_data\export-auditor-fixtures\invoices_to_inspect`

No changes were made to:

- OCR
- readiness
- HS logic
- exporter, consignee, destination, or incoterms logic

## Responsible Function

The invoice-total candidate selection happens in:

`app/modules/export_auditor/extraction.py`

Functions:

- `_recover_total_value_from_ocr_text()`
- `_recover_total_value_from_html_tables()`
- `_extract_money_token()`
- `_is_total_excluded_context()`

Before this sprint, `_recover_total_value_from_ocr_text()` effectively selected the first matching labeled money token after HTML table recovery. It did not score candidates across competing labels, so a weak/early candidate could beat a stronger invoice-total label, and plain `Total:` / `total cash:` labels were not recovered reliably.

## Implemented Fix

Implemented deterministic OCR-text total candidate ranking:

- Added `_total_candidate_score()`.
- Added `_rank_total_candidates()`.
- Updated `_recover_total_value_from_ocr_text()` to select the highest-ranked candidate instead of the first found token.
- Expanded exclusion context for identifier and non-invoice-total contexts:
  - IBAN / bank / Swift
  - VAT / tax
  - company capital / registration
  - HS / commodity / Taric codes
  - shipment units
  - net/gross weight
  - expenditure

Ranking priority:

- Highest: `Amount to be paid`, `Za plačilo`, `For payment`, `Due to pay`
- High: `Total invoice amount`, `Invoice total`, `Grand total`, `Total EUR`
- Medium: `Amount due`, `total cash`
- Lower but accepted: `Goods value`, `Total value`, `Total amount`
- Fallback: plain `Total:`

## Candidate Analysis

### `21.pdf`

Selected value:

- `12.550,00`

Candidate list:

| Candidate | Context | Decision |
| --- | --- | --- |
| `7.500,00` | `z višino ustanovnega kapitala 7.500,00 EUR` | rejected: company capital context |
| `12.550,00` | `Cena brez DDV-a: 12.550,00 EUR` | not selected directly: not a preferred invoice-total label |
| `12.550,00` | `Za plačilo EUR: 12.550,00 EUR` | selected: highest-priority payment-total label |
| `SI56 0287 8026 5955 781` | `Iban code` | rejected: IBAN/account identifier context |
| `SI87500850` | `ID za DDV` | rejected: VAT identifier context |

Why selected:

- `Za plačilo` is a direct payment-total label and receives the highest score.

Why correct total was previously at risk:

- The OCR page repeats many identifier and capital lines. Without explicit ranking/exclusion, registration/capital amounts can appear as plausible money tokens.

### `22.pdf`

Selected value after fix:

- `1.729,00`

Candidate list:

| Candidate | Context | Decision |
| --- | --- | --- |
| `0,00` | `Total Expenditure: 0,00` | rejected: expenditure context / zero value |
| `1.729,00` | `total Taxable: 1.729,00` | rejected: tax/taxable context |
| `0,00` | `total Tax: 0,00` | rejected: tax context / zero value |
| `1.729,00` | `Total: 1.729,00` | accepted: plain total fallback |
| `1.729,00` | `total cash: 1.729,00` | selected: stronger total-cash label |
| `NR. 1` | `TOTAL SHIPMENT UNITS: NR. 1` | rejected: shipment units context |
| `8422.4000` | `HS CODE 8422.4000` | rejected: HS code context |
| `810034603` | `VAT NUMBER` | rejected: VAT identifier context |
| `IT 67 W 02008...` | `IBAN` | rejected: bank/IBAN context |

Why selected:

- `total cash` is a stronger invoice-total label than plain `Total:`.
- Both `total cash` and `Total:` point to the same amount, `1.729,00`.

Why correct total was previously rejected:

- The old label scan did not reliably accept plain `Total:` or `total cash`.
- Nearby `total Taxable` / `total Tax` contexts were excluded correctly, but there was no later positive ranking pass to recover the actual invoice total.

### `26.pdf`

Selected value:

- `10,872.30`

Candidate list:

| Candidate | Context | Decision |
| --- | --- | --- |
| `515.00` | line item total | not a header total candidate |
| `1,439.00` | line item total | not a header total candidate |
| `85235110` | commodity/HS code | rejected: commodity/HS context |
| `10,872.30` | `Goods value : 10,872.30` | accepted: goods-value candidate |
| `0.00` | `VAT (niet EU 0%) : 0.00` | rejected: VAT/zero context |
| `10,872.30` | `Total EUR : 10,872.30` | selected: stronger total label |
| `NL49 ABNA 0101 8027 30` | `IBAN (EUR)` | rejected: bank/IBAN context |
| `NL74 ABNA 0101 8027 65` | `IBAN (USD)` | rejected: bank/IBAN context |

Why selected:

- `Total EUR` has stronger ranking than `Goods value`.
- Both accepted candidates point to the same amount.

Why correct total was previously at risk:

- The OCR contains commodity codes, line totals, VAT values, and IBANs near the invoice total block. The fix prevents identifier contexts from entering the ranked candidate list.

## Validation

Backend extraction tests:

- Command: `python -m pytest tests/test_extraction.py`
- Result: `44 passed`

Production defect fixes:

- Command: `npm run test:production-defect-fixes`
- Result: `53 passed, 0 failed`

Live corpus validation, `20.pdf` through `26.pdf`:

| Invoice | Total after fix | Numeric |
| --- | ---: | ---: |
| `20.pdf` | `5.750,16` | `5750.16` |
| `21.pdf` | `12.550,00` | `12550` |
| `22.pdf` | `1.729,00` | `1729` |
| `23.pdf` | `12.197,94` | `12197.94` |
| `24.pdf` | `12.197,94` | `12197.94` |
| `25.pdf` | `2.620,08` | `2620.08` |
| `26.pdf` | `10,872.30` | `10872.3` |

## Outcome

The deterministic ranking fix recovered the missing total for `22.pdf` and preserved correct totals for `20.pdf`, `21.pdf`, `23.pdf`, `24.pdf`, `25.pdf`, and `26.pdf`.

No OCR, readiness, or HS behavior was changed.
