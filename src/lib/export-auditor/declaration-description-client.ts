import type {
  DeclarationDescriptionSource,
  DeclarationLanguage,
  ExportAuditReport,
} from "@/lib/export-auditor/types";

export interface DeclarationDescriptionApiResult {
  description: string;
  source: DeclarationDescriptionSource;
}

export interface DeclarationDescriptionApiResponse {
  results: DeclarationDescriptionApiResult[];
}

export interface DeclarationDescriptionApiItem {
  original: string;
  hsCode?: string;
}

/** Client-side batch call to declaration description API. */
export async function fetchDeclarationDescriptions(
  items: DeclarationDescriptionApiItem[],
  languages: DeclarationLanguage[]
): Promise<DeclarationDescriptionApiResult[]> {
  const response = await fetch("/api/export-auditor/declaration-descriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, languages }),
  });

  if (!response.ok) {
    throw new Error(`Declaration description API failed: ${response.status}`);
  }

  const payload = (await response.json()) as DeclarationDescriptionApiResponse;
  return payload.results;
}

/** Prepare report for export by fetching missing declaration descriptions. */
export async function prepareReportForDeclarationExport(
  report: ExportAuditReport,
  language: DeclarationLanguage
): Promise<ExportAuditReport> {
  const lines = report.hsAggregationReport?.traceabilityLines ?? [];
  if (lines.length === 0) return report;

  const needsGeneration = lines.some((line) => {
    const existing = line.declarationDescriptionsByLanguage?.[language];
    return !existing?.description;
  });

  if (!needsGeneration) {
    return report;
  }

  const items = lines.map((line) => ({
    original: line.description,
    hsCode: line.hsCode,
  }));
  const results = await fetchDeclarationDescriptions(items, [language]);

  const traceabilityLines = lines.map((line, index) => {
    const result = results[index];
    const translations = { ...(line.declarationDescriptionsByLanguage ?? {}) };
    translations[language] = {
      description: result.description,
      source: result.source,
    };
    return {
      ...line,
      declarationDescription: result.description,
      declarationDescriptionSource: result.source,
      declarationDescriptionsByLanguage: translations,
    };
  });

  return {
    ...report,
    hsAggregationReport: {
      ...report.hsAggregationReport,
      traceabilityLines,
    },
    declarationDescriptions: traceabilityLines.map((line) => ({
      originalDescription: line.description,
      declarationDescription:
        line.declarationDescriptionsByLanguage?.[language]?.description ?? "",
      language,
      source: line.declarationDescriptionsByLanguage?.[language]?.source ?? "rule_based",
      translations: line.declarationDescriptionsByLanguage,
    })),
  };
}

/** Placeholder hook for future inline user description overrides (localStorage/API). */
export function saveDeclarationDescriptionOverride(
  hsCode: string,
  originalDescription: string,
  userDescription: string,
  language: DeclarationLanguage
): void {
  if (typeof window === "undefined") return;
  const key = `declaration-description-override:${hsCode}:${language}`;
  window.localStorage.setItem(
    key,
    JSON.stringify({ hsCode, originalDescription, userDescription, language })
  );
}
