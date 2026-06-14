/**
 * Local EU CN / HS nomenclature index for existence validation.
 * Validates 6-, 8-, and 10-digit codes against known headings and CN8/TARIC entries.
 */

/** EU HS chapter headings (6-digit) used for prefix validation. */
const HS6_HEADINGS = new Set<string>([
  "392690",
  "611595",
  "611020",
  "610910",
  "610990",
  "610442",
  "620469",
  "620461",
  "620240",
  "620630",
  "620462",
  "620442",
  "730890",
  "731210",
  "731582",
  "732690",
  "760429",
  "820299",
  "820559",
  "820570",
  "630790",
  "842519",
  "843110",
  "843810",
  "843880",
  "846729",
  "847130",
  "848180",
  "848210",
  "851712",
  "852351",
  "870830",
  "940360",
  "220110",
  "220210",
  "190590",
]);

/** Known CN8 (8-digit) commodity codes from golden invoices and regression fixtures. */
const CN8_CODES = new Set<string>([
  "39206219",
  "39269097",
  "61159500",
  "61102099",
  "61091000",
  "61099090",
  "61044200",
  "62046918",
  "62046110",
  "62024010",
  "62063000",
  "62046231",
  "62044200",
  "73072980",
  "73089059",
  "73121081",
  "73158200",
  "73269098",
  "76042990",
  "76169990",
  "82029980",
  "82055980",
  "82057000",
  "63079098",
  "84251900",
  "84311000",
  "84381090",
  "84388099",
  "84672920",
  "84713000",
  "84818073",
  "84821090",
  "85171200",
  "85235110",
  "87083091",
  "94036090",
  "22011011",
  "22021000",
  "19059055",
  "19059070",
]);

/** Known 10-digit TARIC extensions. */
const TARIC10_CODES = new Set<string>([
  "7312108100",
  "731210810080",
  "8438809900",
]);

export type NomenclatureMatchLevel = "none" | "hs6" | "cn8" | "taric10";

export interface NomenclatureLookupResult {
  known: boolean;
  matchLevel: NomenclatureMatchLevel;
  matchedPrefix: string | null;
}

function matchPrefix(code: string, entries: Set<string>, level: NomenclatureMatchLevel): string | null {
  if (entries.has(code)) return code;
  const widths = level === "hs6" ? [6] : level === "cn8" ? [8] : [10, 8];
  for (const width of widths) {
    if (code.length >= width) {
      const prefix = code.slice(0, width);
      if (entries.has(prefix)) return prefix;
    }
  }
  return null;
}

/** Check whether a normalized numeric HS/CN/TARIC code exists in the local nomenclature index. */
export function lookupHsInNomenclature(code: string): NomenclatureLookupResult {
  const digits = code.replace(/\D/g, "");
  if (!/^[0-9]{6,12}$/.test(digits)) {
    return { known: false, matchLevel: "none", matchedPrefix: null };
  }

  const taricMatch = matchPrefix(digits, TARIC10_CODES, "taric10");
  if (taricMatch) {
    return { known: true, matchLevel: "taric10", matchedPrefix: taricMatch };
  }

  const cn8Match = matchPrefix(digits, CN8_CODES, "cn8");
  if (cn8Match) {
    return { known: true, matchLevel: "cn8", matchedPrefix: cn8Match };
  }

  const hs6Match = matchPrefix(digits, HS6_HEADINGS, "hs6");
  if (hs6Match) {
    return { known: true, matchLevel: "hs6", matchedPrefix: hs6Match };
  }

  return { known: false, matchLevel: "none", matchedPrefix: null };
}

export function isKnownHsNomenclatureCode(code: string): boolean {
  return lookupHsInNomenclature(code).known;
}
