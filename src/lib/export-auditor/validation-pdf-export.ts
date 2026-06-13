/**
 * Temporary Golden Invoice review export — renders full audit report as printable HTML.
 * User saves via browser Print → Save as PDF for bulk invoice validation.
 */

import type { ExportAuditReport, HsAggregationRow, PreferenceAggregationRow } from "@/lib/export-auditor/types";
import { calculateExportReadinessScore, getReadinessVerdict } from "@/lib/export-auditor/readiness-score";
import { formatInvoiceValueDisplay } from "@/lib/export-auditor/parse-locale-number";
import { formatOriginCountriesList } from "@/lib/export-auditor/origin-countries-summary";
import { NON_PREFERENTIAL_EXPORT_LABEL } from "@/lib/export-auditor/hs-aggregation-engine";
import { MISTRAL_OCR_PROVIDER } from "@/lib/export-auditor/ocr-observability";

export const EXPORT_AUDITOR_VERSION = "0.1.0-golden-review";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function display(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return escapeHtml(String(value));
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatWeight(total: number | null | undefined, unit: string | null | undefined): string {
  if (total == null) return "—";
  return `${formatNumber(total, total % 1 === 0 ? 0 : 3)}${unit ? ` ${escapeHtml(unit)}` : ""}`;
}

function kvSection(title: string, rows: Array<{ label: string; value: string }>): string {
  const cells = rows
    .map(
      (row) =>
        `<tr><th>${escapeHtml(row.label)}</th><td>${row.value}</td></tr>`
    )
    .join("");
  return `
    <section class="block">
      <h2>${escapeHtml(title)}</h2>
      <table class="kv">${cells}</table>
    </section>`;
}

function dataTable(title: string, headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `
      <section class="block">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">No data.</p>
      </section>`;
  }
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`
    )
    .join("");
  return `
    <section class="block">
      <h2>${escapeHtml(title)}</h2>
      <table class="data">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function preferenceAggregationTable(
  title: string,
  rows: PreferenceAggregationRow[],
  currency: string
): string {
  return dataTable(
    title,
    ["HS / Label", "Quantity", "Value", "Net Weight", "Source Positions"],
    rows.map((row) => [
      display(row.displayLabel ?? row.hsCode),
      display(row.totalQuantity),
      `${escapeHtml(currency)} ${formatNumber(row.totalValue)}`,
      row.weightAllocationUnavailable
        ? "Weight allocation unavailable"
        : row.totalNetWeight != null
          ? `${formatNumber(row.totalNetWeight, 3)} kg`
          : "—",
      display(row.sourcePositions.join(", ")),
    ])
  );
}

function buildValidationReportHtml(report: ExportAuditReport, generatedAt: Date): string {
  const verdict = getReadinessVerdict(report);
  const readinessScore = calculateExportReadinessScore(report);
  const { invoiceSummary, shipmentSummary, deliveryAddress, preferenceOrigin, hsAggregationReport } =
    report;
  const currency = invoiceSummary.currency || "EUR";
  const ocr = report.ocrObservability;
  const shipmentDiag = report.shipmentExtractionDiagnostics;

  const metaRows = [
    { label: "Report Generated", value: generatedAt.toLocaleString() },
    { label: "Source File", value: display(report.fileName) },
    { label: "Invoice Number", value: display(invoiceSummary.invoiceNumber) },
    { label: "Export Auditor Version", value: EXPORT_AUDITOR_VERSION },
    {
      label: "OCR Provider",
      value: display(ocr?.ocrProvider ?? MISTRAL_OCR_PROVIDER),
    },
    {
      label: "OCR Quality",
      value: ocr ? `${ocr.ocrQualityScore}%` : "—",
    },
    {
      label: "OCR Cost",
      value: ocr ? formatUsd(ocr.estimatedOcrCostUsd) : "—",
    },
    { label: "Readiness Score", value: `${readinessScore}` },
    { label: "Audit Status", value: display(verdict.auditStatus) },
    { label: "Export Status", value: display(verdict.exportStatus) },
  ];

  const invoiceRows = [
    { label: "Invoice Date", value: display(invoiceSummary.invoiceDate) },
    { label: "Exporter", value: display(invoiceSummary.exporter) },
    { label: "Consignee", value: display(invoiceSummary.consignee) },
    { label: "Destination Country", value: display(invoiceSummary.destinationCountry) },
    { label: "Destination Code", value: display(invoiceSummary.destinationCountryCode) },
    { label: "Incoterms", value: display(invoiceSummary.incoterms) },
    { label: "Currency", value: display(currency) },
    {
      label: "Invoice Value",
      value: escapeHtml(formatInvoiceValueDisplay(invoiceSummary.invoiceValue, currency)),
    },
    { label: "Line Items", value: display(invoiceSummary.lineItemCount) },
    { label: "Unique HS Codes", value: display(invoiceSummary.uniqueHsCodeCount) },
    {
      label: "Countries of Origin",
      value: escapeHtml(formatOriginCountriesList(invoiceSummary.countriesOfOrigin)),
    },
  ];

  const shipmentRows = [
    {
      label: "Gross Weight",
      value: formatWeight(shipmentSummary.grossWeightTotal, shipmentSummary.grossWeightUnit),
    },
    {
      label: "Net Weight",
      value: formatWeight(shipmentSummary.netWeightTotal, shipmentSummary.netWeightUnit),
    },
    { label: "Packages (Colli)", value: display(shipmentSummary.packageCount) },
    { label: "Pallets", value: display(shipmentSummary.palletCount) },
    {
      label: "Declaration Package Count",
      value: display(shipmentSummary.declarationPackageCount),
    },
    {
      label: "Declaration Package Type",
      value: display(shipmentSummary.declarationPackageType),
    },
  ];

  if (shipmentDiag) {
    shipmentRows.push(
      { label: "Shipment Primary Source", value: display(shipmentDiag.primarySource) },
      {
        label: "Available Sources",
        value: display(shipmentDiag.availableSources.join(", ")),
      },
      {
        label: "Provider Message",
        value: display(shipmentDiag.providerMessage ?? "—"),
      }
    );
  }

  const deliveryRows = [
    { label: "Company", value: display(deliveryAddress.company) },
    { label: "Address", value: display(deliveryAddress.address) },
    { label: "City", value: display(deliveryAddress.city) },
    { label: "Postal Code", value: display(deliveryAddress.postalCode) },
    { label: "Country", value: display(deliveryAddress.country) },
    { label: "Country Code", value: display(deliveryAddress.countryCode) },
  ];

  const originAnalysisRows = [
    {
      label: "Invoice Countries of Origin",
      value: escapeHtml(formatOriginCountriesList(invoiceSummary.countriesOfOrigin)),
    },
    {
      label: "HS Aggregation Origin Countries",
      value: display(hsAggregationReport.originCountriesDetected ?? "—"),
    },
    {
      label: "Preferential Origin Status",
      value: display(preferenceOrigin.preferentialOriginStatus),
    },
    { label: "Mixed Origin", value: preferenceOrigin.mixedOrigin ? "Yes" : "No" },
    {
      label: "Preferential Summary",
      value: display(preferenceOrigin.preferentialOriginSummary),
    },
  ];

  const preferenceRows = [
    { label: "Preference Scheme", value: display(preferenceOrigin.schemeLabel) },
    { label: "Document Status", value: display(preferenceOrigin.preferentialOriginStatus) },
    { label: "Status", value: display(preferenceOrigin.status) },
    { label: "Recommendation", value: display(preferenceOrigin.recommendation) },
    {
      label: "Origin Declaration Found",
      value: preferenceOrigin.originDeclarationFound ? "Yes" : "No",
    },
    {
      label: "EUR.1 Recommended",
      value: preferenceOrigin.eur1Recommended ? "Yes" : "No",
    },
    {
      label: "Authorised Exporter",
      value: display(preferenceOrigin.authorisedExporterNumber ?? "—"),
    },
    {
      label: "Required Documents",
      value: display(
        preferenceOrigin.requiredDocuments.length > 0
          ? preferenceOrigin.requiredDocuments.join("; ")
          : "—"
      ),
    },
  ];

  const confidenceRows = [
    { label: "OCR Quality (confidence)", value: `${report.confidence.ocrQuality}%` },
    { label: "Data Completeness", value: `${report.confidence.dataCompleteness}%` },
    { label: "Overall Confidence", value: `${report.confidence.overallConfidence}%` },
  ];

  const ocrRows = ocr
    ? [
        { label: "OCR Provider", value: display(ocr.ocrProvider) },
        { label: "OCR Pages", value: display(ocr.pageCount) },
        { label: "OCR Quality Score", value: `${ocr.ocrQualityScore}%` },
        { label: "OCR Cost", value: formatUsd(ocr.estimatedOcrCostUsd) },
        { label: "Cost Per Page", value: formatUsd(ocr.costPerPageUsd) },
        { label: "Extraction Source", value: display(ocr.extractionSource) },
        { label: "OCR Text Length", value: display(ocr.ocrTextLength.toLocaleString()) },
        { label: "Items Extracted", value: display(ocr.itemsExtracted) },
        { label: "Items With HS Code", value: display(ocr.itemsWithHsCode) },
        {
          label: "Items With Country of Origin",
          value: display(ocr.itemsWithCountryOfOrigin),
        },
        { label: "Items With Line Total", value: display(ocr.itemsWithLineTotal) },
      ]
    : [{ label: "OCR Diagnostics", value: "Not available for this audit." }];

  const mrn = hsAggregationReport.mrnSummary;
  const enterpriseRows = [
    { label: "MRN Export Ready", value: report.mrnExportReady ? "Yes" : "No" },
    { label: "Total Goods Lines", value: display(mrn.totalGoodsLines) },
    { label: "Unique HS Codes", value: display(mrn.uniqueHsCodes) },
    {
      label: "Total Invoice Value",
      value: `${escapeHtml(currency)} ${formatNumber(mrn.totalInvoiceValue)}`,
    },
    {
      label: "Total Net Weight",
      value: mrn.totalNetWeight != null ? `${formatNumber(mrn.totalNetWeight, 3)} kg` : "—",
    },
    {
      label: "Total Gross Weight",
      value: mrn.totalGrossWeight != null ? `${formatNumber(mrn.totalGrossWeight, 3)} kg` : "—",
    },
    {
      label: "MRN Origin Countries",
      value: escapeHtml(formatOriginCountriesList(mrn.countriesOfOrigin)),
    },
    { label: "Customs Disposition", value: display(report.customsDisposition) },
    { label: "Export Summary", value: display(report.exportSummary) },
  ];

  const hsAggregationRows = hsAggregationReport.hsAggregation.map((row: HsAggregationRow) => [
    display(row.hsCode),
    display(row.totalQuantity),
    `${escapeHtml(currency)} ${formatNumber(row.totalValue)}`,
    row.totalNetWeight != null ? `${formatNumber(row.totalNetWeight, 3)} kg` : "—",
    escapeHtml(formatOriginCountriesList(row.countriesOfOrigin)),
    display(row.sourcePositions.join(", ")),
  ]);

  const traceabilityRows = hsAggregationReport.traceabilityLines.map((line) => [
    display(line.positionNumber),
    display(line.hsCode),
    display(line.description),
    display(line.quantity),
    `${escapeHtml(currency)} ${formatNumber(line.value)}`,
    line.netWeight != null ? formatNumber(line.netWeight, 3) : "—",
    display(line.countryOfOrigin),
    display(line.preferentialOrigin),
  ]);

  const lineOriginRows = preferenceOrigin.lineItems.map((line) => [
    display(line.position_number),
    display(line.country_of_origin),
    display(line.preferential_origin),
    display(line.preference_reason),
    display(line.preference_source.replace(/_/g, " ")),
  ]);

  const issueRows = report.issues.map((issue) => [
    display(issue.type),
    display(issue.field ?? "—"),
    display(issue.message),
  ]);

  const missingFieldRows = report.missingFields.map((field) => [display(field)]);

  const actionRows = report.recommendedActions.map((action) => [
    display(action.priority),
    display(action.title),
    display(action.description),
  ]);

  const supportingDocRows = report.supportingDocumentsDetected.map((doc) => [
    display(doc.kind),
    display(doc.label),
  ]);

  const hsCodesList = report.hsCodesDetected.length
    ? report.hsCodesDetected.map((code) => `<li>${display(code)}</li>`).join("")
    : `<li class="muted">None detected</li>`;

  const allocation = preferenceOrigin.mixedOriginTotals ?? preferenceOrigin.preferentialAllocation;
  let mixedOriginHtml = "";
  if (preferenceOrigin.mixedOrigin && allocation?.isMixed) {
    mixedOriginHtml = kvSection("Mixed Origin Allocation", [
      {
        label: "Preferential Quantity",
        value: display(allocation.preferentialQuantity),
      },
      {
        label: "Preferential Value",
        value: `${escapeHtml(currency)} ${formatNumber(allocation.preferentialValue)}`,
      },
      {
        label: "Preferential Weight",
        value:
          allocation.preferentialWeight != null
            ? `${formatNumber(allocation.preferentialWeight, 3)} kg`
            : "—",
      },
      {
        label: "Non-Preferential Quantity",
        value: display(allocation.nonPreferentialQuantity),
      },
      {
        label: "Non-Preferential Value",
        value: `${escapeHtml(currency)} ${formatNumber(allocation.nonPreferentialValue)}`,
      },
      {
        label: "Non-Preferential Weight",
        value:
          allocation.nonPreferentialWeight != null
            ? `${formatNumber(allocation.nonPreferentialWeight, 3)} kg`
            : "—",
      },
    ]);
  }

  let nonPrefExportHtml = "";
  if (
    preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT" &&
    hsAggregationReport.nonPreferentialExportSummary
  ) {
    const row = hsAggregationReport.nonPreferentialExportSummary;
    nonPrefExportHtml = kvSection(row.displayLabel ?? NON_PREFERENTIAL_EXPORT_LABEL, [
      { label: "Quantity", value: display(row.totalQuantity) },
      {
        label: "Value",
        value: `${escapeHtml(currency)} ${formatNumber(row.totalValue)}`,
      },
      {
        label: "Weight",
        value:
          row.totalNetWeight != null
            ? `${formatNumber(row.totalNetWeight, 3)} kg`
            : "Weight allocation unavailable",
      },
      { label: "Source Positions", value: display(row.sourcePositions.join(", ")) },
    ]);
  }

  const filingList = report.filingRecommendations.length
    ? `<ul>${report.filingRecommendations.map((item) => `<li>${display(item)}</li>`).join("")}</ul>`
    : `<p class="muted">None</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Export Auditor Validation — ${escapeHtml(invoiceSummary.invoiceNumber || report.fileName)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 32px 40px; line-height: 1.45; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 0 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .banner { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; color: #92400e; }
    .meta { color: #64748b; font-size: 11px; margin-bottom: 20px; }
    .block { margin-bottom: 22px; page-break-inside: avoid; }
    .page-break { page-break-before: always; }
    table.kv { width: 100%; border-collapse: collapse; }
    table.kv th { text-align: left; width: 34%; padding: 6px 10px 6px 0; vertical-align: top; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; }
    table.kv td { padding: 6px 0; font-weight: 600; color: #0f172a; }
    table.data { width: 100%; border-collapse: collapse; font-size: 11px; }
    table.data th, table.data td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
    table.data th { background: #f8fafc; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .muted { color: #64748b; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    .brand { margin-top: 28px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    @media print {
      body { margin: 16px 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <p class="banner"><strong>Temporary Golden Invoice Review Export</strong> — Save via Print → Save as PDF. Compare against source invoice PDF.</p>
  <h1>Export Auditor Validation Report</h1>
  <p class="meta">ExportGateway · ${escapeHtml(generatedAt.toLocaleString())}</p>

  ${kvSection("Report Metadata", metaRows)}
  ${kvSection("Invoice Summary", invoiceRows)}
  ${kvSection("Shipment Summary", shipmentRows)}
  ${kvSection("Delivery Address", deliveryRows)}

  <div class="page-break"></div>
  ${kvSection("Origin Analysis", originAnalysisRows)}
  ${dataTable(
    "Line-Level Origin & Preference",
    ["Position", "Country of Origin", "Preferential", "Reason", "Source"],
    lineOriginRows
  )}
  ${kvSection("Preference Origin Analysis", preferenceRows)}

  ${mixedOriginHtml}
  ${nonPrefExportHtml}
  ${preferenceAggregationTable(
    "Preferential HS Aggregation",
    hsAggregationReport.preferentialSummary,
    currency
  )}
  ${preferenceAggregationTable(
    "Non-Preferential HS Aggregation",
    hsAggregationReport.nonPreferentialSummary,
    currency
  )}
  ${preferenceAggregationTable(
    "Unknown Preference HS Aggregation",
    hsAggregationReport.unknownPreferenceSummary,
    currency
  )}

  <div class="page-break"></div>
  ${dataTable(
    "HS Aggregation",
    ["HS Code", "Quantity", "Value", "Net Weight", "Origin Countries", "Source Positions"],
    hsAggregationRows
  )}
  ${dataTable(
    "Position Traceability (All Lines)",
    [
      "Position",
      "HS Code",
      "Description",
      "Quantity",
      "Value",
      "Net Weight",
      "Country of Origin",
      "Preferential",
    ],
    traceabilityRows
  )}

  <div class="page-break"></div>
  ${kvSection("Confidence Scores", confidenceRows)}
  ${kvSection("OCR Diagnostics", ocrRows)}
  ${kvSection("Enterprise Summaries", enterpriseRows)}

  <section class="block">
    <h2>HS Codes Detected</h2>
    <ul>${hsCodesList}</ul>
  </section>

  <section class="block">
    <h2>Filing Recommendations</h2>
    ${filingList}
  </section>

  ${dataTable("Issues Detected", ["Severity", "Field", "Message"], issueRows)}
  ${dataTable("Missing Fields", ["Field"], missingFieldRows)}
  ${dataTable("Recommended Actions", ["Priority", "Title", "Description"], actionRows)}
  ${dataTable("Supporting Documents", ["Kind", "Label"], supportingDocRows)}

  <p class="brand">Export Auditor ${escapeHtml(EXPORT_AUDITOR_VERSION)} · Golden Invoice Review Export (temporary)</p>
  <p class="no-print muted">Close this tab after saving the PDF.</p>
  <script>
    window.addEventListener("load", function () {
      window.focus();
      window.print();
    });
  </script>
</body>
</html>`;
}

function printHtmlViaHiddenIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  window.setTimeout(() => iframe.remove(), 60_000);
}

export function exportValidationPdf(report: ExportAuditReport): void {
  if (typeof window === "undefined") return;

  const generatedAt = new Date();
  const html = buildValidationReportHtml(report, generatedAt);

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank");

  if (!printWindow) {
    URL.revokeObjectURL(url);
    printHtmlViaHiddenIframe(html);
    return;
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** @internal Test hook */
export function buildValidationReportHtmlForTest(
  report: ExportAuditReport,
  generatedAt = new Date()
): string {
  return buildValidationReportHtml(report, generatedAt);
}
