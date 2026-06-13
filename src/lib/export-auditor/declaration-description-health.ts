import { normalizeDeclarationDescriptionSource } from "@/lib/export-auditor/declaration-description-display";
import type {
  DeclarationDescriptionSource,
  DeclarationLanguage,
  ExportAuditReport,
  PositionTraceabilityLine,
} from "@/lib/export-auditor/types";

export interface DeclarationDescriptionEngineHealth {
  provider: "OpenAI" | "Rule Based";
  status: "Active" | "Fallback";
  cacheEnabled: boolean;
  openaiConfigured: boolean;
  model: string | null;
}

export interface DescriptionSourceCounts {
  aiGenerated: number;
  hsLibrary: number;
  userApproved: number;
  ruleBased: number;
  total: number;
}

export function getDeclarationDescriptionEngineHealth(): DeclarationDescriptionEngineHealth {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    openaiConfigured,
    provider: openaiConfigured ? "OpenAI" : "Rule Based",
    status: openaiConfigured ? "Active" : "Fallback",
    cacheEnabled: true,
    model: openaiConfigured ? (process.env.OPENAI_MODEL ?? "gpt-4o-mini") : null,
  };
}

export function emptyDescriptionSourceCounts(): DescriptionSourceCounts {
  return {
    aiGenerated: 0,
    hsLibrary: 0,
    userApproved: 0,
    ruleBased: 0,
    total: 0,
  };
}

export function countDescriptionSources(
  sources: Array<DeclarationDescriptionSource | string>
): DescriptionSourceCounts {
  const counts = emptyDescriptionSourceCounts();

  for (const raw of sources) {
    const source = normalizeDeclarationDescriptionSource(raw);
    switch (source) {
      case "ai_generated":
        counts.aiGenerated += 1;
        break;
      case "hs_library":
        counts.hsLibrary += 1;
        break;
      case "user_edited":
        counts.userApproved += 1;
        break;
      case "rule_based":
        counts.ruleBased += 1;
        break;
      default:
        counts.ruleBased += 1;
        break;
    }
    counts.total += 1;
  }

  return counts;
}

function resolveLineSource(
  line: PositionTraceabilityLine,
  language: DeclarationLanguage
): DeclarationDescriptionSource | null {
  const byLanguage = line.declarationDescriptionsByLanguage?.[language];
  if (byLanguage?.source) {
    return normalizeDeclarationDescriptionSource(byLanguage.source);
  }
  if (line.declarationDescriptionSource) {
    return normalizeDeclarationDescriptionSource(line.declarationDescriptionSource);
  }
  return null;
}

/** Count description sources already stored on traceability lines for a language. */
export function countDescriptionSourcesFromReport(
  report: ExportAuditReport,
  language: DeclarationLanguage
): DescriptionSourceCounts {
  const lines = report.hsAggregationReport?.traceabilityLines ?? [];
  const sources = lines
    .map((line) => resolveLineSource(line, language))
    .filter((source): source is DeclarationDescriptionSource => source != null);
  return countDescriptionSources(sources);
}
