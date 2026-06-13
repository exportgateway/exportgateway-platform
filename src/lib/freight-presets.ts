import type { ResolvedLocation } from "@/lib/location-types";

export interface LanePreset {
  id: string;
  label: string;
  from: ResolvedLocation;
  to: ResolvedLocation;
  weight_kg: number;
  pallets: number;
  loading_meters: number;
  transport_type: "FTL" | "LTL";
}

function loc(
  id: string,
  label: string,
  city: string,
  postal_code: string,
  country: string,
  country_code: string,
  latitude: number,
  longitude: number
): ResolvedLocation {
  return { id, label, city, postal_code, country, country_code, latitude, longitude };
}

export const euLanePresets: LanePreset[] = [
  {
    id: "de-gb",
    label: "Berlin → London",
    from: loc("preset-ber", "10115 Berlin, Germany", "Berlin", "10115", "Germany", "DE", 52.52, 13.405),
    to: loc("preset-lon", "EC1A London, United Kingdom", "London", "EC1A", "United Kingdom", "GB", 51.5074, -0.1278),
    weight_kg: 12000,
    pallets: 33,
    loading_meters: 13.6,
    transport_type: "FTL",
  },
  {
    id: "fr-es",
    label: "Paris → Madrid",
    from: loc("preset-par", "75001 Paris, France", "Paris", "75001", "France", "FR", 48.8566, 2.3522),
    to: loc("preset-mad", "28001 Madrid, Spain", "Madrid", "28001", "Spain", "ES", 40.4168, -3.7038),
    weight_kg: 10000,
    pallets: 30,
    loading_meters: 13.6,
    transport_type: "FTL",
  },
  {
    id: "nl-it",
    label: "Rotterdam → Milan",
    from: loc("preset-rtm", "3011 Rotterdam, Netherlands", "Rotterdam", "3011", "Netherlands", "NL", 51.9244, 4.4777),
    to: loc("preset-mil", "20121 Milan, Italy", "Milan", "20121", "Italy", "IT", 45.4642, 9.19),
    weight_kg: 9000,
    pallets: 28,
    loading_meters: 13.6,
    transport_type: "FTL",
  },
  {
    id: "de-pl",
    label: "Munich → Warsaw",
    from: loc("preset-mu", "80331 Munich, Germany", "Munich", "80331", "Germany", "DE", 48.1351, 11.582),
    to: loc("preset-waw", "00-001 Warsaw, Poland", "Warsaw", "00-001", "Poland", "PL", 52.2297, 21.0122),
    weight_kg: 10000,
    pallets: 34,
    loading_meters: 13.6,
    transport_type: "FTL",
  },
  {
    id: "nl-fr",
    label: "Amsterdam → Paris",
    from: loc("preset-ams", "1012 Amsterdam, Netherlands", "Amsterdam", "1012", "Netherlands", "NL", 52.3676, 4.9041),
    to: loc("preset-par2", "75001 Paris, France", "Paris", "75001", "France", "FR", 48.8566, 2.3522),
    weight_kg: 8500,
    pallets: 24,
    loading_meters: 10.0,
    transport_type: "LTL",
  },
  {
    id: "pl-cz",
    label: "Warsaw → Prague",
    from: loc("preset-waw2", "00-001 Warsaw, Poland", "Warsaw", "00-001", "Poland", "PL", 52.2297, 21.0122),
    to: loc("preset-prg", "110 00 Prague, Czech Republic", "Prague", "110 00", "Czech Republic", "CZ", 50.0755, 14.4378),
    weight_kg: 7500,
    pallets: 18,
    loading_meters: 7.2,
    transport_type: "LTL",
  },
];

export const euCountries = [
  { code: "DE", name: "Germany" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "IT", name: "Italy" },
  { code: "PL", name: "Poland" },
  { code: "SI", name: "Slovenia" },
  { code: "AT", name: "Austria" },
  { code: "CZ", name: "Czech Republic" },
  { code: "BE", name: "Belgium" },
  { code: "HU", name: "Hungary" },
];

export function countryNameFromCode(code: string): string {
  return euCountries.find((c) => c.code === code)?.name ?? code;
}
