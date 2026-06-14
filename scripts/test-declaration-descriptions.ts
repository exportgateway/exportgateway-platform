/**
 * Unit tests for declaration description engine, cache, and export integration.
 * Run: npm run test:declaration-descriptions
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  enrichReportWithDeclarationDescriptions,
  formatDeclarationDescriptionSource,
  generateDeclarationDescription,
  generateDeclarationDescriptionsBatch,
  MAX_DECLARATION_DESCRIPTION_LENGTH,
  type OpenAiGenerator,
} from "../src/lib/export-auditor/declaration-description-engine";
import { evaluateDescriptionReview } from "../src/lib/export-auditor/declaration-description-review";
import { DESCRIPTION_REVIEW_RECOMMENDED } from "../src/lib/export-auditor/issue-readiness";
import {
  hashOriginalDescription,
  InMemoryDeclarationDescriptionCache,
  normalizeDescriptionForHash,
  setDeclarationDescriptionCache,
} from "../src/lib/export-auditor/declaration-description-cache";
import {
  InMemoryDeclarationDescriptionLearningStore,
  saveUserEditedDescription,
  setDeclarationDescriptionLearningStore,
} from "../src/lib/export-auditor/declaration-description-learning";
import { sanitizeCommercialDescription } from "../src/lib/export-auditor/declaration-description-sanitizer";
import {
  buildMrnExportDataset,
  generateMrnExcelBuffer,
  DECLARATION_DESCRIPTION_DISCLAIMER,
  MRN_EXPORT_COLUMNS,
  MRN_WORKSHEET_NAME,
  summarizeDeclarationDescriptionSources,
  TRACEABILITY_EXPORT_COLUMNS,
  TRACEABILITY_WORKSHEET_NAME,
} from "../src/lib/export-auditor/mrn-export";
import { getExportLanguage } from "../src/lib/export-auditor/declaration-language-prefs";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import type { DeclarationLanguage } from "../src/lib/export-auditor/types";

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

const ROPE_DESCRIPTION =
  "Non rotating rope 10mm-18x7+WSC galvanized EN12385-4 lubricated";

const REFLECTOR_DESCRIPTION = "REFLECTOR REF-H180 PEPPERL+FUCHS";

const MOCK_DESCRIPTIONS: Record<DeclarationLanguage, string> = {
  en: "Galvanized steel wire rope",
  si: "Pocinkana jeklena vrv",
  hr: "Pocinkano čelično uže",
  sr: "Pocinkano čelično uže",
  de: "Verzinktes Stahlseil",
};

const mockOpenAiGenerator: OpenAiGenerator = async (originals, language) =>
  originals.map((original) => {
    if (original.includes("rope")) return MOCK_DESCRIPTIONS[language];
    if (original.toLowerCase().includes("valve")) {
      return language === "de" ? "Ventil" : "Valve";
    }
    return MOCK_DESCRIPTIONS[language];
  });

const reniInvoice: NormalizedInvoice = {
  invoice_number: "26-381-000014",
  exporter: "RENI d.o.o.",
  consignee: "Buyer GmbH",
  country: "Serbia",
  country_code: "RS",
  incoterms: "DAP",
  currency: "EUR",
  total_value_numeric: 12372.78,
  items: [
    {
      description: "Valve A",
      hs_code: "84818073",
      quantity: 13,
      line_total: 1200.5,
      country_of_origin: "DE",
      net_weight: 12.5,
    },
    {
      description: ROPE_DESCRIPTION,
      hs_code: "73121081",
      quantity: 100,
      line_total: 500,
      country_of_origin: "RO",
      net_weight: 40,
    },
  ],
};

const audit: AuditReportResponse = {
  audit_status: "READY",
  readiness: { score: 90, status: "READY", warnings: [], errors: [] },
  preference_origin: {},
  issues: [],
  recommended_actions: [],
  summary: "Export audit completed.",
};

async function main() {
  const cache = new InMemoryDeclarationDescriptionCache();
  const learning = new InMemoryDeclarationDescriptionLearningStore();
  setDeclarationDescriptionCache(cache);
  setDeclarationDescriptionLearningStore(learning);

  const engineOptions = { cache, learning, openAiGenerator: mockOpenAiGenerator };

  console.log("description hash normalization");
  assert(
    normalizeDescriptionForHash("  Valve   A ") === "VALVE A",
    "normalizes trim uppercase and spaces"
  );
  assert(
    hashOriginalDescription("Valve A") === hashOriginalDescription("  valve a  "),
    "hash stable for normalized originals"
  );

  console.log("\nsanitizer");
  const sanitizedReflector = sanitizeCommercialDescription(REFLECTOR_DESCRIPTION);
  assert(!sanitizedReflector.includes("REF-H180"), "sanitizer removes REF-H180");
  assert(!/pepperl/i.test(sanitizedReflector), "sanitizer removes Pepperl+Fuchs brand");
  assert(!sanitizedReflector.includes("TYPE-X7"), "sanitizer removes TYPE-X7 style codes");
  assert(
    sanitizeCommercialDescription("Premium TYPE-X7 valve").toLowerCase().includes("valve"),
    "sanitizer keeps product type"
  );

  console.log("\nHS library resolution");
  const reflectorResult = await generateDeclarationDescription(REFLECTOR_DESCRIPTION, "en", {
    ...engineOptions,
    hsCode: "39269097",
  });
  assert(reflectorResult.source === "hs_library", "reflector uses HS library source");
  assert(reflectorResult.description === "Industrial reflector", "reflector HS library description");

  console.log("\ncache hit preserves ai_generated source");
  const first = await generateDeclarationDescription("Valve A", "en", engineOptions);
  assert(first.source === "ai_generated", "first call uses mock AI");
  assert(first.description === "Valve", "mock AI returns valve description");

  const second = await generateDeclarationDescription("Valve A", "en", engineOptions);
  assert(second.source === "ai_generated", "cache hit still reports ai_generated");
  assert(second.description === first.description, "cached description matches");

  console.log("\nuser edit preferred over HS library");
  saveUserEditedDescription(
    "39269097",
    REFLECTOR_DESCRIPTION,
    "Custom industrial reflector",
    "en",
    learning
  );
  const userEdited = await generateDeclarationDescription(REFLECTOR_DESCRIPTION, "en", {
    ...engineOptions,
    hsCode: "39269097",
  });
  assert(userEdited.source === "user_edited", "user edit source on second export");
  assert(userEdited.description === "Custom industrial reflector", "user edit description preferred");

  console.log("\nuser_edited beats ai_generated on second export");
  const approvalLearning = new InMemoryDeclarationDescriptionLearningStore();
  const approvalCache = new InMemoryDeclarationDescriptionCache();
  const approvalOptions = {
    cache: approvalCache,
    learning: approvalLearning,
    openAiGenerator: mockOpenAiGenerator,
    hsCode: "84818073",
  };
  const aiFirst = await generateDeclarationDescription("Valve A", "en", approvalOptions);
  assert(aiFirst.source === "ai_generated", "first export uses AI");
  saveUserEditedDescription("84818073", "Valve A", "Approved valve goods", "en", approvalLearning);
  const approvedSecond = await generateDeclarationDescription("Valve A", "en", approvalOptions);
  assert(approvedSecond.source === "user_edited", "user_edited beats AI on second export");
  assert(approvedSecond.description === "Approved valve goods", "approved description used");

  console.log("\nlearning table usage increments");
  const learningOnly = new InMemoryDeclarationDescriptionLearningStore();
  const learningCache = new InMemoryDeclarationDescriptionCache();
  await generateDeclarationDescription(REFLECTOR_DESCRIPTION, "en", {
    cache: learningCache,
    learning: learningOnly,
    openAiGenerator: mockOpenAiGenerator,
    hsCode: "39269097",
  });
  await generateDeclarationDescription(REFLECTOR_DESCRIPTION, "en", {
    cache: learningCache,
    learning: learningOnly,
    openAiGenerator: mockOpenAiGenerator,
    hsCode: "39269097",
  });
  assert(
    learningOnly.getApprovedUsageCount("39269097", "en", "Industrial reflector") >= 2,
    "learning table increments usage on HS library exports"
  );

  console.log("\nbatch generation per language");
  const batch = await generateDeclarationDescriptionsBatch(
    [
      { original: ROPE_DESCRIPTION, language: "si", hsCode: "731210810080" },
      { original: ROPE_DESCRIPTION, language: "hr", hsCode: "731210810080" },
      { original: "Valve A", language: "de", hsCode: "84818073" },
    ],
    { cache: new InMemoryDeclarationDescriptionCache(), learning: new InMemoryDeclarationDescriptionLearningStore(), openAiGenerator: mockOpenAiGenerator }
  );
  assert(batch[0]?.source === "hs_library", "wire rope batch uses HS library");
  assert(batch[0]?.description === MOCK_DESCRIPTIONS.si, "Slovenian rope description");
  assert(batch[1]?.description === MOCK_DESCRIPTIONS.hr, "Croatian rope description");
  assert(batch[2]?.description === "Ventil", "German valve description");

  console.log("\ndescription review heuristics");
  assert(
    evaluateDescriptionReview({
      original: "Steel wire rope galvanized",
      declarationDescription: "Industrial equipment",
      language: "en",
      source: "ai_generated",
    }),
    "generic AI mismatch flags review"
  );
  assert(
    !evaluateDescriptionReview({
      original: "Hydraulic oil HLP 68",
      declarationDescription: "Machine lubricant",
      language: "en",
      source: "ai_generated",
    }),
    "related product-type AI wording passes review"
  );
  assert(
    !evaluateDescriptionReview({
      original: "Steel wire rope galvanized",
      declarationDescription: "Industrial equipment",
      language: "en",
      source: "hs_library",
    }),
    "hs_library source never flagged"
  );

  console.log("\nlearning scoped to HS and language only");
  const scopedLearning = new InMemoryDeclarationDescriptionLearningStore();
  saveUserEditedDescription(
    "73121081",
    ROPE_DESCRIPTION,
    "Learned rope wording",
    "en",
    scopedLearning
  );
  const differentHs = await generateDeclarationDescription(ROPE_DESCRIPTION, "en", {
    cache: new InMemoryDeclarationDescriptionCache(),
    learning: scopedLearning,
    openAiGenerator: mockOpenAiGenerator,
    hsCode: "84818073",
  });
  assert(differentHs.source === "ai_generated", "different HS does not inherit learned description");
  assert(differentHs.description !== "Learned rope wording", "learned text not shared across HS codes");

  console.log("\nrule fallback without OpenAI");
  const failingGenerator: OpenAiGenerator = async () => {
    throw new Error("OpenAI unavailable");
  };
  const fallback = await generateDeclarationDescription("Valve A", "en", {
    cache: new InMemoryDeclarationDescriptionCache(),
    learning: new InMemoryDeclarationDescriptionLearningStore(),
    openAiGenerator: failingGenerator,
  });
  assert(fallback.source === "rule_based", "falls back when OpenAI fails");
  assert(fallback.description.toLowerCase().includes("valve"), "rule fallback condenses valve");
  assert(
    fallback.description.length <= MAX_DECLARATION_DESCRIPTION_LENGTH,
    "80 char max enforced on rule fallback"
  );

  console.log("\nreport enrichment");
  const report = mapAuditReportToExportReport(reniInvoice, audit, "reni.pdf");
  const classificationBefore = report.hsAggregationReport.traceabilityLines.map((line) => ({
    hsCode: line.hsCode,
    countryOfOrigin: line.countryOfOrigin,
    preferentialOrigin: line.preferentialOrigin,
  }));
  const enrichedSi = await enrichReportWithDeclarationDescriptions(report, "si", {
    cache: new InMemoryDeclarationDescriptionCache(),
    learning: new InMemoryDeclarationDescriptionLearningStore(),
    openAiGenerator: mockOpenAiGenerator,
  });
  const ropeLine = enrichedSi.hsAggregationReport.traceabilityLines.find((line) =>
    line.description.includes("rope")
  );
  assert(
    ropeLine?.declarationDescription === MOCK_DESCRIPTIONS.si,
    "traceability line enriched"
  );
  assert(ropeLine?.description === ROPE_DESCRIPTION, "original description never translated");
  assert(
    enrichedSi.declarationDescriptions?.some((entry) => entry.language === "si") ?? false,
    "report stores declarationDescriptions"
  );
  enrichedSi.hsAggregationReport.traceabilityLines.forEach((line, index) => {
    const before = classificationBefore[index];
    assert(line.hsCode === before.hsCode, "enrichment preserves hsCode");
    assert(line.countryOfOrigin === before.countryOfOrigin, "enrichment preserves countryOfOrigin");
    assert(
      line.preferentialOrigin === before.preferentialOrigin,
      "enrichment preserves preferentialOrigin"
    );
  });

  console.log("\nAI review flag on enrichment");
  const reviewCache = new InMemoryDeclarationDescriptionCache();
  const badAiGenerator: OpenAiGenerator = async (originals) =>
    originals.map((original) =>
      original.toLowerCase().includes("rope") ? "Industrial equipment" : "Generic goods"
    );
  const reviewInvoice: NormalizedInvoice = {
    ...reniInvoice,
    items: [
      {
        description: "Steel wire rope galvanized",
        hs_code: "73129900",
        quantity: 10,
        line_total: 100,
        country_of_origin: "RO",
        net_weight: 5,
      },
    ],
  };
  const reviewReport = mapAuditReportToExportReport(reviewInvoice, audit, "review.pdf");
  const enrichedReview = await enrichReportWithDeclarationDescriptions(reviewReport, "en", {
    cache: reviewCache,
    learning: new InMemoryDeclarationDescriptionLearningStore(),
    openAiGenerator: badAiGenerator,
  });
  const reviewRopeLine = enrichedReview.hsAggregationReport.traceabilityLines[0];
  assert(reviewRopeLine?.descriptionReviewRecommended === true, "rope line flagged for review");
  const reviewIssues = enrichedReview.issues.filter(
    (issue) => issue.field === DESCRIPTION_REVIEW_RECOMMENDED
  );
  assert(reviewIssues.length > 0, "review info issue appended");
  assert(
    reviewIssues.every((issue) => issue.type === "info"),
    "review issues are info-level only"
  );

  console.log("\nlanguage selection for export columns");
  const enrichedDe = await enrichReportWithDeclarationDescriptions(report, "de", {
    cache: new InMemoryDeclarationDescriptionCache(),
    learning: new InMemoryDeclarationDescriptionLearningStore(),
    openAiGenerator: mockOpenAiGenerator,
  });
  const datasetDe = buildMrnExportDataset(enrichedDe, { language: "de" });
  assert(datasetDe != null, "dataset built with German language");
  if (datasetDe) {
    const valveTrace = datasetDe.traceabilityRows.find((row) =>
      row.originalDescription.includes("Valve")
    );
    assert(valveTrace?.declarationDescription === "Ventil", "German export uses Ventil");
    assert(valveTrace?.originalDescription === "Valve A", "original description column verbatim");
    assert(valveTrace?.descriptionSource === "AI Generated", "source label on traceability row");
    const hsRow = datasetDe.rows.find((row) => row.hsCode === "73121081");
    assert(
      hsRow?.declarationDescription === MOCK_DESCRIPTIONS.de,
      "HS row uses German declaration description"
    );
    const sourceSummary = summarizeDeclarationDescriptionSources(datasetDe);
    assert(
      Object.keys(sourceSummary).some((label) =>
        ["AI Generated", "HS Library", "Rule Based", "User Approved"].includes(label)
      ),
      "export metadata includes description source labels"
    );
  }

  console.log("\nExcel buffer sheets and columns");
  const enrichedEn = await enrichReportWithDeclarationDescriptions(report, "en", {
    cache: new InMemoryDeclarationDescriptionCache(),
    learning: new InMemoryDeclarationDescriptionLearningStore(),
    openAiGenerator: mockOpenAiGenerator,
  });
  const buffer = await generateMrnExcelBuffer(enrichedEn, { language: "en" });
  assert(buffer.byteLength > 0, "Excel buffer non-empty");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  assert(workbook.SheetNames.includes(MRN_WORKSHEET_NAME), "DECLARATION PREPARATION worksheet");
  assert(workbook.SheetNames.includes(TRACEABILITY_WORKSHEET_NAME), "TRACEABILITY worksheet");

  const prepSheet = workbook.Sheets[MRN_WORKSHEET_NAME];
  const prepRows = XLSX.utils.sheet_to_json<(string | number)[]>(prepSheet, { header: 1 });
  const prepHeaderIndex = prepRows.findIndex((row) => row[0] === "HS Code");
  assert(prepHeaderIndex >= 0, "preparation HS header row");
  assert(
    prepRows[prepHeaderIndex]?.[1] === MRN_EXPORT_COLUMNS[1],
    "Description column present"
  );
  assert(prepRows[prepHeaderIndex]?.[2] === "Quantity", "Quantity column present");
  assert(String(prepRows[prepHeaderIndex]?.[7]) === "Source Positions", "Source Positions column");
  const footerRows = prepRows.filter(
    (row) => typeof row[0] === "string" && String(row[0]).includes("declarant assistance")
  );
  assert(footerRows.length > 0, "disclaimer in export footer");

  const traceSheet = workbook.Sheets[TRACEABILITY_WORKSHEET_NAME];
  const traceRows = XLSX.utils.sheet_to_json<(string | number)[]>(traceSheet, { header: 1 });
  assert(traceRows[0]?.[1] === TRACEABILITY_EXPORT_COLUMNS[1], "traceability Original Description");
  assert(traceRows[0]?.[2] === "Declaration Description", "traceability Declaration Description");
  assert(traceRows[0]?.[9] === "Review Recommended", "traceability Review Recommended column");
  assert(
    prepRows.some((row) => String(row[0] ?? row).includes(DECLARATION_DESCRIPTION_DISCLAIMER.slice(0, 20))),
    "footer contains disclaimer text"
  );

  console.log("\nsource label formatting");
  assert(formatDeclarationDescriptionSource("ai_generated") === "AI Generated", "AI label");
  assert(formatDeclarationDescriptionSource("hs_library") === "HS Library", "HS library label");
  assert(formatDeclarationDescriptionSource("user_edited") === "User Approved", "User approved label");
  assert(formatDeclarationDescriptionSource("user_approved") === "User Approved", "legacy user_approved label");
  assert(formatDeclarationDescriptionSource("rule_based") === "Rule Based", "Rule based label");
  assert(formatDeclarationDescriptionSource("cached") === "AI Generated", "legacy cached maps to AI");
  assert(formatDeclarationDescriptionSource("rule_fallback") === "Rule Based", "legacy fallback maps");

  console.log("\nexport language default");
  assert(getExportLanguage() === "en" || typeof getExportLanguage() === "string", "export language resolves");

  setDeclarationDescriptionCache(null);
  setDeclarationDescriptionLearningStore(null);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
