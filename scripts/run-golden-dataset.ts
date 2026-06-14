/**
 * Golden Invoice Validation Dataset runner.
 * Compares actual pipeline output against expected-results.json per invoice.
 * Outputs field-level differences only for failures.
 * Generates GOLDEN_DATASET_REVIEW.md
 *
 * Run: npm run test:golden-dataset
 */

import fs from "fs";
import path from "path";
import type { NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import {
  buildDatasetSummary,
  compareGoldenResults,
  formatFieldDifferences,
  generateGoldenDatasetReviewMarkdown,
  processGoldenInvoiceSource,
} from "../src/lib/export-auditor/golden-dataset";
import type {
  GoldenExpectedResults,
  GoldenInvoiceCompareResult,
} from "../src/lib/export-auditor/golden-dataset/types";
import { GOLDEN_INVOICE_REGISTRY } from "./golden-dataset-registry";

const ROOT = path.join(process.cwd(), "golden-invoices");
const REVIEW_PATH = path.join(process.cwd(), "GOLDEN_DATASET_REVIEW.md");

function listInvoiceDirs(): string[] {
  if (!fs.existsSync(ROOT)) return [];
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function loadExpected(dir: string): GoldenExpectedResults {
  const file = path.join(dir, "expected-results.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Missing expected-results.json in ${dir}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as GoldenExpectedResults;
}

function loadSource(dir: string): NormalizedInvoice {
  const file = path.join(dir, "invoice-source.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Missing invoice-source.json in ${dir}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as NormalizedInvoice;
}

function registryEntry(id: string) {
  return GOLDEN_INVOICE_REGISTRY.find((e) => e.id === id);
}

console.log("Golden Invoice Validation Dataset\n");

const dirs = listInvoiceDirs();
if (dirs.length === 0) {
  console.error("No golden invoices found. Run: npm run golden-dataset:bootstrap");
  process.exit(1);
}

const results: GoldenInvoiceCompareResult[] = [];
let passed = 0;
let failed = 0;

for (const id of dirs) {
  const dir = path.join(ROOT, id);
  const expected = loadExpected(dir);
  const source = loadSource(dir);
  const reg = registryEntry(id);

  const { invoice, report, captured } = processGoldenInvoiceSource(source, {
    pdfText: reg?.pdfText ?? null,
    fileName: reg?.fileName ?? `${id}.pdf`,
  });

  const result = compareGoldenResults(expected, captured, report, invoice);
  results.push(result);

  if (result.passed) {
    passed += 1;
    console.log(`  ✓ ${id}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${id}`);
    console.error(formatFieldDifferences(result));
    console.error("");
  }
}

const summary = buildDatasetSummary(results, new Date().toISOString());
const review = generateGoldenDatasetReviewMarkdown(summary);
fs.writeFileSync(REVIEW_PATH, review, "utf8");

console.log("─".repeat(50));
console.log(`Pass rate: ${summary.passRate.toFixed(1)}% (${passed}/${dirs.length})`);
console.log(`Failure rate: ${summary.failureRate.toFixed(1)}%`);
console.log(`Avg extraction accuracy: ${summary.avgExtractionAccuracy.toFixed(1)}%`);
console.log(`Customs readiness accuracy: ${summary.customsReadinessAccuracy.toFixed(1)}%`);
console.log(`Production readiness: ${summary.productionReadinessPercent.toFixed(1)}%`);
console.log(`Critical anomalies: ${summary.criticalAnomalyCount}`);
console.log(`\nReview written: GOLDEN_DATASET_REVIEW.md`);

process.exit(failed > 0 ? 1 : 0);
