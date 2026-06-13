import {
  FREIGHT_INTELLIGENCE_STATS,
  formatFreightStatCount,
} from "@/lib/freight-intelligence-config";

/** Post-calculation trust strip — exact freight intelligence numbers only */
export function FreightTrustBadge() {
  const { historicalShipments, freightCorridors, countries, capabilities } =
    FREIGHT_INTELLIGENCE_STATS;

  const items = [
    `${historicalShipments.toLocaleString("de-DE")} Historical Shipments`,
    `${freightCorridors} Freight Corridors`,
    `${countries} Countries`,
    ...capabilities,
  ];

  return (
    <div className="border-t border-surface-border bg-slate-50/80 px-5 py-3 sm:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Powered by</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {items.map((item) => (
          <li key={item} className="text-xs font-medium text-slate-600">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Homepage / pre-calc strip — rounded shipment count for marketing */
export function FreightTrustBadgeCompact() {
  const { historicalShipments, freightCorridors, countries } = FREIGHT_INTELLIGENCE_STATS;

  return (
    <p className="text-xs text-slate-500">
      {formatFreightStatCount(historicalShipments)} historical shipments · {freightCorridors} corridors ·{" "}
      {countries} EU countries
    </p>
  );
}
