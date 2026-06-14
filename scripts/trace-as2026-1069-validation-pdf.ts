/**
 * AS2026-1069 forensic trace — pipeline stage values for validation PDF export.
 * Run: npx tsx scripts/trace-as2026-1069-validation-pdf.ts
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import { formatInvoiceValueDisplay } from "../src/lib/export-auditor/parse-locale-number";
import { countLineItems } from "../src/lib/export-auditor/invoice-fields";
import { buildValidationReportHtmlForTest } from "../src/lib/export-auditor/validation-pdf-export";
import { isValidConsigneeText } from "../src/lib/export-auditor/english-invoice-field-extractor";
import { processGoldenInvoiceSource } from "../src/lib/export-auditor/golden-dataset/process-invoice";
import type { AuditReportResponse, DispositionResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const ROOT = process.cwd();
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/as2026-1069-ocr.json"), "utf8")
) as NormalizedInvoice;
const GOLDEN_SOURCE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "golden-invoices/as2026-1069/invoice-source.json"), "utf8")
) as NormalizedInvoice;
const GOLDEN_EXPECTED = JSON.parse(
  fs.readFileSync(path.join(ROOT, "golden-invoices/as2026-1069/expected-results.json"), "utf8")
);

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

function extractPdfCell(html: string, label: string): string {
  const re = new RegExp(
    `<th>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</th><td>([^<]*)</td>`,
    "i"
  );
  return re.exec(html)?.[1]?.trim() ?? "NOT FOUND";
}

function traceStage(name: string, invoice: NormalizedInvoice) {
  return {
    stage: name,
    consignee: invoice.consignee ?? null,
    consignee_valid: isValidConsigneeText(invoice.consignee),
    invoice_value: resolveInvoiceValue(invoice),
    total_value_numeric: invoice.total_value_numeric ?? null,
    total_value: invoice.total_value ?? null,
    line_item_count: countLineItems(invoice),
  };
}

function mapReport(
  invoice: NormalizedInvoice,
  disposition?: DispositionResponse
) {
  return mapAuditReportToExportReport(invoice, minimalAudit(), "AS2026-1069.pdf", {
    disposition,
  });
}

console.log("=== AS2026-1069 Validation PDF Forensic Trace ===\n");

// --- Path A: Production parser failure fixture ---
const rawProduction = {
  ...FIXTURE,
  incoterms: "DAP",
  shipment_summary: {
    package_count: 1,
    gross_weight_total: 10,
    gross_weight_unit: "kg",
    net_weight_total: null,
    net_weight_unit: null,
    package_type: "COLLI",
    pallet_dimensions: null,
    pallet_count: null,
  },
};

const enrichedProduction = enrichInvoiceDocument(rawProduction, null);
const mappedProduction = mapReport(enrichedProduction);
const mappedProductionDisposition1 = mapReport(enrichedProduction, { total_items: 1 });
const mappedRawNoEnrichment = mapReport(rawProduction);
const pdfHtmlProduction = buildValidationReportHtmlForTest(mappedProduction);

const productionTrace = {
  raw: traceStage("RAW OCR (parser API output)", rawProduction),
  enriched: traceStage("ENRICHED (enrichInvoiceDocument)", enrichedProduction),
  mapped: {
    consignee: mappedProduction.invoiceSummary.consignee,
    invoice_value: mappedProduction.invoiceSummary.invoiceValue,
    line_item_count: mappedProduction.invoiceSummary.lineItemCount,
    customs_readiness: mappedProduction.customsReadiness?.status,
    source: "mapAuditReportToExportReport → buildInvoiceSummary",
  },
  mapped_disposition_total_items_1: {
    consignee: mappedProductionDisposition1.invoiceSummary.consignee,
    invoice_value: mappedProductionDisposition1.invoiceSummary.invoiceValue,
    line_item_count: mappedProductionDisposition1.invoiceSummary.lineItemCount,
    customs_readiness: mappedProductionDisposition1.customsReadiness?.status,
    source: "buildInvoiceSummary lineItemCount = disposition.total_items ?? countLineItems",
  },
  mapped_without_enrichment: {
    consignee: mappedRawNoEnrichment.invoiceSummary.consignee,
    invoice_value: mappedRawNoEnrichment.invoiceSummary.invoiceValue,
    line_item_count: mappedRawNoEnrichment.invoiceSummary.lineItemCount,
    customs_readiness: mappedRawNoEnrichment.customsReadiness?.status,
  },
  pdf: {
    consignee: extractPdfCell(pdfHtmlProduction, "Consignee"),
    invoice_value: extractPdfCell(pdfHtmlProduction, "Invoice Value"),
    line_items: extractPdfCell(pdfHtmlProduction, "Line Items"),
    customs_readiness: extractPdfCell(pdfHtmlProduction, "Customs Readiness"),
    source: "validation-pdf-export.ts → buildValidationReportHtml → invoiceSummary.*",
  },
};

// --- Path B: Golden clean source ---
const golden = processGoldenInvoiceSource(GOLDEN_SOURCE, { fileName: "AS2026-1069.pdf" });
const pdfHtmlGolden = buildValidationReportHtmlForTest(golden.report);

const goldenTrace = {
  raw: traceStage("GOLDEN invoice-source.json (no parser pollution)", GOLDEN_SOURCE),
  enriched: traceStage("GOLDEN enriched", golden.invoice),
  mapped: {
    consignee: golden.report.invoiceSummary.consignee,
    invoice_value: golden.report.invoiceSummary.invoiceValue,
    line_item_count: golden.report.invoiceSummary.lineItemCount,
    customs_readiness: golden.report.customsReadiness?.status,
  },
  pdf: {
    consignee: extractPdfCell(pdfHtmlGolden, "Consignee"),
    invoice_value: extractPdfCell(pdfHtmlGolden, "Invoice Value"),
    line_items: extractPdfCell(pdfHtmlGolden, "Line Items"),
    customs_readiness: extractPdfCell(pdfHtmlGolden, "Customs Readiness"),
  },
  expected: GOLDEN_EXPECTED.expected,
};

console.log(JSON.stringify({ productionTrace, goldenTrace }, null, 2));

// Write markdown report
const md = `# AS2026-1069 Forensic Trace Report

Generated: ${new Date().toISOString()}

## Executive Summary

The Validation PDF export reads **only** from \`ExportAuditReport.invoiceSummary\` and \`report.customsReadiness\` — it does not re-run OCR or enrichment. Any stale parser values in the mapped report appear identically in the dashboard and PDF.

| Symptom in Validation PDF | Root cause (file / function) |
|---|---|
| Invoice value **22.00** instead of **21790.30** | \`resolveInvoiceValue()\` / \`buildInvoiceSummary()\` used **parser raw** invoice (\`total_value_numeric: 22\`) because \`enrichInvoiceDocument()\` did not run or total recovery did not apply |
| Consignee **missing (—)** or **QR for payment** | \`buildInvoiceSummary()\` → \`invoice.consignee?.trim() \\|\\| "—"\` — parser returned \`"QR for payment"\`; without \`enrichEnglishInvoiceFieldsFromOcr()\` recovery, real consignee never populated |
| Line items **1** instead of **3** | \`buildInvoiceSummary()\` line 829: \`disposition?.total_items ?? countLineItems(invoice)\` — backend **disposition API** \`total_items: 1\` overrides enriched \`items.length === 3\` |
| Customs readiness **BLOCKED** | \`evaluateCustomsReadiness()\` — invalid/missing consignee, wrong invoice value, or \`PARSER_MAPPING_FAILURE\` on unrecovered parser output |

---

## Runtime Path: Validation PDF Export

\`\`\`
User clicks ExportValidationPdfButton (ExportValidationPdfButton.tsx)
  → exportValidationPdf(report)                          [validation-pdf-export.ts:571]
  → buildValidationReportHtml(report)                    [validation-pdf-export.ts:112]
  → invoiceSummary.consignee                             [validation-pdf-export.ts:152]
  → formatInvoiceValueDisplay(invoiceSummary.invoiceValue) [validation-pdf-export.ts:159]
  → invoiceSummary.lineItemCount                         [validation-pdf-export.ts:161]
  → report.customsReadiness?.label                       [validation-pdf-export.ts:138]
\`\`\`

Upstream report construction (server):

\`\`\`
postExportAuditorOcrAction                               [server-actions.ts:135]
  → enrichInvoiceDocument(rawInvoice, pdfText)           [document-enrichment.ts:61]
runExportAuditAnalysisAction                               [server-actions.ts:233]
  → postExportAuditorDispositionAction(enriched)         → disposition.total_items
  → postExportAuditorAuditReportAction(enriched)
  → mapAuditReportToExportReport(enriched, audit, ...)   [map-api-response.ts:974]
      → buildInvoiceSummary(invoice, hs, pref, disposition) [map-api-response.ts:804]
          → consignee: invoice.consignee?.trim() || "—"  [map-api-response.ts:823]
          → invoiceValue: resolveInvoiceValue(invoice)     [map-api-response.ts:828]
          → lineItemCount: disposition?.total_items ?? countLineItems(invoice) [map-api-response.ts:829]
      → applyEnterpriseCommercialSummary(...)              [enterprise-commercial-summary.ts:41]
  → report returned to client → same object used by PDF button
\`\`\`

---

## Field Trace — Production Parser Failure Fixture

Source: \`scripts/fixtures/as2026-1069-ocr.json\` (matches live OCR pollution: QR consignee, total 22, 0 items)

### consignee

| Stage | Value | Function |
|---|---|---|
| RAW OCR | \`${productionTrace.raw.consignee}\` | export-auditor OCR API → \`postExportAuditorOcrAction\` |
| ENRICHED | \`${String(productionTrace.enriched.consignee).slice(0, 80).replace(/\\n/g, " / ")}...\` (valid=${productionTrace.enriched.consignee_valid}) | \`enrichEnglishInvoiceFieldsFromOcr\` → \`recordParserRecovery(OCR_CONSIGNEE_RECOVERY)\` |
| MAPPED (enriched) | \`${String(productionTrace.mapped.consignee).slice(0, 80).replace(/\\n/g, " / ")}\` | \`buildInvoiceSummary\` :823 |
| MAPPED (no enrichment) | \`${productionTrace.mapped_without_enrichment.consignee}\` | Same — parser QR text or — |
| PDF (enriched path) | \`${productionTrace.pdf.consignee.slice(0, 80)}\` | \`validation-pdf-export.ts\` :152 |

### invoice_value

| Stage | Value | Function |
|---|---|---|
| RAW OCR | ${productionTrace.raw.invoice_value} (\`total_value_numeric=${productionTrace.raw.total_value_numeric}\`) | Parser mapped payment QR fragment |
| ENRICHED | ${productionTrace.enriched.invoice_value} | \`validateAndCorrectInvoiceTotal\` + \`extractEnglishInvoiceTotal\` |
| MAPPED (enriched) | ${productionTrace.mapped.invoice_value} | \`resolveInvoiceValue\` in \`buildInvoiceSummary\` |
| MAPPED (no enrichment) | ${productionTrace.mapped_without_enrichment.invoice_value} | \`resolveInvoiceValue\` reads \`total_value_numeric: 22\` |
| PDF (enriched) | ${productionTrace.pdf.invoice_value} | \`formatInvoiceValueDisplay(invoiceSummary.invoiceValue)\` |

### line_item_count

| Stage | Value | Function |
|---|---|---|
| RAW OCR | ${productionTrace.raw.line_item_count} | Parser returned \`items: []\` |
| ENRICHED | ${productionTrace.enriched.line_item_count} | \`extractEnglishLineItems\` / \`TABLE_RECONSTRUCTION\` |
| MAPPED (enriched, no disposition) | ${productionTrace.mapped.line_item_count} | \`countLineItems(invoice)\` |
| MAPPED (disposition total_items=1) | **${productionTrace.mapped_disposition_total_items_1.line_item_count}** | **\`disposition?.total_items\` wins over 3 items** — \`map-api-response.ts:829\` |
| PDF (enriched) | ${productionTrace.pdf.line_items} | \`invoiceSummary.lineItemCount\` |

### customs_readiness

| Stage | Value | Function |
|---|---|---|
| MAPPED (enriched) | ${productionTrace.mapped.customs_readiness} | \`evaluateCustomsReadiness\` + recovery downgrade |
| MAPPED (no enrichment) | ${productionTrace.mapped_without_enrichment.customs_readiness} | Blocks on invalid consignee / OCR failure |
| PDF | ${productionTrace.pdf.customs_readiness} | \`report.customsReadiness.label\` |

---

## Field Trace — Golden Dataset (clean OCR)

Source: \`golden-invoices/as2026-1069/invoice-source.json\`

| Field | RAW | ENRICHED | MAPPED | PDF | expected-results.json |
|---|---|---|---|---|
| consignee | (empty) | ${String(goldenTrace.enriched.consignee).slice(0, 40)}... | ${String(goldenTrace.mapped.consignee).slice(0, 40)}... | ${goldenTrace.pdf.consignee.slice(0, 40)} | ${goldenTrace.expected.consignee} |
| invoice_value | 0 | ${goldenTrace.enriched.invoice_value} | ${goldenTrace.mapped.invoice_value} | ${goldenTrace.pdf.invoice_value} | ${goldenTrace.expected.invoiceValue} |
| line_items | 0 | ${goldenTrace.enriched.line_item_count} | ${goldenTrace.mapped.line_item_count} | ${goldenTrace.pdf.line_items} | ${goldenTrace.expected.lineCount} |
| customs_readiness | — | — | ${goldenTrace.mapped.customs_readiness} | ${goldenTrace.pdf.customs_readiness} | ${goldenTrace.expected.customsReadiness} |

---

## Comparison: Dashboard vs Validation PDF vs Golden Expected

| Field | Dashboard source | Validation PDF source | Golden expected |
|---|---|---|---|
| consignee | \`report.invoiceSummary.consignee\` | **Same** \`invoiceSummary.consignee\` | Braca Maric |
| invoice_value | \`report.invoiceSummary.invoiceValue\` | **Same** via \`formatInvoiceValueDisplay\` | 21790.30 |
| line_items | \`report.invoiceSummary.lineItemCount\` | **Same** | 3 |
| customs_readiness | \`report.customsReadiness.status\` | **Same** label | CUSTOMS_REVIEW |

**Dashboard and Validation PDF always share the same \`ExportAuditReport\` object.** Divergence from source invoice PDF means the mapped report was built from stale parser output, not a PDF-specific bug.

---

## Defect Locations (exact change points)

### 1. Invoice value 22.00

- **Changes at:** \`document-enrichment.ts\` → \`validateAndCorrectInvoiceTotal()\` [\`invoice-total-validation.ts:68\`]
- **Without enrichment:** \`parse-locale-number.ts:157\` reads \`total_value_numeric: 22\`
- **PDF reads:** \`validation-pdf-export.ts:159\` ← \`buildInvoiceSummary\` ← \`resolveInvoiceValue\`

### 2. Consignee missing

- **Parser sets:** \`consignee: "QR for payment"\` (fixture line 6)
- **Recovery at:** \`english-invoice-field-extractor.ts:314\` (\`OCR_CONSIGNEE_RECOVERY\`)
- **Mapped default:** \`map-api-response.ts:823\` — empty/null → \`"—"\`
- **If QR not replaced:** PDF shows \`QR for payment\` (not real consignee)

### 3. Line items = 1 (when 3 exist)

- **Root cause:** \`map-api-response.ts:829\`
  \`\`\`typescript
  lineItemCount: disposition?.total_items ?? countLineItems(invoice)
  \`\`\`
- When \`postExportAuditorDispositionAction\` returns \`total_items: 1\`, enriched 3-item invoice is **overridden**
- **Also:** \`applyEnterpriseCommercialSummary\` [\`enterprise-commercial-summary.ts:56\`] propagates \`lineItemCount\`

### 4. Recommended fixes

1. Prefer \`countLineItems(enrichedInvoice)\` over disposition when enriched count is higher
2. Ensure \`runExportAuditAnalysisAction\` always maps **post-enrichment** invoice (already does — verify client not caching pre-enrichment report)
3. Regenerate \`golden-invoices/as2026-1069/validation-report.pdf\` after enrichment fixes
4. Validation PDF export is read-only — fix upstream mapping, not \`validation-pdf-export.ts\`

---

## Live Trace Output (this run)

\`\`\`json
${JSON.stringify({ productionTrace, goldenTrace }, null, 2)}
\`\`\`
`;

fs.writeFileSync(path.join(ROOT, "AS2026_1069_TRACE_REPORT.md"), md, "utf8");
console.log("\nWrote AS2026_1069_TRACE_REPORT.md");
