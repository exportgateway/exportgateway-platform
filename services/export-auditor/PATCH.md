# Export Auditor — OCR Shipment Data Patch (DENKIRS 2026-156)

**Root cause:** Mistral OCR extracts shipment tables into `pages[].tables[]` but production pipeline used markdown-only corpus and schema without `shipment_summary`.

Copy into the export-auditor service and **redeploy Render**:

| File | Action |
|------|--------|
| `app/modules/export_auditor/mistral_ocr.py` | **Replace** — merge `tables[].content` + headers/footers into `full_text`; shipment-aware `DOCUMENT_ANNOTATION_PROMPT` |
| `app/modules/export_auditor/extraction_schema.py` | **Replace** — `shipment_summary`, `delivery_address`, `ocr_text` on `ExtractedInvoiceSchema` |
| `app/modules/export_auditor/extraction.py` | **Replace** — merge annotation + corpus shipment; attach `ocr_metadata` metrics |
| `app/modules/export_auditor/schemas.py` | **Replace** — `ShipmentSummary`, `DeliveryAddress`, `OcrMetadata` on `NormalizedInvoice` |
| `app/modules/export_auditor/shipment_summary_extractor.py` | **Replace** — HTML table normalization for `Koli:` / `Bruto teža:` cells |
| `app/modules/export_auditor/shipment_coverage.py` | **Add** (new) |
| `tests/test_mistral_ocr.py` | **Add** (new) |
| `tests/test_shipment_coverage.py` | **Add** (new) |
| `tests/test_shipment_summary.py` | **Replace** — includes DENKIRS 2026-156 table fixture |

## Success criteria (Invoice_156.pdf)

After redeploy, `POST /export-auditor/ocr` must return:

```json
{
  "shipment_summary": {
    "package_count": 2,
    "gross_weight_total": 76.74,
    "gross_weight_unit": "kg"
  },
  "ocr_text": "... Koli: ... 76,74 kg ...",
  "ocr_metadata": {
    "shipment_fields_detected": ["package_count", "gross_weight_total"],
    "shipment_fields_missing": ["net_weight_total", "package_type", "pallet_count"]
  }
}
```

## Run tests (export-auditor repo)

```bash
python -m unittest tests.test_mistral_ocr tests.test_shipment_summary tests.test_shipment_coverage
```

## Platform observability (already in exportgateway-platform)

`ocr_metadata.shipment_fields_detected` / `shipment_fields_missing` flow into `OcrObservability` on the audit report dashboard.

---

# Export Auditor — Destination Country Patch

Upstream repo: `exportgateway/export-auditor`

Copy these files into the export-auditor service and redeploy to Render:

| File | Action |
|------|--------|
| `app/modules/export_auditor/destination_country.py` | **Add** (new) |
| `app/modules/export_auditor/extraction_schema.py` | **Replace** — updated `country` / `country_code` Field descriptions |
| `app/modules/export_auditor/extraction.py` | **Patch** — see below |
| `tests/test_destination_country.py` | **Add** (new) |

## extraction.py changes

### 1. Import

```python
from app.modules.export_auditor.destination_country import resolve_destination_from_consignee
```

### 2. Replace `CHAT_EXTRACTION_SYSTEM` with:

```python
CHAT_EXTRACTION_SYSTEM = """You are an export compliance invoice extraction engine.
Extract structured invoice data from OCR text spanning one or more pages.
Return data that matches the provided JSON schema exactly.
Never summarize line items — extract every invoice table row.
Preserve full Incoterms including place names (example: DAP Beograd).
Extract invoice totals from total/subtotal/grand total fields.
Extract item_code for each line item from product/article/SKU columns.
Preserve full vat_article text exactly as printed, including leading "Article".

DESTINATION COUNTRY RULES (mandatory):
- country and country_code MUST be the consignee/importer/buyer destination country ONLY.
- NEVER set country from exporter address, seller location, or Incoterms place (EXW/FCA/DAP/CIP location).
- Parse consignee address for destination: MK-xxxx → North Macedonia (MK), RS-xxxx → Serbia (RS),
  BA-xxxx → Bosnia and Herzegovina (BA), AL-xxxx → Albania (AL), XK-xxxx → Kosovo (XK),
  ME-xxxx → Montenegro (ME).
- If consignee country and Incoterms location conflict, consignee country wins.
"""
```

### 3. Before returning invoice in `extract_invoice_from_ocr`:

```python
    invoice = resolve_destination_from_consignee(invoice)

    _log_extraction_quality_report(...)
    return invoice
```

## Run tests (export-auditor repo)

```bash
python -m unittest tests.test_destination_country
```

## Platform live fix (already deployed in exportgateway-platform)

The Next.js platform applies `resolveDestinationCountry()` immediately after OCR in
`postExportAuditorOcrAction` — so invoice **26-392-000027** is corrected even before
readiness/disposition/audit-report calls, without waiting for backend redeploy.

---

# Export Auditor — Shipment Summary Patch

Copy into the export-auditor service:

| File | Action |
|------|--------|
| `app/modules/export_auditor/shipment_summary_extractor.py` | **Add** (new) |
| `app/modules/export_auditor/extraction_schema.py` | **Replace** — adds `shipment_summary`, `delivery_address`, `ocr_text` |
| `tests/test_shipment_summary.py` | **Add** (new) |

## Readiness integration

After building the normalized invoice, call shipment readiness checks and append warnings:

```python
from app.modules.export_auditor.shipment_summary_extractor import (
    evaluate_shipment_readiness,
    extract_shipment_summary,
    extract_delivery_address,
)

summary = extract_shipment_summary(corpus)
delivery = extract_delivery_address(corpus)
for code, message in evaluate_shipment_readiness(summary):
    warnings.append(message)  # MISSING_PACKAGE_COUNT / MISSING_GROSS_WEIGHT
```

Include `shipment_summary` and `delivery_address` on `/export-auditor/audit-report` responses.

## Platform live fix

The Next.js platform applies `enrichInvoiceShipmentData()` after OCR and maps shipment
fields into the audit report UI without waiting for backend redeploy.

Run platform tests:

```bash
npm run test:shipment-summary
```

---

# Export Auditor — Multilingual Shipment & Consignee Patch

Copy into the export-auditor service:

| File | Action |
|------|--------|
| `app/modules/export_auditor/multilingual_invoice_labels.py` | **Add** (new) |
| `app/modules/export_auditor/shipment_summary_extractor.py` | **Replace** — multilingual label patterns |
| `app/modules/export_auditor/extraction_schema.py` | **Replace** — add `net_weight_total`, `pallet_count`, multilingual Field descriptions |

## extraction.py prompt additions

Add to `CHAT_EXTRACTION_SYSTEM`:

```
MULTILINGUAL SHIPMENT RULES (mandatory):
- Extract shipment_summary from footer/summary blocks in ANY supported language.
- Gross weight labels: Gross Weight, Bruttogewicht, Bruto Teža, Peso Lordo, Greutate Brută, Waga Brutto, etc.
- Net weight labels: Net Weight, Nettogewicht, Neto Teža, Peso Netto, Greutate Netă, Waga Netto, etc.
- Package count labels: Packages, Colli, Koli, Kosov, Paketi, Stück, Nr. colete, Počet balení, Liczba opakowań, etc.
- Pallet count labels: Pallets, Palete, Paletten, Nr. paleti, Počet paliet, Liczba palet, etc.
- Consignee/delivery labels: Consignee, Prejemnik, Kupac, Empfänger, Destinatario, Destinataire, Odbiorca, etc.
- Origin labels: Country of Origin, Država izvora, Zemlja porekla, Ursprungsland, Pays d'origine, etc.
- Preferential indicators: EUR.1, Preferential Origin, Preferenčno poreklo, Ursprungserklärung, etc.
- Always populate ocr_text with full shipment footer and consignee/delivery blocks when present.
```

## Platform live fix

The Next.js platform applies `extractMultilingualShipmentMetrics()` and
`extractMultilingualDeliveryAddress()` in `enrichInvoiceShipmentData()` as a safety net.

```bash
npm run test:multilingual-extraction
npm run test:shipment-summary
npm run test:golden-denkirs-2026-156
```

---

# Export Auditor — HS Aggregation Engine Patch

Copy into the export-auditor service:

| File | Action |
|------|--------|
| `app/modules/export_auditor/hs_aggregation_engine.py` | **Add** (new) |
| `tests/test_hs_aggregation.py` | **Add** (new) |

Wire into `/export-auditor/audit-report` after preference-origin engine output:

```python
from app.modules.export_auditor.hs_aggregation_engine import run_hs_aggregation_engine
from app.modules.export_auditor.preferential_origin_engine import run_preferential_origin_engine

preference = run_preferential_origin_engine(invoice)
items = normalize_items_with_preference(invoice, preference.lines)
aggregation = run_hs_aggregation_engine(items, gross_weight=invoice.shipment_summary.gross_weight_total)
```

Include on audit report: `hs_aggregation`, `preferential_summary`, `non_preferential_summary`, `unknown_preference_summary`, `mrn_summary`.

## Platform live fix

The Next.js platform runs `runHsAggregationEngine()` in `mapAuditReportToExportReport()` and displays results on the **Enterprise** tab.

```bash
npm run test:hs-aggregation
```
