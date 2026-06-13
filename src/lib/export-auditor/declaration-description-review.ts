import { sanitizeCommercialDescription } from "@/lib/export-auditor/declaration-description-sanitizer";
import { lookupHsDeclarationDescription } from "@/lib/export-auditor/hs-description-library";
import type {
  DeclarationDescriptionSource,
  DeclarationLanguage,
} from "@/lib/export-auditor/types";

export interface DescriptionReviewParams {
  original: string;
  declarationDescription: string;
  hsCode?: string;
  language: DeclarationLanguage;
  source: DeclarationDescriptionSource;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "non",
  "rotating",
  "lubricated",
  "en12385",
]);

/** Overly generic customs wording — not useful for product-type matching. */
const GENERIC_PRODUCT_TERMS = new Set([
  "industrial",
  "equipment",
  "product",
  "products",
  "goods",
  "item",
  "items",
  "article",
  "articles",
  "part",
  "parts",
  "component",
  "components",
  "accessory",
  "accessories",
  "misc",
  "miscellaneous",
  "general",
  "other",
  "various",
  "assorted",
]);

/** Related product-type tokens — shared category counts as overlap. */
const RELATED_TOKEN_GROUPS: string[][] = [
  ["oil", "lubricant", "grease", "fluid", "hlp"],
  ["wire", "rope", "cable", "strand", "vrv", "uze", "seil"],
  ["steel", "galvanized", "galvanised", "iron", "metal", "celic", "jeklen", "pocinkana", "pocinkano", "verzinkt"],
  ["hydraulic", "machine", "machinery", "masina", "stroj"],
  ["valve", "ventil"],
  ["reflector", "reflektor"],
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function extractProductTypeTokens(text: string): Set<string> {
  const sanitized = sanitizeCommercialDescription(text);
  return new Set(tokenize(sanitized).filter((token) => !GENERIC_PRODUCT_TERMS.has(token)));
}

function tokensAreRelated(a: string, b: string): boolean {
  if (a === b) return true;
  for (const group of RELATED_TOKEN_GROUPS) {
    if (group.includes(a) && group.includes(b)) return true;
  }
  return false;
}

function hasProductTypeOverlap(originalTokens: Set<string>, candidateTokens: Set<string>): boolean {
  for (const original of originalTokens) {
    for (const candidate of candidateTokens) {
      if (tokensAreRelated(original, candidate)) return true;
    }
  }
  return false;
}

function hasDirectTokenOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (b.has(token)) return true;
  }
  return false;
}

const NON_REVIEW_SOURCES = new Set<DeclarationDescriptionSource>([
  "hs_library",
  "user_edited",
  "rule_based",
]);

/**
 * Flag AI-generated declaration descriptions that diverge from the sanitized
 * invoice line and HS library wording. Informational only — never blocks export.
 */
export function evaluateDescriptionReview(params: DescriptionReviewParams): boolean {
  const { original, declarationDescription, hsCode, language, source } = params;

  if (NON_REVIEW_SOURCES.has(source)) return false;
  if (source !== "ai_generated") return false;

  const declaration = declarationDescription.trim();
  if (!declaration) return false;

  const sanitizedOriginal = sanitizeCommercialDescription(original);
  const originalProductTypes = extractProductTypeTokens(sanitizedOriginal);
  const declarationTokens = extractProductTypeTokens(declaration);

  if (originalProductTypes.size === 0) return false;

  if (hasProductTypeOverlap(originalProductTypes, declarationTokens)) {
    return false;
  }

  if (hsCode) {
    const libraryDescription = lookupHsDeclarationDescription(hsCode, language);
    if (libraryDescription) {
      const libraryTokens = extractProductTypeTokens(libraryDescription);
      if (
        hasProductTypeOverlap(originalProductTypes, libraryTokens) &&
        hasDirectTokenOverlap(libraryTokens, declarationTokens)
      ) {
        return false;
      }
      if (hasProductTypeOverlap(libraryTokens, declarationTokens)) {
        return false;
      }
    }
  }

  return true;
}
