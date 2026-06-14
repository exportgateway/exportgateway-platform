/**
 * Extract golden comparison fields from a mapped ExportAuditReport.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import type { GoldenCapturedFields } from "@/lib/export-auditor/golden-dataset/types";

export function extractGoldenCapturedFields(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): GoldenCapturedFields {
  const value = resolveInvoiceValue(invoice);
  const hsCodes = [...new Set(report.hsCodesDetected ?? [])].sort();

  return {
    exporter: report.invoiceSummary.exporter ?? invoice.exporter ?? null,
    consignee: report.invoiceSummary.consignee ?? invoice.consignee ?? null,
    destinationCountry:
      report.invoiceSummary.destinationCountry ?? invoice.country ?? null,
    destinationCountryCode:
      report.invoiceSummary.destinationCountryCode ?? invoice.country_code ?? null,
    invoiceNumber: report.invoiceSummary.invoiceNumber ?? invoice.invoice_number ?? null,
    invoiceValue: Number.isFinite(value) && value > 0 ? value : null,
    currency: report.invoiceSummary.currency ?? invoice.currency ?? null,
    incoterms: report.invoiceSummary.incoterms ?? invoice.incoterms ?? null,
    hsCodes,
    origin: {
      evidenceStatus: report.preferenceOrigin.evidenceStatus ?? null,
      preferentialOriginStatus: report.preferenceOrigin.preferentialOriginStatus ?? null,
      mixedOrigin: report.preferenceOrigin.mixedOrigin ?? false,
    },
    packageCount: (() => {
      const declared = report.shipmentSummary.declarationPackageCount;
      if (typeof declared === "number") return declared;
      if (report.shipmentSummary.packageCount != null) return report.shipmentSummary.packageCount;
      return invoice.shipment_summary?.package_count ?? null;
    })(),
    grossWeight: report.shipmentSummary.grossWeightTotal ?? null,
    netWeight: report.shipmentSummary.netWeightTotal ?? null,
    customsReadiness: report.customsReadiness?.status ?? null,
    declarationReadiness: report.declarationReadiness?.status ?? null,
    dataExtractionCompleteness: report.ocrObservability?.dataExtractionCompleteness ?? null,
    lineCount: invoice.items?.length ?? report.hsAggregationReport?.mrnSummary.totalGoodsLines ?? 0,
  };
}
