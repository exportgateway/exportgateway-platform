"use server";

import { getApiBaseUrl } from "@/lib/api-config";

export interface FreightPriceRequest {
  city_from?: string;
  city_to?: string;
  country_from?: string;
  country_to?: string;
  from_lat?: number;
  from_lon?: number;
  to_lat?: number;
  to_lon?: number;
  weight_kg: number;
  pallets: number;
  loading_meters: number;
  transport_type: "FTL" | "LTL";
}

export interface FreightPriceResponse {
  success: boolean;
  distance_km?: number;
  distance_source?: string;
  price_eur?: number;
  price_range?: [number, number];
  confidence_score?: number;
  warning?: string;
  detail?: string;
  /** Future: similar historical shipment match from backend */
  historical_match?: {
    similar_shipments_count?: number;
    average_historical_price_eur?: number;
    confidence_label?: string;
  };
}

export interface IntrastatAddressRequest {
  from_postal_code: string;
  from_city: string;
  from_country: string;
  to_postal_code: string;
  to_city: string;
  to_country: string;
  total_cost: number;
  domestic_country: string;
}

export interface IntrastatCoordinateRequest {
  from_lat: number;
  from_lon: number;
  to_lat: number;
  to_lon: number;
  total_cost: number;
  domestic_country: string;
}

export interface IntrastatResponse {
  success: boolean;
  total_km?: number;
  domestic_km?: number;
  foreign_km?: number;
  domestic_percent?: number;
  foreign_percent?: number;
  domestic_cost?: number;
  foreign_cost?: number;
  route_summary?: {
    pickup: string;
    delivery: string;
    total_distance: string;
    allocation_country: string;
  };
  route_segments?: Array<{
    segment_type: string;
    coordinates: number[][];
  }>;
  detail?: string;
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
    }
    return `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function calculateFreightPrice(
  payload: FreightPriceRequest
): Promise<FreightPriceResponse> {
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/freight/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, detail: await parseApiError(res) };
    }

    return (await res.json()) as FreightPriceResponse;
  } catch (err) {
    return {
      success: false,
      detail: err instanceof Error ? err.message : "Network error contacting freight API",
    };
  }
}

export async function calculateIntrastatByAddress(
  payload: IntrastatAddressRequest
): Promise<IntrastatResponse> {
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/intrastat/address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, detail: await parseApiError(res) };
    }

    return (await res.json()) as IntrastatResponse;
  } catch (err) {
    return {
      success: false,
      detail: err instanceof Error ? err.message : "Network error contacting Intrastat API",
    };
  }
}

export async function calculateIntrastatByCoordinates(
  payload: IntrastatCoordinateRequest
): Promise<IntrastatResponse> {
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/intrastat/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, detail: await parseApiError(res) };
    }

    return (await res.json()) as IntrastatResponse;
  } catch (err) {
    return {
      success: false,
      detail: err instanceof Error ? err.message : "Network error contacting Intrastat API",
    };
  }
}
