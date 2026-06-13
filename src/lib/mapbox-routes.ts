"use server";

export interface MapboxRouteResult {
  success: boolean;
  coordinates?: [number, number][]; // [lon, lat] GeoJSON order
  distance_km?: number;
  source?: "mapbox" | "straight";
  detail?: string;
}

function getMapboxToken(): string | null {
  return (
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ||
    process.env.MAPBOX_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ||
    null
  );
}

export async function getMapboxRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<MapboxRouteResult> {
  const token = getMapboxToken();

  if (!token) {
    return {
      success: true,
      coordinates: [
        [fromLon, fromLat],
        [toLon, toLat],
      ],
      distance_km: haversineKm(fromLat, fromLon, toLat, toLon),
      source: "straight",
      detail: "Mapbox token not configured — showing direct line.",
    };
  }

  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${fromLon},${fromLat};${toLon},${toLat}` +
      `?alternatives=false&geometries=geojson&overview=full&access_token=${token}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Mapbox Directions failed (${res.status})`);
    }

    const data = (await res.json()) as {
      routes?: Array<{
        distance: number;
        geometry: { coordinates: [number, number][] };
      }>;
    };

    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      throw new Error("No route geometry returned");
    }

    return {
      success: true,
      coordinates: route.geometry.coordinates,
      distance_km: Math.max(route.distance / 1000, 1),
      source: "mapbox",
    };
  } catch (err) {
    return {
      success: true,
      coordinates: [
        [fromLon, fromLat],
        [toLon, toLat],
      ],
      distance_km: haversineKm(fromLat, fromLon, toLat, toLon),
      source: "straight",
      detail: err instanceof Error ? err.message : "Route fetch failed",
    };
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.max(2 * R * Math.asin(Math.sqrt(a)), 1);
}
