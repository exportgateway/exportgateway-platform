# Phase 3A.1 Hardening Report

## Scope

Implemented only invoice-number validation hardening in:

`C:\CURSOR\export-auditor-repo\app\modules\export_auditor\extraction.py`

No changes were made to:

- exporter logic
- consignee logic
- destination logic
- incoterms logic
- readiness logic
- OCR logic

## Goal

Reduce invoice-number false positives introduced by Phase 3A. When confidence is low, the backend should return a missing invoice number rather than a wrong invoice number.

## Negative Tests Added

Added regression tests in:

`C:\CURSOR\export-auditor-repo\tests\test_extraction.py`

The tests cover the Phase 3A live-corpus false positives:

- `1/5`
- `tbl-0.html`
- `Img-0.Jpeg`
- `SI56 0488 1000 2169 827`
- `an na podlagi 1. odst. 52.`
- `9246681000`
- `260539 Destination`
- `6124746 Pick Ticket`
- alternate invoice-number/date contamination from `2.pdf`
- wrong-reference contamination from `19.pdf`

## Implemented Hardening

Invoice-number candidates are now rejected when they look like:

- page numbers such as `1/5`
- HTML/image artifact names such as `tbl-0.html` and `Img-0.Jpeg`
- IBAN/account-like strings
- VAT/tax/customer identifiers
- long pure numeric identifiers likely to be VAT/customer/account numbers
- destination-label contamination
- legal sentence fragments
- lowercase prose
- tiny page-like numeric tokens

Valid annotation values remain authoritative.

## Validation

Backend extraction tests:

- Command: `python -m pytest tests/test_extraction.py`
- Result: `41 passed`

Production defect fixes:

- Command: `npm run test:production-defect-fixes`
- Result: `53 passed, 0 failed`

Linter diagnostics:

- Result: no linter errors on edited backend files.

## Live Corpus Audit

Dataset:

`C:\CURSOR\test_data\export-auditor-fixtures\invoices_to_inspect`

Endpoint:

`POST http://127.0.0.1:8011/export-auditor/ocr`

Important operational note:

- The first corpus rerun still showed Phase 3A values, so the backend process had not reloaded the hardening code.
- The backend was restarted cleanly from `C:\CURSOR\export-auditor-repo` without reload indirection.
- The corpus was rerun after restart.

## Phase 3A.1 Live Results

| Invoice | Phase 3A invoice number | Phase 3A.1 invoice number | Result |
| --- | --- | --- | --- |
| `1.pdf` | `40046262` | `40046262` | unchanged good |
| `2.pdf` | `26-01A0-007755/14.05.2026` | `26-01A0-007755/14.05.2026` | still risky |
| `3.pdf` | `1/5` | missing | fixed false positive |
| `4.pdf` | `01625-2026` | `01625-2026` | unchanged good |
| `5.pdf` | `10809-26` | `10809-26` | unchanged good |
| `6.pdf` | `AS2026-1069` | `AS2026-1069` | unchanged good |
| `7.pdf` | `AS2026-1274` | `AS2026-1274` | unchanged good |
| `8.pdf` | `260486 Of 13-05-2026` | missing | fixed risky contamination by returning missing |
| `9.pdf` | `9246681000` | `21263591` | still risky, changed false positive |
| `10.pdf` | `194` | `194` | unchanged good |
| `11.pdf` | `6124746 Pick Ticket` | `6124746` | fixed contamination |
| `12.pdf` | `SI56 0488 1000 2169 827` | `A-26/0041` | fixed false positive; restored usable invoice number |
| `13.pdf` | `0001/2026` | `0001/2026` | unchanged good |
| `14.pdf` | `RA-26003859` | `RA-26003859` | unchanged good |
| `15.pdf` | `RA-26004189` | `RA-26004189` | unchanged good |
| `16.pdf` | `26-300-000060` | `26-300-000060` | unchanged good |
| `17.pdf` | `156/26` | `156/26` | unchanged good |
| `18.pdf` | `157/26` | `157/26` | unchanged good |
| `19.pdf` | `1/20406/00` | `1/20406/00` | still risky |
| `20.pdf` | `an na podlagi 1. odst. 52.` | `39233010 20.195` | still risky, changed false positive |
| `21.pdf` | `46 - 2026` | `46 - 2026` | unchanged good |
| `22.pdf` | `260539 Destination` | `260539` | fixed contamination |
| `23.pdf` | `tbl-0.html` | `26-360-000016` | fixed false positive; recovered usable invoice number |
| `24.pdf` | `tbl-0.html` | `26-360-000016` | fixed false positive; recovered usable invoice number |
| `25.pdf` | `26-384-000064` | `26-384-000064` | unchanged good |
| `26.pdf` | `261000177` | `261000177` | unchanged good |

## Impact Summary

False positives fixed or improved:

- `3.pdf`: `1/5` -> missing
- `8.pdf`: `260486 Of 13-05-2026` -> missing
- `11.pdf`: `6124746 Pick Ticket` -> `6124746`
- `12.pdf`: `SI56 0488 1000 2169 827` -> `A-26/0041`
- `22.pdf`: `260539 Destination` -> `260539`
- `23.pdf`: `tbl-0.html` -> `26-360-000016`
- `24.pdf`: `tbl-0.html` -> `26-360-000016`

Remaining invoice-number risks:

- `2.pdf`: still `26-01A0-007755/14.05.2026`
- `9.pdf`: still false-positive-like, now `21263591`
- `19.pdf`: still `1/20406/00`
- `20.pdf`: still false-positive-like, now `39233010 20.195`

Exporter regression check:

- No exporter regressions observed versus Phase 3A live corpus output.

Incoterm regression check:

- No incoterm regressions observed versus Phase 3A live corpus output.

Live corpus quality:

- Improved. Phase 3A.1 removes the highest-risk false positives while preserving existing good invoice-number recoveries.
- Some false positives remain and should become the next hardening target.

## Commit Decision

Criteria:

- no exporter regressions: passed
- no incoterm regressions: passed
- invoice-number false positives decrease: passed
- live corpus quality improves: passed
- requested tests pass: passed

Decision:

- Eligible to commit backend hardening changes and this report.
