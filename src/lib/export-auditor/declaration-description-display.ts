import { generateCustomsDescription } from "@/lib/export-auditor/customs-description";
import { sanitizeCommercialDescription } from "@/lib/export-auditor/declaration-description-sanitizer";
import type {
  DeclarationDescriptionSource,
  DeclarationLanguage,
  PositionTraceabilityLine,
} from "@/lib/export-auditor/types";

export const MAX_DECLARATION_DESCRIPTION_LENGTH = 80;

/** Map legacy cache source values to current display sources. */
export function normalizeDeclarationDescriptionSource(
  source: string
): DeclarationDescriptionSource {
  if (source === "cached") return "ai_generated";
  if (source === "rule_fallback") return "rule_based";
  if (source === "user_approved") return "user_edited";
  if (
    source === "hs_library" ||
    source === "ai_generated" ||
    source === "user_edited" ||
    source === "rule_based"
  ) {
    return source;
  }
  return "rule_based";
}

function truncateDeclarationDescription(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_DECLARATION_DESCRIPTION_LENGTH) return trimmed;
  const truncated = trimmed.slice(0, MAX_DECLARATION_DESCRIPTION_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
}

function ruleBasedFallback(original: string): {
  description: string;
  source: DeclarationDescriptionSource;
} {
  return {
    description: truncateDeclarationDescription(
      sanitizeCommercialDescription(generateCustomsDescription(original))
    ),
    source: "rule_based",
  };
}

/** Resolve declaration description from enriched line data (client-safe, no cache/OpenAI). */
export function resolveLineDeclarationDescription(
  line: PositionTraceabilityLine,
  language: DeclarationLanguage
): { description: string; source: DeclarationDescriptionSource } {
  const byLanguage = line.declarationDescriptionsByLanguage?.[language];
  if (byLanguage?.description) {
    return {
      description: byLanguage.description,
      source: normalizeDeclarationDescriptionSource(byLanguage.source),
    };
  }
  if (line.declarationDescription) {
    return {
      description: line.declarationDescription,
      source: normalizeDeclarationDescriptionSource(
        line.declarationDescriptionSource ?? "rule_based"
      ),
    };
  }
  return ruleBasedFallback(line.description);
}

export function formatDeclarationDescriptionSource(
  source: DeclarationDescriptionSource | string
): string {
  const normalized = normalizeDeclarationDescriptionSource(source);
  switch (normalized) {
    case "hs_library":
      return "HS Library";
    case "ai_generated":
      return "AI Generated";
    case "user_edited":
      return "User Approved";
    case "rule_based":
      return "Rule Based";
    default:
      return normalized;
  }
}
