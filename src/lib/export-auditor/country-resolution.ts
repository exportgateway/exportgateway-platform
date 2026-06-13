/** Shared Balkan / EU country name and postal resolution for consignee and delivery blocks. */
export const POSTAL_PREFIX_COUNTRIES: Record<string, { code: string; name: string }> = {
  MK: { code: "MK", name: "North Macedonia" },
  RS: { code: "RS", name: "Serbia" },
  BA: { code: "BA", name: "Bosnia and Herzegovina" },
  AL: { code: "AL", name: "Albania" },
  XK: { code: "XK", name: "Kosovo" },
  ME: { code: "ME", name: "Montenegro" },
  SI: { code: "SI", name: "Slovenia" },
  HR: { code: "HR", name: "Croatia" },
  AT: { code: "AT", name: "Austria" },
  DE: { code: "DE", name: "Germany" },
  IT: { code: "IT", name: "Italy" },
  FR: { code: "FR", name: "France" },
  ES: { code: "ES", name: "Spain" },
  RO: { code: "RO", name: "Romania" },
  CZ: { code: "CZ", name: "Czech Republic" },
  SK: { code: "SK", name: "Slovakia" },
  PL: { code: "PL", name: "Poland" },
  HU: { code: "HU", name: "Hungary" },
  GB: { code: "GB", name: "United Kingdom" },
};

export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  serbia: "RS",
  srbija: "RS",
  "north macedonia": "MK",
  makedonija: "MK",
  slovenia: "SI",
  slovenija: "SI",
  croatia: "HR",
  hrvatska: "HR",
  bosnia: "BA",
  "bosnia and herzegovina": "BA",
  albania: "AL",
  montenegro: "ME",
  "crna gora": "ME",
  kosovo: "XK",
  austria: "AT",
  österreich: "AT",
  germany: "DE",
  deutschland: "DE",
  italy: "IT",
  italia: "IT",
  france: "FR",
  francia: "FR",
  spain: "ES",
  españa: "ES",
  espana: "ES",
  romania: "RO",
  "czech republic": "CZ",
  czechia: "CZ",
  "česko": "CZ",
  cesko: "CZ",
  slovakia: "SK",
  slovensko: "SK",
  poland: "PL",
  polska: "PL",
  hungary: "HU",
  magyarország: "HU",
  magyarorszag: "HU",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
};

/** Known consignee cities → destination country (informational fallback). */
const CITY_TO_COUNTRY: Record<string, string> = {
  "novi sad": "RS",
  beograd: "RS",
  belgrade: "RS",
  skopje: "MK",
  sarajevo: "BA",
  zagreb: "HR",
  ljubljana: "SI",
};

export function resolveCountryFromLine(line: string): {
  country: string | null;
  country_code: string | null;
} {
  const trimmed = line.trim();
  if (!trimmed) return { country: null, country_code: null };

  const prefixMatch = trimmed.match(/\b(MK|RS|BA|AL|XK|ME|SI|HR|AT|DE|IT|FR|ES|RO|CZ|SK|PL|HU|GB)-(\d{4,5})\b/i);
  if (prefixMatch) {
    const mapped = POSTAL_PREFIX_COUNTRIES[prefixMatch[1].toUpperCase()];
    if (mapped) {
      return { country: mapped.name, country_code: mapped.code };
    }
  }

  const lower = trimmed.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (lower === name || new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(lower)) {
      const countryName = POSTAL_PREFIX_COUNTRIES[code]?.name ?? name;
      return { country: countryName, country_code: code };
    }
  }

  const cityPostal = trimmed.match(/^(\d{4,5})\s+(.+)$/);
  if (cityPostal) {
    const cityPart = cityPostal[2].trim().toLowerCase();
    for (const [city, code] of Object.entries(CITY_TO_COUNTRY)) {
      if (cityPart.includes(city)) {
        const mapped = POSTAL_PREFIX_COUNTRIES[code];
        if (mapped) return { country: mapped.name, country_code: mapped.code };
      }
    }
    const postal = parseInt(cityPostal[1], 10);
    if (postal >= 11000 && postal <= 39999 && /novi|beograd|niš|nis|kragujevac/i.test(cityPart)) {
      return { country: "Serbia", country_code: "RS" };
    }
  }

  for (const [city, code] of Object.entries(CITY_TO_COUNTRY)) {
    if (new RegExp(`\\b${escapeRegExp(city)}\\b`, "i").test(lower)) {
      const mapped = POSTAL_PREFIX_COUNTRIES[code];
      if (mapped) return { country: mapped.name, country_code: mapped.code };
    }
  }

  return { country: null, country_code: null };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveCountryFromText(text: string | null | undefined): {
  country: string | null;
  country_code: string | null;
} {
  const raw = text?.trim() ?? "";
  if (!raw) return { country: null, country_code: null };

  const lines = raw.split(/[\n,;]+/).map((part) => part.trim()).filter(Boolean);
  for (const line of [...lines].reverse()) {
    const resolved = resolveCountryFromLine(line);
    if (resolved.country_code) return resolved;
  }

  return resolveCountryFromLine(raw);
}
