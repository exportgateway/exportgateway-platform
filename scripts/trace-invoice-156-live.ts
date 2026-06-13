/**
 * Live runtime trace — Invoice_156.pdf through production OCR + local enrichment.
 * Run: npx tsx scripts/trace-invoice-156-live.ts
 */
import fs from "fs";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { resolveDestinationWithDiagnostics } from "../src/lib/export-auditor/destination-country";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import type { NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF =
  process.env.INVOICE_156_PDF ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_156.pdf";
const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

async function main() {
  if (!fs.existsSync(PDF)) {
    console.error("PDF not found:", PDF);
    process.exit(1);
  }

  const buffer = fs.readFileSync(PDF);
  console.log("Step 1: pdf-parse text extraction...");
  const pdfText = await extractPdfText(Buffer.from(buffer));
  console.log("  pdfText length:", pdfText.length);

  console.log("Step 2: POST", BASE + "/export-auditor/ocr");
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), "Invoice_156.pdf");
  const res = await fetch(`${BASE}/export-auditor/ocr`, { method: "POST", body: form });
  console.log("  OCR HTTP status:", res.status);
  if (!res.ok) {
    console.error(await res.text());
    process.exit(1);
  }

  const raw = (await res.json()) as NormalizedInvoice;
  console.log("\n=== 1. RAW OCR JSON (structured fields) ===");
  console.log(
    JSON.stringify(
      {
        invoice_number: raw.invoice_number,
        exporter: raw.exporter,
        consignee: raw.consignee,
        country: raw.country,
        country_code: raw.country_code,
        incoterms: raw.incoterms,
        currency: raw.currency,
        total_value: raw.total_value,
        amount_eur: raw.amount_eur,
        items_count: raw.items?.length ?? 0,
        ocr_text_present: Boolean(raw.ocr_text?.trim()),
        ocr_text_length: raw.ocr_text?.length ?? 0,
        ocr_text_preview: raw.ocr_text?.slice(0, 1200) ?? null,
        shipment_summary: raw.shipment_summary ?? null,
        delivery_address: raw.delivery_address ?? null,
        packing_info: raw.packing_info ?? null,
        footer_text: raw.footer_text ?? null,
      },
      null,
      2
    )
  );

  console.log("\n=== 2. BEFORE enrichInvoiceDocument ===");
  console.log(
    JSON.stringify(
      {
        consignee: raw.consignee,
        consignee_country_inferred: null,
        destination_country: raw.country,
        destination_country_code: raw.country_code,
        gross_weight: raw.shipment_summary?.gross_weight_total ?? null,
        package_count: raw.shipment_summary?.package_count ?? null,
        delivery_address: raw.delivery_address ?? null,
        pdfText_length: pdfText.length,
        pdfText_preview: pdfText.slice(0, 600) || "(empty)",
      },
      null,
      2
    )
  );

  console.log("\nStep 3: enrichInvoiceDocument(raw, pdfText) — same as server-actions.ts");
  const enriched = enrichInvoiceDocument(raw, pdfText);
  const diag = resolveDestinationWithDiagnostics(enriched);

  console.log("\n=== 3. AFTER enrichInvoiceDocument ===");
  console.log(
    JSON.stringify(
      {
        consignee: enriched.consignee,
        destination_country: enriched.country,
        destination_country_code: enriched.country_code,
        destination_source: diag.destinationCountrySource,
        exporter_country: diag.exporterCountry,
        is_eu_destination: diag.isEuDestination,
        gross_weight: enriched.shipment_summary?.gross_weight_total ?? null,
        net_weight: enriched.shipment_summary?.net_weight_total ?? null,
        package_count: enriched.shipment_summary?.package_count ?? null,
        delivery_address: enriched.delivery_address ?? null,
        ocr_text_length_after_merge: enriched.ocr_text?.length ?? 0,
      },
      null,
      2
    )
  );

  const report = mapAuditReportToExportReport(
    enriched,
    {
      audit_status: "WARNING",
      readiness: {
        score: 50,
        status: "WARNING",
        warnings: ["Destination is within the EU customs territory."],
        errors: [],
      },
      preference_origin: { destination_outside_eu: false },
      issues: [
        {
          severity: "warning",
          message: "Destination is within the EU customs territory.",
          field: "EU_DESTINATION",
        },
      ],
      recommended_actions: [],
      summary: "",
    },
    "Invoice_156.pdf"
  );

  console.log("\n=== 4. UI REPORT (mapAuditReportToExportReport output) ===");
  console.log(
    JSON.stringify(
      {
        destinationCountry: report.invoiceSummary.destinationCountry,
        destinationCountryCode: report.invoiceSummary.destinationCountryCode,
        grossWeightTotal: report.shipmentSummary.grossWeightTotal,
        netWeightTotal: report.shipmentSummary.netWeightTotal,
        packageCount: report.shipmentSummary.packageCount,
        deliveryAddress: report.deliveryAddress,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
