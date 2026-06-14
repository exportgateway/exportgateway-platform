/**
 * Declaration Readiness Check — validates key SAD/box fields before filing.
 * Boxes: 8, 14, 15, 17a, 18, 31, 33, 34, 38, 44
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import type {
  DeclarationReadinessField,
  DeclarationReadinessResult,
  ExportAuditReport,
} from "@/lib/export-auditor/types";

export const DECLARATION_READINESS_FIELDS: DeclarationReadinessField[] = [
  { box: "8", label: "Exporter", fieldKey: "exporter" },
  { box: "14", label: "Consignee", fieldKey: "consignee" },
  { box: "15", label: "Country of Dispatch", fieldKey: "dispatch_country" },
  { box: "17a", label: "Country of Destination", fieldKey: "destination_country" },
  { box: "18", label: "Transport at Departure", fieldKey: "transport" },
  { box: "31", label: "Packages and Description", fieldKey: "packages_description" },
  { box: "33", label: "Commodity Code (HS)", fieldKey: "hs_code" },
  { box: "34", label: "Country of Origin", fieldKey: "country_of_origin" },
  { box: "38", label: "Net Mass", fieldKey: "net_mass" },
  { box: "44", label: "Additional Documents", fieldKey: "additional_documents" },
];

function isPresent(value: string | number | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "—";
}

function evaluateFieldPresence(
  field: DeclarationReadinessField,
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): boolean {
  const { invoiceSummary, shipmentSummary, hsAggregationReport, supportingDocumentsDetected } =
    report;

  switch (field.fieldKey) {
    case "exporter":
      return isPresent(invoiceSummary.exporter) && isPresent(invoice.exporter);
    case "consignee":
      return isPresent(invoiceSummary.consignee) && isPresent(invoice.consignee);
    case "dispatch_country":
      return isPresent(invoiceSummary.exporter);
    case "destination_country":
      return (
        isPresent(invoiceSummary.destinationCountryCode) ||
        isPresent(invoiceSummary.destinationCountry)
      );
    case "transport":
      return isPresent(invoice.incoterms) || isPresent(invoiceSummary.incoterms);
    case "packages_description":
      return (
        shipmentSummary.packageCount != null ||
        shipmentSummary.declarationPackageCount != null ||
        (hsAggregationReport.traceabilityLines?.length ?? 0) > 0
      );
    case "hs_code":
      return (
        report.hsWorkflowSummary?.documentHsStatus !== "MISSING" ||
        (report.hsCodesDetected?.length ?? 0) > 0 ||
        (hsAggregationReport.hsAggregation?.length ?? 0) > 0
      );
    case "country_of_origin":
      return (
        invoiceSummary.countriesOfOrigin.length > 0 ||
        hsAggregationReport.mrnSummary.countriesOfOrigin.length > 0
      );
    case "net_mass":
      return (
        shipmentSummary.netWeightTotal != null ||
        shipmentSummary.grossWeightTotal != null ||
        hsAggregationReport.mrnSummary.totalNetWeight != null
      );
    case "additional_documents":
      return (
        supportingDocumentsDetected.length > 0 ||
        isPresent(invoice.vat_article) ||
        Boolean(invoice.origin_declaration_text?.trim())
      );
    default:
      return false;
  }
}

export function evaluateDeclarationReadiness(
  report: ExportAuditReport,
  invoice: NormalizedInvoice
): DeclarationReadinessResult {
  const missingFields: DeclarationReadinessField[] = [];

  for (const field of DECLARATION_READINESS_FIELDS) {
    if (!evaluateFieldPresence(field, report, invoice)) {
      missingFields.push(field);
    }
  }

  const invoiceValue = resolveInvoiceValue(invoice);
  if (!Number.isFinite(invoiceValue) || invoiceValue <= 0) {
    if (!missingFields.some((field) => field.fieldKey === "exporter")) {
      missingFields.push({
        box: "—",
        label: "Invoice Value",
        fieldKey: "invoice_value",
      });
    }
  }

  const ready = missingFields.length === 0;

  return {
    status: ready ? "READY FOR DECLARATION" : "REVIEW REQUIRED",
    missingFields,
    ready,
  };
}
