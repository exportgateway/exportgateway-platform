import type { ResolvedLocation } from "@/lib/location-types";

const STORAGE_KEY = "exportgateway.intrastat-freight-import";

export interface IntrastatFreightImport {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  freightCost: number;
  importedAt: string;
}

export function saveFreightForIntrastat(data: Omit<IntrastatFreightImport, "importedAt">): void {
  if (typeof window === "undefined") return;
  const payload: IntrastatFreightImport = {
    ...data,
    importedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function readFreightImport(): IntrastatFreightImport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IntrastatFreightImport;
  } catch {
    return null;
  }
}

export function clearFreightImport(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
