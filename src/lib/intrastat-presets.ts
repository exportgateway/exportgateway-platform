import type { ResolvedLocation } from "@/lib/location-types";

export interface IntrastatPreset {
  id: string;
  label: string;
  from: ResolvedLocation;
  to: ResolvedLocation;
  total_cost: string;
  reporting_country: string;
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

/** Quick routes — every preset includes verified fallback coordinates */
export const intrastatPresets: IntrastatPreset[] = [
  {
    id: "ber-lj",
    label: "Berlin → Ljubljana",
    from: loc("is-ber", "Berlin, Germany", "Berlin", "10115", "Germany", "DE", 52.52, 13.405),
    to: loc("is-lj", "Ljubljana, Slovenia", "Ljubljana", "1000", "Slovenia", "SI", 46.0569, 14.5058),
    total_cost: "500",
    reporting_country: "Slovenia",
  },
  {
    id: "rtm-mil",
    label: "Rotterdam → Milan",
    from: loc(
      "is-rtm",
      "Rotterdam, Netherlands",
      "Rotterdam",
      "3011 AA",
      "Netherlands",
      "NL",
      51.9225,
      4.47917
    ),
    to: loc("is-mil", "Milan, Italy", "Milan", "20121", "Italy", "IT", 45.4642, 9.19),
    total_cost: "680",
    reporting_country: "Italy",
  },
  {
    id: "par-mad",
    label: "Paris → Madrid",
    from: loc("is-par", "Paris, France", "Paris", "75001", "France", "FR", 48.8566, 2.3522),
    to: loc("is-mad", "Madrid, Spain", "Madrid", "28001", "Spain", "ES", 40.4168, -3.7038),
    total_cost: "720",
    reporting_country: "Spain",
  },
  {
    id: "vie-lj",
    label: "Vienna → Ljubljana",
    from: loc("is-vie", "Vienna, Austria", "Vienna", "1010", "Austria", "AT", 48.2082, 16.3738),
    to: loc("is-lj2", "Ljubljana, Slovenia", "Ljubljana", "1000", "Slovenia", "SI", 46.0569, 14.5058),
    total_cost: "380",
    reporting_country: "Slovenia",
  },
  {
    id: "waw-prg",
    label: "Warsaw → Prague",
    from: loc("is-waw", "Warsaw, Poland", "Warsaw", "00-001", "Poland", "PL", 52.2297, 21.0122),
    to: loc("is-prg", "Prague, Czech Republic", "Prague", "110 00", "Czech Republic", "CZ", 50.0755, 14.4378),
    total_cost: "450",
    reporting_country: "Czech Republic",
  },
  {
    id: "ham-mu",
    label: "Hamburg → Munich",
    from: loc("is-ham", "Hamburg, Germany", "Hamburg", "20095", "Germany", "DE", 53.5511, 9.9937),
    to: loc("is-mu", "Munich, Germany", "Munich", "80331", "Germany", "DE", 48.1351, 11.582),
    total_cost: "420",
    reporting_country: "Germany",
  },
];
