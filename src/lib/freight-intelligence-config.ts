/** Public-facing Freight Intelligence stats — update here for marketing copy changes */
export const FREIGHT_INTELLIGENCE_STATS = {
  historicalShipments: 7849,
  freightCorridors: 23,
  countries: 11,
  capabilities: ["Fuel & Toll Modelling", "Mapbox Route Intelligence"] as const,
} as const;

export function formatFreightStatCount(value: number): string {
  return `${value.toLocaleString("de-DE")}+`;
}
