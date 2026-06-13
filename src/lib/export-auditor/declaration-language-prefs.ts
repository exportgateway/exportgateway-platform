import type { DeclarationLanguage } from "@/lib/export-auditor/types";

export const DECLARATION_LANGUAGE_STORAGE_KEY = "exportgateway.declarationLanguage";
export const EXPORT_LANGUAGE_OVERRIDE_STORAGE_KEY = "exportgateway.exportLanguageOverride";

export const DECLARATION_LANGUAGE_LABELS: Record<DeclarationLanguage, string> = {
  en: "English",
  si: "Slovenščina",
  hr: "Hrvatski",
  sr: "Srpski",
  de: "Deutsch",
};

export const DECLARATION_LANGUAGES: DeclarationLanguage[] = ["en", "si", "hr", "sr", "de"];

const DEFAULT_LANGUAGE: DeclarationLanguage = "en";

function isDeclarationLanguage(value: string): value is DeclarationLanguage {
  return (DECLARATION_LANGUAGES as string[]).includes(value);
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value == null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore quota / privacy mode
  }
}

export function getDeclarationLanguage(): DeclarationLanguage {
  const stored = readStorage(DECLARATION_LANGUAGE_STORAGE_KEY);
  if (stored && isDeclarationLanguage(stored)) return stored;
  return DEFAULT_LANGUAGE;
}

export function setDeclarationLanguage(language: DeclarationLanguage): void {
  writeStorage(DECLARATION_LANGUAGE_STORAGE_KEY, language);
}

export function getExportLanguageOverride(): DeclarationLanguage | null {
  const stored = readStorage(EXPORT_LANGUAGE_OVERRIDE_STORAGE_KEY);
  if (stored && isDeclarationLanguage(stored)) return stored;
  return null;
}

export function setExportLanguageOverride(language: DeclarationLanguage | null): void {
  writeStorage(EXPORT_LANGUAGE_OVERRIDE_STORAGE_KEY, language);
}

/** Resolve export language — session override wins over account default. */
export function getExportLanguage(override?: DeclarationLanguage | null): DeclarationLanguage {
  if (override && isDeclarationLanguage(override)) return override;
  const sessionOverride = getExportLanguageOverride();
  if (sessionOverride) return sessionOverride;
  return getDeclarationLanguage();
}

export function resolveLanguageFromLabel(label: string): DeclarationLanguage | null {
  const entry = Object.entries(DECLARATION_LANGUAGE_LABELS).find(([, value]) => value === label);
  return entry ? (entry[0] as DeclarationLanguage) : null;
}
