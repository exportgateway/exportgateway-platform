export interface ResolvedLocation {
  id: string;
  label: string;
  city: string;
  postal_code: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
}

export interface LocationSearchResult {
  success: boolean;
  results: ResolvedLocation[];
  detail?: string;
}
