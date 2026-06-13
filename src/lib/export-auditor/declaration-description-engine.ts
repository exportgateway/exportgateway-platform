import { generateCustomsDescription } from "@/lib/export-auditor/customs-description";
import {
  hashOriginalDescription,
  normalizeDeclarationDescriptionSource,
  type DeclarationDescriptionCache,
  getDeclarationDescriptionCache,
} from "@/lib/export-auditor/declaration-description-cache";
import {
  MAX_DECLARATION_DESCRIPTION_LENGTH,
  formatDeclarationDescriptionSource,
  resolveLineDeclarationDescription,
} from "@/lib/export-auditor/declaration-description-display";
import {
  type DeclarationDescriptionLearningStore,
  getDeclarationDescriptionLearningStore,
  recordApprovedDescriptionUsage,
} from "@/lib/export-auditor/declaration-description-learning";
import { sanitizeCommercialDescription } from "@/lib/export-auditor/declaration-description-sanitizer";
import { evaluateDescriptionReview } from "@/lib/export-auditor/declaration-description-review";
import { lookupHsDeclarationDescription } from "@/lib/export-auditor/hs-description-library";
import {
  DESCRIPTION_REVIEW_RECOMMENDED,
  DESCRIPTION_REVIEW_RECOMMENDED_MESSAGE,
} from "@/lib/export-auditor/issue-readiness";
import type {
  DeclarationDescriptionEntry,
  DeclarationDescriptionSource,
  DeclarationLanguage,
  ExportAuditReport,
  PositionTraceabilityLine,
} from "@/lib/export-auditor/types";

export type { DeclarationDescriptionSource };

export {
  MAX_DECLARATION_DESCRIPTION_LENGTH,
  formatDeclarationDescriptionSource,
  resolveLineDeclarationDescription,
} from "@/lib/export-auditor/declaration-description-display";

/**
 * Declaration descriptions are declarant assistance only — informational text for Box 31.
 * They must NEVER influence HS classification, origin, preference, or customs liability.
 */
export const DECLARATION_DESCRIPTION_CLASSIFICATION_GUARD =
  "Descriptions are informational only; hsCode, countryOfOrigin, and preferentialOrigin are authoritative.";

export const DECLARATION_LANGUAGE_NAMES: Record<DeclarationLanguage, string> = {
  en: "English",
  si: "Slovenian",
  hr: "Croatian",
  sr: "Serbian",
  de: "German",
};

export interface DeclarationDescriptionResult {
  description: string;
  source: DeclarationDescriptionSource;
  descriptionReviewRecommended?: boolean;
}

export interface BatchDeclarationDescriptionRequest {
  original: string;
  language: DeclarationLanguage;
  hsCode?: string;
}

export interface OpenAiGenerator {
  (originals: string[], language: DeclarationLanguage): Promise<string[]>;
}

function truncateDeclarationDescription(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_DECLARATION_DESCRIPTION_LENGTH) return trimmed;
  const truncated = trimmed.slice(0, MAX_DECLARATION_DESCRIPTION_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
}

function finalizeDescription(text: string): string {
  return truncateDeclarationDescription(sanitizeCommercialDescription(text));
}

function ruleFallback(original: string): DeclarationDescriptionResult {
  return {
    description: finalizeDescription(generateCustomsDescription(original)),
    source: "rule_based",
  };
}

function buildPrompt(original: string, language: DeclarationLanguage): string {
  const languageName = DECLARATION_LANGUAGE_NAMES[language];
  return [
    "You are an experienced EU customs declarant preparing Box 31 goods descriptions for export declarations.",
    "Write like a customs officer — NOT a translator, NOT a marketing writer.",
    `Produce a concise customs declaration description in ${languageName}.`,
    "Rules:",
    "- Maximum 80 characters",
    "- Generic goods type and material only — classification-friendly wording",
    "- Short, neutral, customs-oriented phrasing",
    "- Remove model numbers, part numbers, brand names, dimensions, standards, and marketing language",
    "- Do not include quantity, value, or origin",
    "- Return only the description text, no quotes or explanation",
    "",
    `Sanitized invoice line: ${original}`,
  ].join("\n");
}

async function defaultOpenAiGenerator(
  originals: string[],
  language: DeclarationLanguage
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const results: string[] = [];
  for (const original of originals) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You are an EU customs declarant. Write short, generic Box 31 goods descriptions — never marketing copy or literal translations.",
          },
          { role: "user", content: buildPrompt(original, language) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    results.push(finalizeDescription(content || generateCustomsDescription(original)));
  }
  return results;
}

export interface DeclarationDescriptionEngineOptions {
  cache?: DeclarationDescriptionCache;
  learning?: DeclarationDescriptionLearningStore;
  openAiGenerator?: OpenAiGenerator;
  hsCode?: string;
}

function trackApprovedUsage(
  hsCode: string | undefined,
  language: DeclarationLanguage,
  description: string,
  source: DeclarationDescriptionSource,
  learning: DeclarationDescriptionLearningStore
): void {
  if (!hsCode) return;
  if (source !== "hs_library" && source !== "user_edited") return;
  recordApprovedDescriptionUsage(hsCode, language, description, learning);
}

function resolveFromLearningAndLibrary(
  hsCode: string | undefined,
  language: DeclarationLanguage,
  learning: DeclarationDescriptionLearningStore
): DeclarationDescriptionResult | null {
  if (!hsCode) return null;

  const userEdited = learning.getUserEditedDescription(hsCode, language);
  if (userEdited) {
    const description = finalizeDescription(userEdited);
    trackApprovedUsage(hsCode, language, description, "user_edited", learning);
    return { description, source: "user_edited" };
  }

  const learned = learning.getPreferredDescriptionForHs(hsCode, language);
  if (learned) {
    const description = finalizeDescription(learned);
    const libraryDescription = lookupHsDeclarationDescription(hsCode, language);
    const source: DeclarationDescriptionSource =
      libraryDescription && finalizeDescription(libraryDescription) === description
        ? "hs_library"
        : "user_edited";
    trackApprovedUsage(hsCode, language, description, source, learning);
    return { description, source };
  }

  const libraryDescription = lookupHsDeclarationDescription(hsCode, language);
  if (libraryDescription) {
    const description = finalizeDescription(libraryDescription);
    trackApprovedUsage(hsCode, language, description, "hs_library", learning);
    return { description, source: "hs_library" };
  }

  return null;
}

/** Generate a single declaration description with HS-aware resolution chain. */
export async function generateDeclarationDescription(
  original: string,
  language: DeclarationLanguage,
  options: DeclarationDescriptionEngineOptions = {}
): Promise<DeclarationDescriptionResult> {
  const trimmed = original.trim();
  if (!trimmed) {
    return { description: "", source: "rule_based" };
  }

  const cache = options.cache ?? getDeclarationDescriptionCache();
  const learning = options.learning ?? getDeclarationDescriptionLearningStore();
  const sanitized = sanitizeCommercialDescription(trimmed);
  const hsCode = options.hsCode;

  const hsResolved = resolveFromLearningAndLibrary(hsCode, language, learning);
  if (hsResolved) {
    return hsResolved;
  }

  const hash = hashOriginalDescription(sanitized);
  const cached = cache.getCachedDescription(hash, language);
  if (cached) {
    return {
      description: finalizeDescription(cached.customsDescription),
      source: normalizeDeclarationDescriptionSource(cached.source),
    };
  }

  try {
    const generator = options.openAiGenerator ?? defaultOpenAiGenerator;
    const [generated] = await generator([sanitized], language);
    const description = finalizeDescription(generated);
    const descriptionReviewRecommended = evaluateDescriptionReview({
      original: trimmed,
      declarationDescription: description,
      hsCode,
      language,
      source: "ai_generated",
    });
    cache.setCachedDescription({
      descriptionHash: hash,
      originalDescription: sanitized,
      language,
      customsDescription: description,
      source: "ai_generated",
      createdAt: new Date().toISOString(),
    });
    return { description, source: "ai_generated", descriptionReviewRecommended };
  } catch {
    const fallback = ruleFallback(sanitized);
    cache.setCachedDescription({
      descriptionHash: hash,
      originalDescription: sanitized,
      language,
      customsDescription: fallback.description,
      source: fallback.source,
      createdAt: new Date().toISOString(),
    });
    return fallback;
  }
}

/** Batch-generate declaration descriptions — deduplicates originals per language. */
export async function generateDeclarationDescriptionsBatch(
  requests: BatchDeclarationDescriptionRequest[],
  options: DeclarationDescriptionEngineOptions = {}
): Promise<DeclarationDescriptionResult[]> {
  const cache = options.cache ?? getDeclarationDescriptionCache();
  const learning = options.learning ?? getDeclarationDescriptionLearningStore();
  const generator = options.openAiGenerator ?? defaultOpenAiGenerator;
  const results: DeclarationDescriptionResult[] = new Array(requests.length);

  const pendingByLanguage = new Map<
    DeclarationLanguage,
    Map<string, { indices: number[]; original: string; hsCode?: string }>
  >();

  for (let index = 0; index < requests.length; index += 1) {
    const { original, language, hsCode } = requests[index];
    const trimmed = original.trim();
    if (!trimmed) {
      results[index] = { description: "", source: "rule_based" };
      continue;
    }

    const hsResolved = resolveFromLearningAndLibrary(hsCode, language, learning);
    if (hsResolved) {
      results[index] = hsResolved;
      continue;
    }

    const sanitized = sanitizeCommercialDescription(trimmed);
    const hash = hashOriginalDescription(sanitized);
    const cached = cache.getCachedDescription(hash, language);
    if (cached) {
      results[index] = {
        description: finalizeDescription(cached.customsDescription),
        source: normalizeDeclarationDescriptionSource(cached.source),
      };
      continue;
    }

    const languageMap = pendingByLanguage.get(language) ?? new Map();
    const existing = languageMap.get(hash);
    if (existing) {
      existing.indices.push(index);
    } else {
      languageMap.set(hash, { indices: [index], original: sanitized, hsCode });
    }
    pendingByLanguage.set(language, languageMap);
  }

  for (const [language, pendingMap] of pendingByLanguage) {
    const entries = [...pendingMap.values()];
    const originals = entries.map((entry) => entry.original);

    let generated: string[];
    let source: DeclarationDescriptionSource = "ai_generated";
    try {
      generated = await generator(originals, language);
    } catch {
      generated = originals.map((original) => ruleFallback(original).description);
      source = "rule_based";
    }

    entries.forEach((entry, entryIndex) => {
      const description = finalizeDescription(
        generated[entryIndex] ?? ruleFallback(entry.original).description
      );
      const descriptionReviewRecommended =
        source === "ai_generated"
          ? evaluateDescriptionReview({
              original: entry.original,
              declarationDescription: description,
              hsCode: entry.hsCode,
              language,
              source: "ai_generated",
            })
          : false;
      const hash = hashOriginalDescription(entry.original);
      cache.setCachedDescription({
        descriptionHash: hash,
        originalDescription: entry.original,
        language,
        customsDescription: description,
        source,
        createdAt: new Date().toISOString(),
      });
      for (const resultIndex of entry.indices) {
        results[resultIndex] = { description, source, descriptionReviewRecommended };
      }
    });
  }

  return results;
}

/** Enrich report traceability lines and declarationDescriptions for export. */
export async function enrichReportWithDeclarationDescriptions(
  report: ExportAuditReport,
  language: DeclarationLanguage,
  options: DeclarationDescriptionEngineOptions = {}
): Promise<ExportAuditReport> {
  const lines = report.hsAggregationReport?.traceabilityLines ?? [];
  if (lines.length === 0) return report;

  // Capture authoritative classification fields — descriptions must never mutate these.
  const classificationSnapshot = lines.map((line) => ({
    hsCode: line.hsCode,
    countryOfOrigin: line.countryOfOrigin,
    preferentialOrigin: line.preferentialOrigin,
  }));

  const requests = lines.map((line) => ({
    original: line.description,
    language,
    hsCode: line.hsCode,
  }));
  const generated = await generateDeclarationDescriptionsBatch(requests, options);

  const traceabilityLines: PositionTraceabilityLine[] = lines.map((line, index) => {
    const result = generated[index];
    const classification = classificationSnapshot[index];
    const existingTranslations = { ...(line.declarationDescriptionsByLanguage ?? {}) };
    existingTranslations[language] = {
      description: result.description,
      source: result.source,
    };
    return {
      ...line,
      hsCode: classification.hsCode,
      countryOfOrigin: classification.countryOfOrigin,
      preferentialOrigin: classification.preferentialOrigin,
      declarationDescription: result.description,
      declarationDescriptionSource: result.source,
      descriptionReviewRecommended: result.descriptionReviewRecommended,
      declarationDescriptionsByLanguage: existingTranslations,
    };
  });

  const declarationDescriptions: DeclarationDescriptionEntry[] = traceabilityLines.map((line) => ({
    originalDescription: line.description,
    declarationDescription:
      line.declarationDescriptionsByLanguage?.[language]?.description ??
      line.declarationDescription ??
      "",
    language,
    source: normalizeDeclarationDescriptionSource(
      line.declarationDescriptionsByLanguage?.[language]?.source ??
        line.declarationDescriptionSource ??
        "rule_based"
    ),
    descriptionReviewRecommended: line.descriptionReviewRecommended,
    translations: line.declarationDescriptionsByLanguage,
  }));

  const descriptionReviewIssues = traceabilityLines
    .filter((line) => line.descriptionReviewRecommended)
    .map((line) => ({
      id: `${DESCRIPTION_REVIEW_RECOMMENDED}-${line.positionNumber}`,
      type: "info" as const,
      field: DESCRIPTION_REVIEW_RECOMMENDED,
      message: `${DESCRIPTION_REVIEW_RECOMMENDED_MESSAGE} (position ${line.positionNumber}: "${line.description.slice(0, 40)}")`,
    }));

  const existingIssueIds = new Set(report.issues.map((issue) => issue.id));
  const newIssues = descriptionReviewIssues.filter((issue) => !existingIssueIds.has(issue.id));

  return {
    ...report,
    hsAggregationReport: {
      ...report.hsAggregationReport,
      traceabilityLines,
    },
    declarationDescriptions,
    issues: [...report.issues, ...newIssues],
  };
}
