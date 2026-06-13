import {
  calculateIntrastatByAddress,
  calculateIntrastatByCoordinates,
  type IntrastatResponse,
} from "@/lib/platform-api";
import type { ResolvedLocation } from "@/lib/location-types";

export interface IntrastatAllocationInput {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  totalCost: number;
  reportingCountry: string;
}

function hasValidCoordinates(location: ResolvedLocation): boolean {
  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.latitude) <= 90 &&
    Math.abs(location.longitude) <= 180
  );
}

/**
 * Prefer stored coordinates (reliable for presets and location search).
 * Address geocoding is only used when coordinates are unavailable.
 */
export async function calculateIntrastatAllocation(
  input: IntrastatAllocationInput
): Promise<IntrastatResponse> {
  const { origin, destination, totalCost, reportingCountry } = input;

  if (hasValidCoordinates(origin) && hasValidCoordinates(destination)) {
    return calculateIntrastatByCoordinates({
      from_lat: origin.latitude,
      from_lon: origin.longitude,
      to_lat: destination.latitude,
      to_lon: destination.longitude,
      total_cost: totalCost,
      domestic_country: reportingCountry,
    });
  }

  return calculateIntrastatByAddress({
    from_postal_code: origin.postal_code || origin.city,
    from_city: origin.city,
    from_country: origin.country,
    to_postal_code: destination.postal_code || destination.city,
    to_city: destination.city,
    to_country: destination.country,
    total_cost: totalCost,
    domestic_country: reportingCountry,
  });
}
