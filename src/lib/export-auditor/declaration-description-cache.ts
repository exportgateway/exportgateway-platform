import { createHash } from "crypto";
import { normalizeDeclarationDescriptionSource } from "@/lib/export-auditor/declaration-description-display";
import type {
  DeclarationDescriptionSource,
  DeclarationLanguage,
} from "@/lib/export-auditor/types";

export { normalizeDeclarationDescriptionSource };

export interface CachedDeclarationDescription {
  descriptionHash: string;
  originalDescription: string;
  language: DeclarationLanguage;
  customsDescription: string;
  source: DeclarationDescriptionSource;
  createdAt: string;
}

export interface DeclarationDescriptionCache {
  getCachedDescription(
    hash: string,
    language: DeclarationLanguage
  ): CachedDeclarationDescription | null;
  setCachedDescription(entry: CachedDeclarationDescription): void;
}

/** Normalize invoice wording before hashing (trim, uppercase, collapse spaces). */
export function normalizeDescriptionForHash(original: string): string {
  return original.trim().toUpperCase().replace(/\s+/g, " ");
}

export function hashOriginalDescription(original: string): string {
  const normalized = normalizeDescriptionForHash(original);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function cacheKey(hash: string, language: DeclarationLanguage): string {
  return `${hash}:${language}`;
}

/** In-memory cache for tests and environments without persistent storage. */
export class InMemoryDeclarationDescriptionCache implements DeclarationDescriptionCache {
  private readonly store = new Map<string, CachedDeclarationDescription>();

  getCachedDescription(
    hash: string,
    language: DeclarationLanguage
  ): CachedDeclarationDescription | null {
    return this.store.get(cacheKey(hash, language)) ?? null;
  }

  setCachedDescription(entry: CachedDeclarationDescription): void {
    this.store.set(cacheKey(entry.descriptionHash, entry.language), { ...entry });
  }
}

/** JSON file cache — used on server when SQLite is unavailable. */
export class JsonFileDeclarationDescriptionCache implements DeclarationDescriptionCache {
  private readonly filePath: string;
  private store: Record<string, CachedDeclarationDescription>;

  constructor(filePath = "data/declaration-description-cache.json") {
    this.filePath = filePath;
    this.store = this.readStore();
  }

  private readStore(): Record<string, CachedDeclarationDescription> {
    if (typeof window !== "undefined") {
      return {};
    }
    try {
      const { readFileSync, existsSync, mkdirSync } = require("fs") as typeof import("fs");
      const { dirname } = require("path") as typeof import("path");
      if (!existsSync(this.filePath)) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        return {};
      }
      const raw = readFileSync(this.filePath, "utf8");
      return JSON.parse(raw) as Record<string, CachedDeclarationDescription>;
    } catch {
      return {};
    }
  }

  private persist(): void {
    if (typeof window !== "undefined") {
      return;
    }
    try {
      const { writeFileSync, mkdirSync } = require("fs") as typeof import("fs");
      const { dirname } = require("path") as typeof import("path");
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf8");
    } catch {
      // ignore write failures in read-only environments
    }
  }

  getCachedDescription(
    hash: string,
    language: DeclarationLanguage
  ): CachedDeclarationDescription | null {
    return this.store[cacheKey(hash, language)] ?? null;
  }

  setCachedDescription(entry: CachedDeclarationDescription): void {
    this.store[cacheKey(entry.descriptionHash, entry.language)] = { ...entry };
    this.persist();
  }
}

let defaultCache: DeclarationDescriptionCache | null = null;

/** Default cache — in-memory in browser; JSON file on server (no native SQLite in shared bundle). */
export function getDeclarationDescriptionCache(): DeclarationDescriptionCache {
  if (defaultCache) return defaultCache;

  if (typeof window !== "undefined") {
    defaultCache = new InMemoryDeclarationDescriptionCache();
    return defaultCache;
  }

  defaultCache = new JsonFileDeclarationDescriptionCache();
  return defaultCache;
}

export function setDeclarationDescriptionCache(cache: DeclarationDescriptionCache | null): void {
  defaultCache = cache;
}
