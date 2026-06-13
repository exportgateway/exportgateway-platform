/** Verified platform intelligence metrics — single source for marketing copy */
export const PLATFORM_METRICS = {
  exportDeclarationsAnalysed: 62000,
  importRecordsIndexed: 17000,
  /** Rounded display for homepage trust sections */
  historicalFreightShipmentsDisplay: 7800,
  euCountriesCovered: 11,
} as const;

export function formatMetricPlus(value: number): string {
  return `${value.toLocaleString("de-DE")}+`;
}

export const homepageTrustStats = [
  {
    value: formatMetricPlus(PLATFORM_METRICS.exportDeclarationsAnalysed),
    label: "Export Declarations Analysed",
  },
  {
    value: formatMetricPlus(PLATFORM_METRICS.importRecordsIndexed),
    label: "Import Records Indexed",
  },
  {
    value: formatMetricPlus(PLATFORM_METRICS.historicalFreightShipmentsDisplay),
    label: "Historical Freight Shipments",
  },
  {
    value: String(PLATFORM_METRICS.euCountriesCovered),
    label: "EU Countries Covered",
  },
] as const;
