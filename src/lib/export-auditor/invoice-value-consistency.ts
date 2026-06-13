/**
 * Collect canonical invoice value from every report surface for consistency tests.
 */
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { buildMrnExportHeader } from "@/lib/export-auditor/mrn-export";
import { formatInvoiceValueDisplay } from "@/lib/export-auditor/parse-locale-number";

export interface InvoiceValueSurface {
  id: string;
  amount: number;
  display: string;
}

/** All UI/data surfaces that must show the same invoice total. */
export function collectInvoiceValueSurfaces(report: ExportAuditReport): InvoiceValueSurface[] {
  const { invoiceSummary, shipmentSummary, hsAggregationReport } = report;
  const currency = invoiceSummary.currency;
  const canonical = invoiceSummary.invoiceValue;

  const mrnHeader = buildMrnExportHeader(invoiceSummary, shipmentSummary, currency);

  return [
    {
      id: "executiveSummary",
      amount: canonical,
      display: formatInvoiceValueDisplay(canonical, currency),
    },
    {
      id: "invoiceSummary",
      amount: canonical,
      display: formatInvoiceValueDisplay(canonical, currency),
    },
    {
      id: "mrnSummary",
      amount: hsAggregationReport.mrnSummary.totalInvoiceValue,
      display: formatInvoiceValueDisplay(
        hsAggregationReport.mrnSummary.totalInvoiceValue,
        currency
      ),
    },
    {
      id: "mrnExportHeader",
      amount: canonical,
      display: mrnHeader.invoiceValue,
    },
    {
      id: "preferentialDecisionInput",
      amount: canonical,
      display: formatInvoiceValueDisplay(canonical, currency),
    },
  ];
}

export function assertInvoiceValueConsistent(
  report: ExportAuditReport,
  expected: number,
  tolerance = 0.01
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  for (const surface of collectInvoiceValueSurfaces(report)) {
    if (Math.abs(surface.amount - expected) > tolerance) {
      mismatches.push(
        `${surface.id}: expected ${expected}, got ${surface.amount} (${surface.display})`
      );
    }
  }

  const uniqueAmounts = new Set(
    collectInvoiceValueSurfaces(report).map((surface) => roundToCents(surface.amount))
  );
  if (uniqueAmounts.size > 1) {
    mismatches.push(
      `cross-section mismatch: ${[...uniqueAmounts].join(", ")}`
    );
  }

  return { ok: mismatches.length === 0, mismatches };
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
