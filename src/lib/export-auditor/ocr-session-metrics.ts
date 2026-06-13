import type { OcrObservability, OcrSessionMetrics } from "@/lib/export-auditor/types";

export function aggregateOcrSessionMetrics(
  observability: OcrObservability[]
): OcrSessionMetrics {
  const invoiceCount = observability.length;
  if (invoiceCount === 0) {
    return {
      invoiceCount: 0,
      totalOcrPages: 0,
      totalOcrCostUsd: 0,
      averageOcrCostPerInvoiceUsd: 0,
      averageOcrQuality: 0,
    };
  }

  const totalOcrPages = observability.reduce((sum, row) => sum + row.pageCount, 0);
  const totalOcrCostUsd = observability.reduce(
    (sum, row) => sum + row.estimatedOcrCostUsd,
    0
  );
  const totalQuality = observability.reduce((sum, row) => sum + row.ocrQualityScore, 0);

  return {
    invoiceCount,
    totalOcrPages,
    totalOcrCostUsd: Number(totalOcrCostUsd.toFixed(6)),
    averageOcrCostPerInvoiceUsd: Number((totalOcrCostUsd / invoiceCount).toFixed(6)),
    averageOcrQuality: Math.round(totalQuality / invoiceCount),
  };
}

export function buildOcrSessionMetricsFromReports(
  reports: Array<{ ocrObservability?: OcrObservability }>
): OcrSessionMetrics {
  const rows = reports
    .map((report) => report.ocrObservability)
    .filter((row): row is OcrObservability => row != null);
  return aggregateOcrSessionMetrics(rows);
}
