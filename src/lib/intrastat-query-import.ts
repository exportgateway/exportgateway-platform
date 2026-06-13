import type { ResolvedLocation } from "@/lib/location-types";
import { intrastatPresets } from "@/lib/intrastat-presets";
import { readFreightImport } from "@/lib/intrastat-freight-bridge";

export interface IntrastatQueryImport {
  origin: ResolvedLocation | null;
  destination: ResolvedLocation | null;
  totalCost: string | null;
  source: "query" | "freight-session" | null;
}

function normalizeCity(value: string): string {
  return value.trim().toLowerCase();
}

function findLocationByCity(city: string): ResolvedLocation | null {
  const target = normalizeCity(city);
  for (const preset of intrastatPresets) {
    if (normalizeCity(preset.from.city) === target) return preset.from;
    if (normalizeCity(preset.to.city) === target) return preset.to;
  }
  return null;
}

export function parseIntrastatQueryImport(searchParams: URLSearchParams): IntrastatQueryImport {
  const importFlag = searchParams.get("import");
  const fromFreight = searchParams.get("from") === "freight" || importFlag === "freight";

  if (fromFreight) {
    const session = readFreightImport();
    if (session) {
      return {
        origin: session.origin,
        destination: session.destination,
        totalCost: String(session.freightCost),
        source: "freight-session",
      };
    }
  }

  const fromCity = searchParams.get("from");
  const toCity = searchParams.get("to");
  const cost = searchParams.get("cost");

  if (!fromCity && !toCity && !cost) {
    return { origin: null, destination: null, totalCost: null, source: null };
  }

  const origin = fromCity ? findLocationByCity(fromCity) : null;
  const destination = toCity ? findLocationByCity(toCity) : null;

  return {
    origin,
    destination,
    totalCost: cost,
    source: origin || destination || cost ? "query" : null,
  };
}

export function buildIntrastatImportUrl(
  origin: ResolvedLocation,
  destination: ResolvedLocation,
  freightCost: number
): string {
  const params = new URLSearchParams({
    from: origin.city,
    to: destination.city,
    cost: String(Math.round(freightCost)),
    import: "freight",
  });
  return `/platform/intrastat?${params.toString()}`;
}
