import type { ApiInvoiceItem } from "@/lib/export-auditor/api-types";
import type { PreferenceOriginAnalysis } from "@/lib/export-auditor/types";

export const ORIGIN_COUNTRIES_NOT_PROVIDED = "NOT PROVIDED";
export const ORIGIN_EU_DECLARED = "EU (Declared)";

export interface OriginCountriesPreferentialContext {
  originDeclarationFound: boolean;
  preferentialOriginYes: boolean;
}

export function buildOriginCountriesContext(
  preferenceOrigin: Pick<
    PreferenceOriginAnalysis,
    "originDeclarationFound" | "preferentialOriginStatus" | "lineItems"
  >
): OriginCountriesPreferentialContext {
  const lineItemsPreferentialYes =
    preferenceOrigin.lineItems.length > 0 &&
    preferenceOrigin.lineItems.every((line) => line.preferential_origin === "YES");
  const preferentialOriginYes =
    preferenceOrigin.preferentialOriginStatus === "CONFIRMED" || lineItemsPreferentialYes;

  return {
    originDeclarationFound: preferenceOrigin.originDeclarationFound,
    preferentialOriginYes,
  };
}

export function hasExplicitCountryOfOrigin(items: ApiInvoiceItem[] | undefined): boolean {
  return countLinesByOriginCountry(items).length > 0;
}

/** Resolve display codes: explicit COO | EU declared | empty (→ NOT PROVIDED). */
export function resolveOriginCountriesDisplay(
  items: ApiInvoiceItem[] | undefined,
  context: OriginCountriesPreferentialContext
): string[] {
  const explicit = countLinesByOriginCountry(items);
  if (explicit.length > 0) {
    return explicit.map(({ countryCode }) => countryCode);
  }

  if (context.originDeclarationFound && context.preferentialOriginYes) {
    return [ORIGIN_EU_DECLARED];
  }

  return [];
}

/** Informational origin summary for aggregation reports. */
export function resolveOriginCountriesDetectedText(
  items: ApiInvoiceItem[] | undefined,
  context: OriginCountriesPreferentialContext
): string | null {
  const display = resolveOriginCountriesDisplay(items, context);
  if (display.length === 0) return null;
  if (display[0] === ORIGIN_EU_DECLARED) return ORIGIN_EU_DECLARED;
  return formatOriginCountriesDetected(items);
}

export function formatOriginCountriesList(codes: string[]): string {
  return codes.length > 0 ? codes.join(", ") : ORIGIN_COUNTRIES_NOT_PROVIDED;
}

export function formatCountryOfOriginField(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") {
    return ORIGIN_COUNTRIES_NOT_PROVIDED;
  }
  return trimmed;
}

export interface OriginCountryLineCount {
  countryCode: string;
  lineCount: number;
}

/** Count invoice line items by country of origin — informational only, not preferential allocation. */
export function countLinesByOriginCountry(
  items: ApiInvoiceItem[] | undefined
): OriginCountryLineCount[] {
  if (!items?.length) return [];

  const counts = new Map<string, number>();
  for (const item of items) {
    const raw = item.country_of_origin?.trim() ?? "";
    if (!raw) continue;
    const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : raw.slice(0, 2).toUpperCase();
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([countryCode, lineCount]) => ({ countryCode, lineCount }))
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}

/** Format: "SI (10 lines), CN (5 lines)" */
export function formatOriginCountriesDetected(
  items: ApiInvoiceItem[] | undefined
): string | null {
  const counts = countLinesByOriginCountry(items);
  if (counts.length === 0) return null;
  return counts
    .map(({ countryCode, lineCount }) => `${countryCode} (${lineCount} line${lineCount === 1 ? "" : "s"})`)
    .join(", ");
}
