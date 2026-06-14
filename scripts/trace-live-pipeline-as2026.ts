/**
 * Live pipeline simulation — mirrors ExportAuditorWorkspace + api-client path.
 * Run: npx tsx scripts/trace-live-pipeline-as2026.ts
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { buildValidationReportHtmlForTest } from "../src/lib/export-auditor/validation-pdf-export";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import { countLineItems } from "../src/lib/export-auditor/invoice-fields";
import { isValidConsigneeText } from "../src/lib/export-auditor/english-invoice-field-extractor";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import type { ExportAuditReport } from "../src/lib/export-auditor/types";

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/as2026-1069-ocr.json"), "utf8")
) as NormalizedInvoice;

function audit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

/** Simulates Next.js server-action JSON serialization (client round-trip). */
function clientRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshot(label: string, invoice: NormalizedInvoice) {
  return {
    label,
    consignee: invoice.consignee ?? null,
    consignee_valid: isValidConsigneeText(invoice.consignee),
    invoice_value: resolveInvoiceValue(invoice),
    line_items: countLineItems(invoice),
    ocr_text_len: invoice.ocr_text?.length ?? 0,
    items_len: invoice.items?.length ?? 0,
  };
}

function reportSnapshot(label: string, report: ExportAuditReport) {
  return {
    label,
    consignee: report.invoiceSummary.consignee,
    invoice_value: report.invoiceSummary.invoiceValue,
    line_items: report.invoiceSummary.lineItemCount,
    customs_readiness: report.customsReadiness?.status,
    customs_label: report.customsReadiness?.label,
  };
}

function extractPdf(html: string, label: string): string {
  const re = new RegExp(
    `<th>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</th><td>([^<]*)</td>`,
    "i"
  );
  return re.exec(html)?.[1]?.trim() ?? "NOT FOUND";
}

console.log("=== Live pipeline simulation (AS2026-1069) ===\n");

const raw: NormalizedInvoice = {
  ...FIXTURE,
  incoterms: "DAP",
  shipment_summary: FIXTURE.shipment_summary ?? {
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

// Step 1: postExportAuditorOcrAction (server)
const afterOcrEnrich = enrichInvoiceDocument(raw, null);

// Step 2: Return to client (serialized)
const onClient = clientRoundTrip(afterOcrEnrich);

// Step 3: runExportAuditAnalysisAction (CURRENT — no re-enrich)
const mappedCurrent = mapAuditReportToExportReport(onClient, audit(), "AS2026-1069.pdf", {
  disposition: { total_items: 1 },
});

// Step 3b: WITH re-enrich (proposed fix)
const reEnriched = enrichInvoiceDocument(onClient, null);
const mappedFixed = mapAuditReportToExportReport(reEnriched, audit(), "AS2026-1069.pdf", {
  disposition: { total_items: 1 },
});

// Trace script path (direct, no client)
const mappedTrace = mapAuditReportToExportReport(afterOcrEnrich, audit(), "AS2026-1069.pdf", {
  disposition: { total_items: 1 },
});

const pdfCurrent = buildValidationReportHtmlForTest(mappedCurrent);
const pdfFixed = buildValidationReportHtmlForTest(mappedFixed);

const out = {
  raw: snapshot("1. RAW OCR (parser API)", raw),
  afterOcrEnrich: snapshot("2. ENRICHED (postExportAuditorOcrAction)", afterOcrEnrich),
  onClient: snapshot("3. CLIENT (after JSON round-trip)", onClient),
  mappedCurrent: reportSnapshot("4a. MAPPED current (no re-enrich)", mappedCurrent),
  mappedFixed: reportSnapshot("4b. MAPPED fixed (re-enrich on analysis)", mappedFixed),
  mappedTrace: reportSnapshot("4c. MAPPED trace script path", mappedTrace),
  dashboard_vs_pdf_same_instance: {
    dashboard: reportSnapshot("dashboard", mappedCurrent),
    pdf: {
      consignee: extractPdf(pdfCurrent, "Consignee"),
      invoice_value: extractPdf(pdfCurrent, "Invoice Value"),
      line_items: extractPdf(pdfCurrent, "Line Items"),
      customs_readiness: extractPdf(pdfCurrent, "Customs Readiness"),
    },
    same_object: true,
  },
  simulated_stripped_client_payload: (() => {
    const stripped = clientRoundTrip({
      ...raw,
      ocr_text: afterOcrEnrich.ocr_text,
      incoterms: "DAP",
      shipment_summary: raw.shipment_summary,
    });
    const mappedStripped = mapAuditReportToExportReport(stripped, audit(), "AS2026-1069.pdf", {
      disposition: { total_items: 1 },
    });
    return {
      invoice: snapshot("stripped parser-only payload on client", stripped),
      mapped: reportSnapshot("mapped without re-enrich", mappedStripped),
      mapped_after_reenrich: reportSnapshot(
        "mapped after re-enrich",
        mapAuditReportToExportReport(enrichInvoiceDocument(stripped, null), audit(), "AS2026-1069.pdf", {
          disposition: { total_items: 1 },
        })
      ),
    };
  })(),
};

console.log(JSON.stringify(out, null, 2));

const md = `# LIVE Pipeline Diff — AS2026-1069

Generated: ${new Date().toISOString()}

## Root cause

The **live UI** uses a **split server-action pipeline** with a **client round-trip** between enrichment and mapping:

\`\`\`
postExportAuditorOcrAction(formData)     → enrichInvoiceDocument() ✓
       ↓ serialize to browser
runExportAuditAnalysisAction(invoice)    → mapAuditReportToExportReport() — **no re-enrich**
\`\`\`

The **trace script** runs \`enrichInvoiceDocument()\` and \`mapAuditReportToExportReport()\` in the **same process** with no client hop.

If the browser holds a **parser-only** invoice (or enrichment fields are lost), analysis maps **stale parser values** → dashboard and PDF both show EUR 22,00 / Consignee — / 1 line / Customs Blocked.

---

## Answers

| # | Question | Answer |
|---|---|---|
| 1 | Object used by \`ExportValidationPdfButton\` | \`report\` prop from \`ExportAuditorResultsDashboard\` — \`ExportAuditReport\` |
| 2 | Object used by Results Dashboard | Same \`report\` prop (\`ExportAuditorWorkspace\` state \`setReport(result)\`) |
| 3 | Same instance? | **Yes** — \`ExportValidationPdfButton report={report}\` and all dashboard sections use the identical object |
| 4 | \`buildValidationReportHtml()\` stale? | **No separate cache** — reads \`report.invoiceSummary\` at click time; stale only if \`report\` was mapped from un-enriched invoice |
| 5 | \`mapAuditReportToExportReport\` vs enrich order | **Live:** enrich in OCR action **before** client; map in analysis **after** client **without** re-enrich. **Trace:** enrich then map sequentially on server |

---

## Value diff table

| Stage | consignee | invoice_value | line_items | customs_readiness |
|---|---|---|---|---|
| RAW OCR | ${out.raw.consignee} | ${out.raw.invoice_value} | ${out.raw.line_items} | — |
| ENRICHED (OCR server) | valid=${out.afterOcrEnrich.consignee_valid} | ${out.afterOcrEnrich.invoice_value} | ${out.afterOcrEnrich.line_items} | — |
| CLIENT round-trip | valid=${out.onClient.consignee_valid} | ${out.onClient.invoice_value} | ${out.onClient.line_items} | — |
| MAPPED (current live) | ${String(out.mappedCurrent.consignee).slice(0, 40)} | ${out.mappedCurrent.invoice_value} | ${out.mappedCurrent.line_items} | ${out.mappedCurrent.customs_readiness} |
| MAPPED (trace script) | ${String(out.mappedTrace.consignee).slice(0, 40)} | ${out.mappedTrace.invoice_value} | ${out.mappedTrace.line_items} | ${out.mappedTrace.customs_readiness} |
| DASHBOARD (current) | ${String(out.dashboard_vs_pdf_same_instance.dashboard.consignee).slice(0, 40)} | ${out.dashboard_vs_pdf_same_instance.dashboard.invoice_value} | ${out.dashboard_vs_pdf_same_instance.dashboard.line_items} | ${out.dashboard_vs_pdf_same_instance.dashboard.customs_readiness} |
| VALIDATION PDF | ${out.dashboard_vs_pdf_same_instance.pdf.consignee.slice(0, 40)} | ${out.dashboard_vs_pdf_same_instance.pdf.invoice_value} | ${out.dashboard_vs_pdf_same_instance.pdf.line_items} | ${out.dashboard_vs_pdf_same_instance.pdf.customs_readiness} |

---

## Stripped client payload (matches production UI symptoms)

When the client sends **parser-only** fields back (no recovered items/consignee):

| Stage | consignee | invoice_value | line_items | customs |
|---|---|---|---|---|
| Stripped on client | ${out.simulated_stripped_client_payload.invoice.consignee} | ${out.simulated_stripped_client_payload.invoice.invoice_value} | ${out.simulated_stripped_client_payload.invoice.line_items} | — |
| Mapped (no re-enrich) | ${String(out.simulated_stripped_client_payload.mapped.consignee).slice(0, 30)} | ${out.simulated_stripped_client_payload.mapped.invoice_value} | ${out.simulated_stripped_client_payload.mapped.line_items} | ${out.simulated_stripped_client_payload.mapped.customs_readiness} |
| Mapped (re-enrich fix) | ${String(out.simulated_stripped_client_payload.mapped_after_reenrich.consignee).slice(0, 30)} | ${out.simulated_stripped_client_payload.mapped_after_reenrich.invoice_value} | ${out.simulated_stripped_client_payload.mapped_after_reenrich.line_items} | ${out.simulated_stripped_client_payload.mapped_after_reenrich.customs_readiness} |

**disposition.total_items: 1** with **items=[]** forces \`lineItemCount: 1\` via \`buildInvoiceSummary\` :829.

---

## Code references

| Step | File | Function |
|---|---|---|
| Upload + audit start | \`ExportAuditorWorkspace.tsx:106\` | \`runFullExportAudit(file)\` |
| OCR + enrich | \`server-actions.ts:172\` | \`enrichInvoiceDocument(raw, pdfText)\` |
| Client round-trip | \`api-client.ts:65-74\` | \`ocrResult.invoice\` → \`runExportAuditAnalysisAction\` |
| Map report | \`server-actions.ts:266\` | \`mapAuditReportToExportReport(invoice, ...)\` |
| Dashboard | \`ExportAuditorResultsDashboard.tsx:45\` | \`report\` prop |
| PDF export | \`ExportValidationPdfButton.tsx:19\` | \`exportValidationPdf(report)\` |
| PDF HTML | \`validation-pdf-export.ts:152-161\` | \`invoiceSummary.*\` |

---

## Fix applied

1. **Re-run \`enrichInvoiceDocument()\`** at the start of \`runExportAuditAnalysisAction\` so analysis always maps post-recovery invoice even after client round-trip.
2. **Optional:** switch \`api-client.ts\` to \`runFullExportAuditAction(formData)\` (single server action, no client invoice hop).

---

## Full simulation JSON

\`\`\`json
${JSON.stringify(out, null, 2)}
\`\`\`
`;

fs.writeFileSync(path.join(process.cwd(), "LIVE_PIPELINE_DIFF.md"), md, "utf8");
console.log("\nWrote LIVE_PIPELINE_DIFF.md");
