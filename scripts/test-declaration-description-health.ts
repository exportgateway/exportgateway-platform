/**
 * Regression tests for declaration description engine health diagnostics.
 * Run: npm run test:declaration-description-health
 */

import {
  countDescriptionSources,
  countDescriptionSourcesFromReport,
  emptyDescriptionSourceCounts,
  getDeclarationDescriptionEngineHealth,
} from "../src/lib/export-auditor/declaration-description-health";
import type { ExportAuditReport } from "../src/lib/export-auditor/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void
): void {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    const next = values[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(values)) {
      const prev = previous[key];
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  }
}

console.log("\n=== getDeclarationDescriptionEngineHealth ===");

withEnv({ OPENAI_API_KEY: undefined, OPENAI_MODEL: undefined }, () => {
  const health = getDeclarationDescriptionEngineHealth();
  assert(health.openaiConfigured === false, "missing key → not configured");
  assert(health.provider === "Rule Based", "missing key → Rule Based provider");
  assert(health.status === "Fallback", "missing key → Fallback status");
  assert(health.cacheEnabled === true, "cache always enabled on server");
  assert(health.model === null, "missing key → no model");
});

withEnv({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-4o-mini" }, () => {
  const health = getDeclarationDescriptionEngineHealth();
  assert(health.openaiConfigured === true, "key present → configured");
  assert(health.provider === "OpenAI", "key present → OpenAI provider");
  assert(health.status === "Active", "key present → Active status");
  assert(health.model === "gpt-4o-mini", "model from env");
});

withEnv({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: undefined }, () => {
  const health = getDeclarationDescriptionEngineHealth();
  assert(health.model === "gpt-4o-mini", "default model when OPENAI_MODEL unset");
});

console.log("\n=== countDescriptionSources ===");

assert(
  countDescriptionSources(["ai_generated", "hs_library", "user_edited", "rule_based"]).aiGenerated ===
    1,
  "counts ai_generated"
);
assert(
  countDescriptionSources(["hs_library", "hs_library"]).hsLibrary === 2,
  "counts hs_library"
);
assert(
  countDescriptionSources(["user_edited"]).userApproved === 1,
  "counts user_edited as userApproved"
);
assert(
  countDescriptionSources(["rule_based", "rule_fallback"]).ruleBased === 2,
  "counts rule_based and legacy rule_fallback"
);
assert(countDescriptionSources([]).total === 0, "empty sources → zero total");

console.log("\n=== countDescriptionSourcesFromReport ===");

const sampleReport = {
  hsAggregationReport: {
    traceabilityLines: [
      {
        positionNumber: 1,
        description: "Wire rope",
        declarationDescriptionsByLanguage: {
          en: { description: "Steel rope", source: "ai_generated" },
        },
      },
      {
        positionNumber: 2,
        description: "Reflector",
        declarationDescriptionsByLanguage: {
          en: { description: "Reflector", source: "hs_library" },
        },
      },
    ],
  },
} as ExportAuditReport;

const reportCounts = countDescriptionSourcesFromReport(sampleReport, "en");
assert(reportCounts.aiGenerated === 1, "report counts ai line");
assert(reportCounts.hsLibrary === 1, "report counts hs library line");
assert(reportCounts.total === 2, "report total lines");

assert(
  emptyDescriptionSourceCounts().total === 0,
  "emptyDescriptionSourceCounts returns zeros"
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
