import type { DeclarationDescriptionCache } from "@/lib/export-auditor/declaration-description-cache";
import {
  JsonFileDeclarationDescriptionCache,
  InMemoryDeclarationDescriptionCache,
} from "@/lib/export-auditor/declaration-description-cache";

let serverCache: DeclarationDescriptionCache | null = null;

/** Server-side cache — JSON file persistence (no native modules in webpack bundle). */
export function getServerDeclarationDescriptionCache(): DeclarationDescriptionCache {
  if (serverCache) return serverCache;
  serverCache = new JsonFileDeclarationDescriptionCache();
  return serverCache;
}

export function setServerDeclarationDescriptionCache(
  cache: DeclarationDescriptionCache | null
): void {
  serverCache = cache;
}

export { InMemoryDeclarationDescriptionCache };
