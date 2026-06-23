# LIVE DEFECT SPRINT 8 ROI REPORT

## Scope

Analyzed only:

- `14.pdf`
- `21.pdf`
- `22.pdf`

Goal: determine whether deterministic, evidence-backed, low-risk parsers can safely recover commercial rows.

Implemented only one low-risk fix:

- `14.pdf`: HTML product table with combined `Country of Qty.` column.

No speculative inference was implemented for `21.pdf` or `22.pdf`.

## Per-Invoice Analysis

### `14.pdf`

Exact OCR evidence:

```text
<table><tr><th>Ref. number</th><th>Description</th><th>Country of Qty.</th><th>Unit price</th><th>Disc.%</th><th>Total price</th></tr>
<tr><td>DELIVERY NOTE</td><td>2026-ODM-43</td><td></td><td></td><td></td><td></td></tr>
<tr><td>6844467</td><td>Vitros TSH 3 - Calibrator<br/>Oproščeno DDV po 52/1/a ZDDV-1</td><td>XU 1,00 box</td><td>90,2480</td><td>0,00</td><td>90,25</td></tr>
<tr><td>8389793</td><td>Vitros ECI Wash buffer<br/>Oproščeno DDV po 52/1/a ZDDV-1</td><td>XU 25,00 box</td><td>53,2125</td><td>0,00</td><td>1.330,31</td></tr>
<tr><td>1250232</td><td>Dessicant packs / 2 x 10<br/>Oproščeno DDV po 52/1/a ZDDV-1</td><td>US 30,00 box</td><td>24,0000</td><td>0,00</td><td>720,00</td></tr>
<tr><td>6801715</td><td>Versa Tip / 1000 pcs<br/>Oproščeno DDV po 52/1/a ZDDV-1</td><td>US 960,00 box</td><td>32,8525</td><td>0,00</td><td>31.538,40</td></tr>
<tr><td>6801892</td><td>FS Humidification packs<br/>Oproščeno DDV po 52/1/a ZDDV-1</td><td>US 30,00 box</td><td>103,1900</td><td>0,00</td><td>3.095,70</td></tr>
```

First disappearance:

- `_recover_items_from_html_tables()` identifies the HTML table.
- `_looks_like_generic_product_table()` rejected the table because `Country of Qty.` was not accepted as a quantity-bearing column.
- `_parse_generic_html_row()` had no logic to split `Country of Qty.` into optional COO plus quantity/unit.

Recovery estimate before implementation:

- Rows: `5`
- HS: `0`, because no HS evidence exists in the OCR table.
- COO: up to `3`, only for valid ISO code `US`; `XU` is not an accepted country code and was intentionally not normalized.
- Regression risk: low to moderate. The parser is gated by HTML product-table headers and still rejects delivery-note/total rows.

Implemented:

- Accepted `Country of Qty.` as a generic HTML quantity column.
- Parsed cells like `US 30,00 box` into `country_of_origin=US` and `quantity=30,00 box`.
- Left invalid origin-like tokens such as `XU` blank.

Live result:

- Rows: `5`
- HS: `0`
- COO: `3`

### `21.pdf`

Exact OCR evidence:

```text
TOVORNO VOZILO
IVECO EUROCARGO 180E28
Št. Šasije: ZCFA61TMX02647669
Leto: 2016
Prevoženih kilometrov: 573.272 km
Moč motorja: 206 kw
Delovna prostornina: 6.728 cm³
Barva: Bela
Cena brez DDV-a: 12.550,00 EUR
Za plačilo EUR: 12.550,00 EUR
```

First disappearance:

- `_recover_items_from_ocr_text()` receives prose lines, not table rows.
- `_split_ocr_table_row()` returns no cells.
- `_recover_item_from_ocr_cells()` is never reached for a commercial row.

Recovery estimate:

- Rows: possibly `1`
- HS: `0`, no HS code evidence in OCR.
- COO: `0`, no line-level COO evidence in OCR.
- Regression risk: high. This is a vehicle prose block near repeated seller/buyer/legal/payment text. Creating a generic prose parser could turn metadata into commercial rows.

Decision:

- No implementation. A vehicle-specific parser may be possible later, but it was not low-risk enough for Sprint 8.

### `22.pdf`

Exact OCR evidence:

```text
PACKING LIST
NR. 1 PALLET - L 115 X W 75 X H 70 CM

DESCRIPTION: ES45 MANUAL L-SEALING HOOD MOD ECO SEALER 45 440X300MM
SERIAL NUMBER: S/N 99593
NET WEIGHT: 150 KG
GROSS WEIGHT: 180 KG

TOTAL SHIPMENT UNITS: NR. 1
TOTAL NET WEIGHT: KG 150
TOTAL GROSS WEIGHT: KG 180

***DESCRIPTION OF GOODS: PACKAGING MACHINES HS CODE 8422.4000***
```

First disappearance:

- `_recover_items_from_ocr_text()` receives packing-list prose and summary lines, not a commercial invoice row.
- `_split_ocr_table_row()` returns no row cells for the prose block.
- Existing recovery correctly avoids parsing shipment and packing summaries as commercial rows.

Recovery estimate:

- Rows: possibly `1`
- HS: possibly `1`, from `HS CODE 8422.4000`
- COO: `0`, no line-level COO evidence in OCR.
- Regression risk: high. The strongest evidence is explicitly inside a `PACKING LIST` block and surrounded by shipment-unit/net/gross-weight summaries.

Decision:

- No implementation. Recovering this safely needs a narrower rule that distinguishes actual invoice goods rows from packing summaries; Sprint 8 did not implement speculative packing-list parsing.

## Validation

Backend unit tests:

- `python -m pytest tests/test_extraction.py`
- Result: `51 passed`

Platform regression tests:

- `npm run test:production-defect-fixes`
- Result: `57 passed, 0 failed`

Linter check:

- No linter errors reported for touched backend files.

Full corpus rerun:

- Endpoint: `POST http://127.0.0.1:8011/export-auditor/ocr`
- Dataset: `C:\CURSOR\test_data\export-auditor-fixtures\invoices_to_inspect`

| Metric | Sprint 7 Baseline | Sprint 8 Result | Change |
| --- | ---: | ---: | ---: |
| Files processed | 26 | 26 | 0 |
| Files with line items | 14 | 15 | +1 |
| Files with HS-coded lines | 11 | 11 | 0 |
| Files with COO-coded lines | 8 | 9 | +1 |
| Total recovered line items | 114 | 119 | +5 |
| Total HS-coded lines | 90 | 90 | 0 |
| Total COO-coded lines | 40 | 43 | +3 |

Target live rerun:

| Invoice | Lines | HS | COO | Action |
| --- | ---: | ---: | ---: | --- |
| `14.pdf` | 5 | 0 | 3 | Implemented combined `Country of Qty.` HTML recovery |
| `21.pdf` | 0 | 0 | 0 | No fix, high-risk prose block |
| `22.pdf` | 0 | 0 | 0 | No fix, high-risk packing-list block |

## Final Determination

Commit conditions were met for the `14.pdf` fix:

- Coverage improved by `+5` line items.
- No previously recovered corpus rows were lost in the aggregate Sprint 7 baseline comparison.
- Backend and platform validations passed.

`21.pdf` and `22.pdf` remain open. They should be handled in a future sprint only with stricter document-type-specific evidence gates.
