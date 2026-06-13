/**
 * Cross-section shipment and commercial data consistency validation.
 */
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { buildMrnExportHeader } from "@/lib/export-auditor/mrn-export";
import {
  collectInvoiceValueSurfaces,
  assertInvoiceValueConsistent,
} from "@/lib/export-auditor/invoice-value-consistency";
import {
  formatDeclarationPackageCount,
  MANUAL_REVIEW_REQUIRED,
  type DeclarationPackageCount,
} from "@/lib/export-auditor/package-count-decision-engine";

export interface ShipmentDataSurface {
  id: string;
  invoiceNumber: string;
  invoiceValue: number;
  grossWeight: number | null;
  netWeight: number | null;
  packageCount: DeclarationPackageCount | number | null;
  goodsLines: number;
}

function parseWeightFromText(text: string): number | null {
  const match = text.match(/([\d.,]+)\s*kg/i);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseDispositionField(text: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*[:=]\\s*([^\\n]+)`, "i");
  const match = text.match(re);
  return match?.[1]?.trim() ?? null;
}

/** Collect canonical commercial/shipment values from every report surface. */
export function collectShipmentDataSurfaces(report: ExportAuditReport): ShipmentDataSurface[] {
  const { invoiceSummary, shipmentSummary, hsAggregationReport, customsDisposition } = report;
  const currency = invoiceSummary.currency;
  const mrnHeader = buildMrnExportHeader(invoiceSummary, shipmentSummary, currency);
  const declarationCount =
    shipmentSummary.declarationPackageCount ?? shipmentSummary.packageCount;

  const canonical: ShipmentDataSurface = {
    id: "canonical",
    invoiceNumber: invoiceSummary.invoiceNumber,
    invoiceValue: invoiceSummary.invoiceValue,
    grossWeight: shipmentSummary.grossWeightTotal,
    netWeight: shipmentSummary.netWeightTotal,
    packageCount: declarationCount,
    goodsLines: Math.max(
      invoiceSummary.lineItemCount,
      hsAggregationReport.mrnSummary.totalGoodsLines
    ),
  };

  const dispositionInvoice = parseDispositionField(customsDisposition, "Invoice");
  const dispositionGross = parseWeightFromText(
    parseDispositionField(customsDisposition, "Gross Weight") ??
      mrnHeader.grossWeight ??
      ""
  );

  return [
    canonical,
    {
      id: "executiveSummary",
      invoiceNumber: invoiceSummary.invoiceNumber,
      invoiceValue: invoiceSummary.invoiceValue,
      grossWeight: shipmentSummary.grossWeightTotal,
      netWeight: shipmentSummary.netWeightTotal,
      packageCount: declarationCount,
      goodsLines: canonical.goodsLines,
    },
    {
      id: "invoiceSummary",
      invoiceNumber: invoiceSummary.invoiceNumber,
      invoiceValue: invoiceSummary.invoiceValue,
      grossWeight: shipmentSummary.grossWeightTotal,
      netWeight: shipmentSummary.netWeightTotal,
      packageCount: declarationCount,
      goodsLines: invoiceSummary.lineItemCount,
    },
    {
      id: "shipmentSummary",
      invoiceNumber: invoiceSummary.invoiceNumber,
      invoiceValue: invoiceSummary.invoiceValue,
      grossWeight: shipmentSummary.grossWeightTotal,
      netWeight: shipmentSummary.netWeightTotal,
      packageCount: declarationCount,
      goodsLines: canonical.goodsLines,
    },
    {
      id: "mrnSummary",
      invoiceNumber: invoiceSummary.invoiceNumber,
      invoiceValue: hsAggregationReport.mrnSummary.totalInvoiceValue,
      grossWeight: hsAggregationReport.mrnSummary.totalGrossWeight,
      netWeight: hsAggregationReport.mrnSummary.totalNetWeight,
      packageCount: declarationCount,
      goodsLines: hsAggregationReport.mrnSummary.totalGoodsLines,
    },
    {
      id: "customsDisposition",
      invoiceNumber: dispositionInvoice ?? invoiceSummary.invoiceNumber,
      invoiceValue: invoiceSummary.invoiceValue,
      grossWeight: dispositionGross ?? shipmentSummary.grossWeightTotal,
      netWeight: shipmentSummary.netWeightTotal,
      packageCount: declarationCount,
      goodsLines: canonical.goodsLines,
    },
  ];
}

function packageCountsEqual(
  a: DeclarationPackageCount | number | null,
  b: DeclarationPackageCount | number | null
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  return formatDeclarationPackageCount(a) === formatDeclarationPackageCount(b);
}

export function assertShipmentDataConsistent(
  report: ExportAuditReport,
  options: {
    expectedInvoiceValue?: number;
    expectedGrossWeight?: number;
    expectedNetWeight?: number;
    expectedPackageCount?: DeclarationPackageCount | number;
    expectedInvoiceNumber?: string;
    expectedGoodsLines?: number;
    tolerance?: number;
  } = {}
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const tolerance = options.tolerance ?? 0.01;
  const surfaces = collectShipmentDataSurfaces(report);
  const [canonical, ...others] = surfaces;

  if (options.expectedInvoiceValue != null) {
    const valueCheck = assertInvoiceValueConsistent(report, options.expectedInvoiceValue, tolerance);
    if (!valueCheck.ok) {
      mismatches.push(...valueCheck.mismatches);
    }
  } else {
    const valueAmounts = collectInvoiceValueSurfaces(report).map((surface) => surface.amount);
    const uniqueValues = new Set(valueAmounts.map((amount) => roundToCents(amount)));
    if (uniqueValues.size > 1) {
      mismatches.push(`invoice value cross-section mismatch: ${[...uniqueValues].join(", ")}`);
    }
  }

  for (const surface of others) {
    if (surface.invoiceNumber !== canonical.invoiceNumber) {
      mismatches.push(
        `${surface.id} invoiceNumber: expected "${canonical.invoiceNumber}", got "${surface.invoiceNumber}"`
      );
    }
    if (Math.abs(surface.invoiceValue - canonical.invoiceValue) > tolerance) {
      mismatches.push(
        `${surface.id} invoiceValue: expected ${canonical.invoiceValue}, got ${surface.invoiceValue}`
      );
    }
    if (canonical.grossWeight != null && surface.grossWeight != null) {
      if (Math.abs(surface.grossWeight - canonical.grossWeight) > tolerance) {
        mismatches.push(
          `${surface.id} grossWeight: expected ${canonical.grossWeight}, got ${surface.grossWeight}`
        );
      }
    }
    if (canonical.netWeight != null && surface.netWeight != null) {
      if (Math.abs(surface.netWeight - canonical.netWeight) > tolerance) {
        mismatches.push(
          `${surface.id} netWeight: expected ${canonical.netWeight}, got ${surface.netWeight}`
        );
      }
    }
    if (!packageCountsEqual(surface.packageCount, canonical.packageCount)) {
      mismatches.push(
        `${surface.id} packageCount: expected ${formatDeclarationPackageCount(canonical.packageCount)}, got ${formatDeclarationPackageCount(surface.packageCount)}`
      );
    }
    if (surface.goodsLines !== canonical.goodsLines) {
      mismatches.push(
        `${surface.id} goodsLines: expected ${canonical.goodsLines}, got ${surface.goodsLines}`
      );
    }
  }

  if (options.expectedGrossWeight != null && canonical.grossWeight != null) {
    if (Math.abs(canonical.grossWeight - options.expectedGrossWeight) > tolerance) {
      mismatches.push(
        `grossWeight: expected ${options.expectedGrossWeight}, got ${canonical.grossWeight}`
      );
    }
  }
  if (options.expectedNetWeight != null && canonical.netWeight != null) {
    if (Math.abs(canonical.netWeight - options.expectedNetWeight) > tolerance) {
      mismatches.push(
        `netWeight: expected ${options.expectedNetWeight}, got ${canonical.netWeight}`
      );
    }
  }
  if (options.expectedPackageCount != null) {
    if (!packageCountsEqual(canonical.packageCount, options.expectedPackageCount)) {
      mismatches.push(
        `packageCount: expected ${formatDeclarationPackageCount(options.expectedPackageCount)}, got ${formatDeclarationPackageCount(canonical.packageCount)}`
      );
    }
  }
  if (options.expectedInvoiceNumber != null && canonical.invoiceNumber !== options.expectedInvoiceNumber) {
    mismatches.push(
      `invoiceNumber: expected ${options.expectedInvoiceNumber}, got ${canonical.invoiceNumber}`
    );
  }
  if (options.expectedGoodsLines != null && canonical.goodsLines !== options.expectedGoodsLines) {
    mismatches.push(
      `goodsLines: expected ${options.expectedGoodsLines}, got ${canonical.goodsLines}`
    );
  }

  return { ok: mismatches.length === 0, mismatches };
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export { MANUAL_REVIEW_REQUIRED };
