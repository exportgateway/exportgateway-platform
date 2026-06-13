import type { DeclarationLanguage } from "@/lib/export-auditor/types";

type HsDescriptionTranslations = Partial<Record<DeclarationLanguage, string>>;

const HS_DESCRIPTION_LIBRARY: Record<string, HsDescriptionTranslations> = {
  "39269097": {
    en: "Industrial reflector",
    si: "Industrijski reflektor",
    hr: "Industrijski reflektor",
    sr: "Industrijski reflektor",
    de: "Industrieller Reflektor",
  },
  "731210810080": {
    en: "Galvanized steel wire rope",
    si: "Pocinkana jeklena vrv",
    hr: "Pocinkano čelično uže",
    sr: "Pocinkano čelično uže",
    de: "Verzinktes Stahlseil",
  },
  "8438809900": {
    en: "Food processing machinery parts",
    si: "Deli strojev za predelavo hrane",
    hr: "Dijelovi strojeva za preradu hrane",
    sr: "Delovi mašina za preradu hrane",
    de: "Teile für Lebensmittelverarbeitungsmaschinen",
  },
};

function normalizeHsCode(hsCode: string): string {
  return hsCode.replace(/\D/g, "");
}

function resolveLibraryKey(normalizedHs: string): string | null {
  if (HS_DESCRIPTION_LIBRARY[normalizedHs]) {
    return normalizedHs;
  }

  let bestKey: string | null = null;
  for (const key of Object.keys(HS_DESCRIPTION_LIBRARY)) {
    if (normalizedHs.startsWith(key) || key.startsWith(normalizedHs)) {
      if (!bestKey || key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }
  return bestKey;
}

/** Lookup a static HS-based customs declaration description when available. */
export function lookupHsDeclarationDescription(
  hsCode: string,
  language: DeclarationLanguage
): string | null {
  const normalized = normalizeHsCode(hsCode);
  if (!normalized) return null;

  const libraryKey = resolveLibraryKey(normalized);
  if (!libraryKey) return null;

  const translations = HS_DESCRIPTION_LIBRARY[libraryKey];
  return translations[language] ?? translations.en ?? null;
}
