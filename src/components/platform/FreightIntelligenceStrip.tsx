import { Sparkles } from "lucide-react";
import {
  FREIGHT_INTELLIGENCE_STATS,
  formatFreightStatCount,
} from "@/lib/freight-intelligence-config";

export function FreightIntelligenceStrip() {
  const { historicalShipments, freightCorridors, countries, capabilities } =
    FREIGHT_INTELLIGENCE_STATS;

  const items = [
    `${formatFreightStatCount(historicalShipments)} Historical Shipments`,
    `${freightCorridors} Freight Corridors`,
    `${countries} Countries`,
    ...capabilities,
  ];

  return (
    <div className="rounded-xl border border-brand-200/60 bg-gradient-to-r from-brand-50/80 via-white to-cyan-50/50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Powered by Freight Intelligence
        </span>
        <span className="hidden text-slate-300 sm:inline" aria-hidden>
          ·
        </span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {items.map((item) => (
            <li key={item} className="text-xs font-medium text-slate-600">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
