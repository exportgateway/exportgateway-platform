/**
 * Generate GOLDEN_DATASET_REVIEW.md from dataset run summary.
 */

import type { GoldenDatasetSummary } from "@/lib/export-auditor/golden-dataset/types";

export function generateGoldenDatasetReviewMarkdown(summary: GoldenDatasetSummary): string {
  const lines: string[] = [
    "# Golden Dataset Review",
    "",
    `Generated: ${summary.runAt}`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Total invoices | ${summary.totalInvoices} |`,
    `| Passed | ${summary.passed} |`,
    `| Failed | ${summary.failed} |`,
    `| **Pass rate** | **${summary.passRate.toFixed(1)}%** |`,
    `| **Failure rate** | **${summary.failureRate.toFixed(1)}%** |`,
    `| Avg extraction accuracy | ${summary.avgExtractionAccuracy.toFixed(1)}% |`,
    `| Customs readiness accuracy | ${summary.customsReadinessAccuracy.toFixed(1)}% |`,
    `| **Production readiness** | **${summary.productionReadinessPercent.toFixed(1)}%** |`,
    `| Critical anomalies | ${summary.criticalAnomalyCount} |`,
    "",
    "## Targets",
    "",
    "| Target | Status |",
    "|--------|--------|",
    `| 95%+ extraction accuracy | ${summary.avgExtractionAccuracy >= 95 ? "✓ MET" : "✗ BELOW"} (${summary.avgExtractionAccuracy.toFixed(1)}%) |`,
    `| 95%+ customs readiness accuracy | ${summary.customsReadinessAccuracy >= 95 ? "✓ MET" : "✗ BELOW"} (${summary.customsReadinessAccuracy.toFixed(1)}%) |`,
    `| Zero critical customs contradictions | ${summary.criticalAnomalyCount === 0 ? "✓ MET" : `✗ ${summary.criticalAnomalyCount} found`} |`,
    "",
  ];

  if (summary.recurringDefects.length > 0) {
    lines.push("## Top Recurring Defects", "");
    for (const defect of summary.recurringDefects.slice(0, 10)) {
      lines.push(
        `- **${defect.code}** (${defect.count}×) — ${defect.invoices.slice(0, 5).join(", ")}${defect.invoices.length > 5 ? "…" : ""}`
      );
    }
    lines.push("");
  }

  if (summary.fieldFailureCounts.length > 0) {
    lines.push("## Field Failure Counts", "");
    for (const row of summary.fieldFailureCounts.slice(0, 12)) {
      lines.push(`- ${row.field}: ${row.count}`);
    }
    lines.push("");
  }

  lines.push("## Fix Recommendations", "");
  const recommendations = buildFixRecommendations(summary);
  if (recommendations.length === 0) {
    lines.push("- No recurring defects — dataset stable.");
  } else {
    for (const rec of recommendations) {
      lines.push(`- ${rec}`);
    }
  }
  lines.push("");

  lines.push("## Per-Invoice Results", "");
  lines.push("| Invoice | Status | Extraction | Customs match | Issues |");
  lines.push("|---------|--------|------------|---------------|--------|");
  for (const result of summary.results) {
    const issues =
      result.fieldDifferences.length +
      result.criticalAnomalies.length +
      (result.customsReadinessMatch ? 0 : 1);
    lines.push(
      `| ${result.id} | ${result.passed ? "PASS" : "FAIL"} | ${result.extractionAccuracy.toFixed(1)}% | ${result.customsReadinessMatch ? "✓" : "✗"} | ${issues} |`
    );
  }
  lines.push("");

  const failures = summary.results.filter((r) => !r.passed);
  if (failures.length > 0) {
    lines.push("## Failure Details", "");
    for (const result of failures) {
      lines.push(`### ${result.id} — ${result.label}`, "");
      for (const diff of result.fieldDifferences) {
        lines.push(
          `- \`${String(diff.field)}\`: expected \`${JSON.stringify(diff.expected)}\` → actual \`${JSON.stringify(diff.actual)}\``
        );
      }
      for (const anomaly of result.criticalAnomalies) {
        lines.push(`- **[${anomaly.code}]** ${anomaly.message}`);
      }
      if (!result.customsReadinessMatch) {
        lines.push("- **customsReadiness** status mismatch");
      }
      lines.push("");
    }
  }

  lines.push("## Architecture", "");
  lines.push("```");
  lines.push("golden-invoices/{id}/");
  lines.push("  invoice.pdf              ← source PDF (external or local)");
  lines.push("  validation-report.pdf    ← exported validation PDF");
  lines.push("  invoice-source.json      ← OCR / normalized invoice payload");
  lines.push("  expected-results.json    ← captured golden expectations");
  lines.push("```");
  lines.push("");
  lines.push("Run: `npm run test:golden-dataset`");
  lines.push("Bootstrap: `npm run golden-dataset:bootstrap`");
  lines.push("Add invoice: `npm run golden-dataset:add -- <id>`");

  return lines.join("\n");
}

function buildFixRecommendations(summary: GoldenDatasetSummary): string[] {
  const recs: string[] = [];
  const defectCodes = new Set(summary.recurringDefects.map((d) => d.code));

  if (defectCodes.has("PHYSICAL_WEIGHT_CONTRADICTION")) {
    recs.push(
      "Review weight hierarchy for unit-weight vs line-weight confusion; enforce document gross when net is UNKNOWN."
    );
  }
  if (defectCodes.has("DESTINATION_COUNTRY_CONTRADICTION")) {
    recs.push(
      "Improve destination resolution — consignee address should override stale header country fields."
    );
  }
  if (defectCodes.has("HS_CLASSIFICATION_DISCREPANCY")) {
    recs.push(
      "Review HS verification thresholds or add wizard acceptance workflow for high-confidence suggestions."
    );
  }
  if (defectCodes.has("ORIGIN_DECLARATION_CONTRADICTION")) {
    recs.push(
      "Align position-specific preferential parsing with declaration evidence status; disable blanket YES when explicit positions exist."
    );
  }

  const topField = summary.fieldFailureCounts[0];
  if (topField && topField.count >= 2) {
    recs.push(
      `Investigate recurring field mismatch: **${topField.field}** (${topField.count} invoices).`
    );
  }

  if (summary.avgExtractionAccuracy < 95) {
    recs.push(
      "Extraction accuracy below 95% — extend OCR fallback extractors or add supplier-specific golden fixtures."
    );
  }
  if (summary.customsReadinessAccuracy < 95) {
    recs.push(
      "Customs readiness accuracy below 95% — review readiness engine thresholds against real invoice edge cases."
    );
  }

  return recs;
}

export function buildDatasetSummary(
  results: GoldenDatasetSummary["results"],
  runAt: string
): GoldenDatasetSummary {
  const totalInvoices = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = totalInvoices - passed;

  const avgExtractionAccuracy =
    totalInvoices > 0
      ? results.reduce((sum, r) => sum + r.extractionAccuracy, 0) / totalInvoices
      : 100;

  const customsMatches = results.filter((r) => r.customsReadinessMatch).length;
  const customsReadinessAccuracy =
    totalInvoices > 0 ? (customsMatches / totalInvoices) * 100 : 100;

  const criticalAnomalyCount = results.reduce(
    (sum, r) => sum + r.criticalAnomalies.length,
    0
  );

  const productionReadinessPercent =
    totalInvoices > 0
      ? Math.round(
          ((passed / totalInvoices) * 0.4 +
            (avgExtractionAccuracy / 100) * 0.35 +
            (customsReadinessAccuracy / 100) * 0.25) *
            1000
        ) / 10
      : 0;

  const defectMap = new Map<string, { count: number; invoices: string[] }>();
  const fieldMap = new Map<string, number>();

  for (const result of results) {
    for (const anomaly of result.criticalAnomalies) {
      const entry = defectMap.get(anomaly.code) ?? { count: 0, invoices: [] };
      entry.count += 1;
      entry.invoices.push(result.id);
      defectMap.set(anomaly.code, entry);
    }
    for (const diff of result.fieldDifferences) {
      const key = String(diff.field);
      fieldMap.set(key, (fieldMap.get(key) ?? 0) + 1);
    }
  }

  const recurringDefects = [...defectMap.entries()]
    .map(([code, data]) => ({ code, ...data }))
    .sort((a, b) => b.count - a.count);

  const fieldFailureCounts = [...fieldMap.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);

  return {
    runAt,
    totalInvoices,
    passed,
    failed,
    passRate: totalInvoices > 0 ? (passed / totalInvoices) * 100 : 100,
    failureRate: totalInvoices > 0 ? (failed / totalInvoices) * 100 : 0,
    avgExtractionAccuracy,
    customsReadinessAccuracy,
    productionReadinessPercent,
    criticalAnomalyCount,
    recurringDefects,
    fieldFailureCounts,
    results,
  };
}
