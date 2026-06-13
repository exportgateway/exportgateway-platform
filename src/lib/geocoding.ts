"use server";

import type { LocationSearchResult, ResolvedLocation } from "@/lib/location-types";

const EU_COUNTRY_CODES =
  "at,be,bg,cy,cz,de,dk,ee,es,fi,fr,gr,hr,hu,ie,it,lt,lu,lv,mt,nl,pl,pt,ro,se,si,sk,gb";

const NOMINATIM_HEADERS = {
  "User-Agent": "ExportGateway-Platform/1.0 (trade intelligence; contact@exportgateway.eu)",
  Accept: "application/json",
};

function buildLabel(parts: {
  postal_code?: string;
  city?: string;
  country?: string;
  fallback?: string;
}): string {
  const city = parts.city?.trim();
  const postal = parts.postal_code?.trim();
  const country = parts.country?.trim();

  if (postal && city && country) return `${postal} ${city}, ${country}`;
  if (city && country) return `${city}, ${country}`;
  return parts.fallback?.trim() || "Unknown location";
}

function extractCity(address: Record<string, string | undefined>): string {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.suburb ||
    address.county ||
    ""
  );
}

function parseNominatimResult(item: {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}): ResolvedLocation {
  const address = item.address ?? {};
  const city = extractCity(address);
  const country = address.country ?? "";
  const country_code = (address.country_code ?? "").toUpperCase();
  const postal_code = address.postcode ?? "";

  return {
    id: `nominatim-${item.place_id}`,
    label: buildLabel({
      postal_code,
      city,
      country,
      fallback: item.display_name.split(",").slice(0, 2).join(",").trim(),
    }),
    city,
    postal_code,
    country,
    country_code,
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lon),
  };
}

async function searchNominatim(query: string, limit: number): Promise<ResolvedLocation[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: String(limit),
    countrycodes: EU_COUNTRY_CODES,
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: NOMINATIM_HEADERS,
    cache: "no-store",
  });

  if (!res.ok) return [];

  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    address?: Record<string, string>;
  }>;

  return data.map(parseNominatimResult);
}

async function searchMapbox(query: string, limit: number): Promise<ResolvedLocation[]> {
  const token =
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ||
    process.env.MAPBOX_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) return [];

  const params = new URLSearchParams({
    q: query,
    access_token: token,
    limit: String(limit),
    language: "en",
    country: EU_COUNTRY_CODES.replace(/,/g, ","),
  });

  const res = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
    { cache: "no-store" }
  );

  if (!res.ok) return [];

  const data = (await res.json()) as {
    features?: Array<{
      id: string;
      properties: {
        name?: string;
        full_address?: string;
        place_formatted?: string;
        context?: {
          place?: { name?: string };
          postcode?: { name?: string };
          country?: { name?: string; country_code?: string };
        };
      };
      geometry: { coordinates: [number, number] };
    }>;
  };

  return (data.features ?? []).map((feature) => {
    const ctx = feature.properties.context ?? {};
    const city = ctx.place?.name ?? feature.properties.name ?? "";
    const postal_code = ctx.postcode?.name ?? "";
    const country = ctx.country?.name ?? "";
    const country_code = (ctx.country?.country_code ?? "").toUpperCase();
    const [longitude, latitude] = feature.geometry.coordinates;

    return {
      id: `mapbox-${feature.id}`,
      label: buildLabel({
        postal_code,
        city,
        country,
        fallback: feature.properties.place_formatted ?? feature.properties.full_address ?? city,
      }),
      city,
      postal_code,
      country,
      country_code,
      latitude,
      longitude,
    };
  });
}

export async function searchLocations(
  query: string,
  limit = 5
): Promise<LocationSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { success: true, results: [] };
  }

  try {
    const mapboxResults = await searchMapbox(trimmed, limit);
    if (mapboxResults.length > 0) {
      return { success: true, results: mapboxResults };
    }

    const nominatimResults = await searchNominatim(trimmed, limit);
    return { success: true, results: nominatimResults };
  } catch (err) {
    return {
      success: false,
      results: [],
      detail: err instanceof Error ? err.message : "Location search failed",
    };
  }
}
