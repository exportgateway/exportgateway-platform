/**
 * AS2026-1069 forensic trace — live runtime simulation + exact server pipeline.
 * Run: npx tsx scripts/forensic-trace-as2026.ts
 */

import fs from "fs";
import path from "path";
import { extractPdfText, extractPdfPageCount } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { attachRawOcrShipmentMetadata } from "../src/lib/export-auditor/shipment-extraction-diagnostics";
import {
  logBeforeMap,
  renderForensicTraceMarkdown,
  resetForensicTrace,
  setForensicTraceEnabled,
} from "../src/lib/export-auditor/as2026-forensic-trace";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import type {
  AuditReportResponse,
  DispositionResponse,
  NormalizedInvoice,
} from "../src/lib/export-auditor/api-types";

const ROOT = process.cwd();
const FIXTURE = path.join(ROOT, "scripts/fixtures/as2026-1069-ocr.json");
const LIVE_PDF_TEXT = path.join(ROOT, "scripts/fixtures/as2026-live-pdfText.txt");
const LIVE_CAPTURE_DIR = path.join(ROOT, "scripts/fixtures/as2026-live-capture");
const OUT = path.join(ROOT, "AS2026_TRACE.md");
const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

function loadLiveRuntimeCapture(): {
  rawOcr: NormalizedInvoice;
  pdfText: string;
  source: string;
} {
  const captureRaw = path.join(LIVE_CAPTURE_DIR, "raw-ocr.json");
  const capturePdf = path.join(LIVE_CAPTURE_DIR, "pdfText.txt");
  if (fs.existsSync(captureRaw) && fs.existsSync(capturePdf)) {
    return {
      rawOcr: JSON.parse(fs.readFileSync(captureRaw, "utf8")) as NormalizedInvoice,
      pdfText: fs.readFileSync(capturePdf, "utf8"),
      source: "scripts/fixtures/as2026-live-capture/ (server upload dump)",
    };
  }

  const pdfText = fs.readFileSync(LIVE_PDF_TEXT, "utf8").trim();
  const template = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as NormalizedInvoice;

  const parserOcrText = [
    pdfText,
    "",
    "--- upstream parser OCR extension ---",
    "Payment reference: 22",
    "Footer: Scan QR code for payment",
    "QR for payment",
    "Parser fragment total: 22 EUR",
    "Colli: 1",
    pdfText.split("\n").slice(0, 5).join("\n"),
  ].join("\n");

  return {
    rawOcr: {
      ...template,
      ocr_text: parserOcrText,
      consignee: "QR for payment",
      total_value: "22",
      total_value_numeric: 22,
      items: [],
      invoice_number: "AS2026-1069",
      exporter: "Apecs.S d.o.o.",
      invoice_date: "21.05.2026",
    },
    pdfText,
    source:
      "Live runtime simulation — dev-server extractPdfText capture (1617 chars) + parser fields QR/22/0 items",
  };
}

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

async function fetchDisposition(_invoice: NormalizedInvoice): Promise<DispositionResponse> {
  return { total_items: 1 };
}

function ocrActionEnrich(
  rawInvoice: NormalizedInvoice,
  pdfText: string,
  pageCount: number
): NormalizedInvoice {
  return enrichInvoiceDocument(
    attachRawOcrShipmentMetadata(
      {
        ...rawInvoice,
        ocr_metadata: { ...rawInvoice.ocr_metadata, page_count: pageCount },
      },
      pdfText.length
    ),
    pdfText
  );
}

function analysisReEnrich(invoice: NormalizedInvoice): NormalizedInvoice {
  return enrichInvoiceDocument(invoice, null);
}

function runPipeline(
  rawOcr: NormalizedInvoice,
  pdfText: string,
  pageCount: number,
  fileName: string
) {
  resetForensicTrace();
  setForensicTraceEnabled(true);

  const afterOcr = ocrActionEnrich(rawOcr, pdfText, pageCount);
  const afterAnalysis = analysisReEnrich(afterOcr);
  logBeforeMap(afterAnalysis);

  const disposition = { total_items: 1 };
  const report = mapAuditReportToExportReport(afterAnalysis, minimalAudit(), fileName, {
    disposition,
  });

  return { afterOcr, afterAnalysis, report };
}

async function main() {
  console.log("=== AS2026-1069 Forensic Trace ===\n");

  resetForensicTrace();
  setForensicTraceEnabled(true);
  process.env.AS2026_FORENSIC_TRACE = "1";

  const { rawOcr, pdfText, source } = loadLiveRuntimeCapture();
  const pageCount = 1;
  const fileName = "Invoice #AS2026-1069 Braca Maric 21.05.2026.pdf";

  console.log(`Source: ${source}`);
  console.log(`pdfText.length=${pdfText.length} parser ocr_text_len=${rawOcr.ocr_text?.length ?? 0}`);

  const fullRun = runPipeline(rawOcr, pdfText, pageCount, fileName);

  // Scenario B: dev-server preview corpus — no totals, no line rows (matches invoiceValue=22 on localhost)
  const devPreview500 =
    'Buyer:\nZ.T.R. "Braca Maric" Apecs.S d.o.o.\nDragiše Mišovića 169, 32000 Čačak, Srbija Grška ulica 13, 1000 Ljubljana\nTel.: +386 40 762 309\nEmail: prodaja@apecs.si\nVAT number: 101112842 VAT number: SI49796712\nInvoice #: AS2026-1069\nRecipient:\nQR for payment\n Date: 21.05.2026\nDragiše Mišovića 169, 32000 Čačak,\nSrbija\nDue date: 05.06.2026\nContract:\nDelivery date: 21.05.2026\nPayment method: Bank transfer\nPos Description Barcode Quantity MU Price\nw/o VAT\n%\ndisc.\nPrice\nwith disc.\nw/o VAT\nVAT Amount\nwit';
  const liveFailRaw: NormalizedInvoice = {
    ...rawOcr,
    ocr_text: devPreview500,
    consignee: "QR for payment",
    total_value_numeric: 22,
    total_value: "22",
    items: [],
  };
  const liveFailRun = runPipeline(liveFailRaw, devPreview500, pageCount, fileName);

  const md =
    renderForensicTraceMarkdown({
      raw: rawOcr,
      enriched: fullRun.afterAnalysis,
      mappedInvoiceValue: fullRun.report.invoiceSummary.invoiceValue,
      mappedConsignee: fullRun.report.invoiceSummary.consignee,
      mappedLineCount: fullRun.report.invoiceSummary.lineItemCount,
      mappedCustoms: fullRun.report.customsReadiness?.label ?? fullRun.report.customsReadiness?.status,
      pipeline: `${source} → postExportAuditorOcrAction → runExportAuditAnalysisAction → map`,
    }) +
    `

---

## Scenario: localhost failure (truncated corpus — matches invoiceValue=22)

When \`extractPdfText\` / merged OCR corpus **ends before totals and line rows** (dev-server preview ends at \`VAT Amount\\nwit\`):

| Stage | invoice_value | line_items | consignee |
|---|---|---|---|
| RAW | ${resolveInvoiceValue(liveFailRaw)} | 0 | QR for payment |
| ENRICHED | ${resolveInvoiceValue(liveFailRun.afterAnalysis)} | ${liveFailRun.afterAnalysis.items?.length ?? 0} | ${liveFailRun.afterAnalysis.consignee ?? "—"} |
| MAPPED | ${liveFailRun.report.invoiceSummary.invoiceValue} | ${liveFailRun.report.invoiceSummary.lineItemCount} | ${liveFailRun.report.invoiceSummary.consignee} |

**Classification: B** — \`validateAndCorrectInvoiceTotal\` ran but \`ocr_detected_total=null\`, \`largest_monetary=21.05\` (date), \`corrected_flag=false\`. Parser total **22** retained.

**Consignee: B** — \`extractEnglishConsignee\` returns null because \`extractBlockAfterLabel(Recipient)\` stops at \`Date:\` line before \`Dragiše Mišovića\` address rows.

---

## Live dev-server correlation

Observed on localhost upload (terminal 617421):

| Metric | Dev server | This trace |
|---|---|---|
| pdfTextLength | 1617 | ${pdfText.length} |
| ocr_text before enrich | 2319 | ${rawOcr.ocr_text?.length ?? 0} |
| ocr_text after enrich | 3937 | ${fullRun.afterOcr.ocr_text?.length ?? 0} |
| invoiceValue at map | **22** | **${fullRun.report.invoiceSummary.invoiceValue}** (full corpus) / **${liveFailRun.report.invoiceSummary.invoiceValue}** (truncated) |

## Step-by-step values (full corpus scenario)

| Step | resolveInvoiceValue | items | consignee (first 80) |
|---|---|---|---|
| RAW OCR | ${resolveInvoiceValue(rawOcr)} | ${rawOcr.items?.length ?? 0} | ${String(rawOcr.consignee ?? "—").slice(0, 80)} |
| After OCR enrich | ${resolveInvoiceValue(fullRun.afterOcr)} | ${fullRun.afterOcr.items?.length ?? 0} | ${String(fullRun.afterOcr.consignee ?? "—").slice(0, 80)} |
| After analysis re-enrich | ${resolveInvoiceValue(fullRun.afterAnalysis)} | ${fullRun.afterAnalysis.items?.length ?? 0} | ${String(fullRun.afterAnalysis.consignee ?? "—").slice(0, 80)} |
| Mapped report | ${fullRun.report.invoiceSummary.invoiceValue} | ${fullRun.report.invoiceSummary.lineItemCount} | ${String(fullRun.report.invoiceSummary.consignee).slice(0, 80)} |

## Real PDF text (extractPdfText capture)

\`\`\`
${pdfText}
\`\`\`
`;

  fs.writeFileSync(OUT, md, "utf8");
  console.log(`\nWrote ${OUT}`);
  console.log("Summary:", {
    full: fullRun.report.invoiceSummary.invoiceValue,
    liveFail: liveFailRun.report.invoiceSummary.invoiceValue,
    customs: fullRun.report.customsReadiness?.status,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
