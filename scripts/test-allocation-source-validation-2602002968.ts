/**
 * Allocation source validation — invoice 2602002968.
 * Run: npm run test:allocation-source-validation-2602002968
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
import { computePreferentialAllocation } from "../src/lib/export-auditor/preferential-allocation-engine";
import {
  validateAllocationSources,
  type AllocationLineAudit,
  type AllocationSourceValidation,
} from "../src/lib/export-auditor/allocation-source-validation";
import type { NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF_PATH =
  process.env.GOLDEN_PDF_2602002968 ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\2602002968.pdf";
const FIXTURE_PATH = path.join(__dirname, "fixtures", "2602002968-ocr.json");

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

function formatMoney(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function printLineTable(lines: AllocationLineAudit[]) {
  console.log(
    "\nPos | Qty | Unit Price | Line Total | Unit×Qty | Pref | Source              | Allocated | Flags"
  );
  console.log("-".repeat(110));
  for (const line of lines) {
    const flags = line.flags.length > 0 ? line.flags.join(", ") : "—";
    console.log(
      [
        String(line.position).padStart(3),
        String(line.quantity).padStart(3),
        formatMoney(line.unitPrice).padStart(10),
        formatMoney(line.lineTotal).padStart(10),
        formatMoney(line.computedUnitTimesQty).padStart(10),
        line.preferentialFlag.padStart(3),
        line.valueSource.padEnd(19),
        formatMoney(line.allocatedValue).padStart(9),
        flags,
      ].join(" | ")
    );
  }
}

function printSummary(label: string, validation: AllocationSourceValidation) {
  const allocation = validation;
  console.log(`\n=== ${label} — Summary ===`);
  console.log(`Raw line sum (classified):     EUR ${formatMoney(allocation.rawLineSum)}`);
  console.log(`  Preferential raw sum:        EUR ${formatMoney(allocation.rawPreferentialSum)}`);
  console.log(`  Non-preferential raw sum:    EUR ${formatMoney(allocation.rawNonPreferentialSum)}`);
  console.log(`Canonical invoice total:       EUR ${formatMoney(allocation.canonicalInvoiceTotal)}`);
  console.log(`Scaling factor:                ${allocation.scalingFactor}`);
  console.log(`Scaling applied:               ${allocation.scalingApplied ? "YES" : "NO"}`);
  console.log(`Corruption flags:              ${allocation.flaggedLines.length} line(s)`);
}

function printTop10(validation: AllocationSourceValidation) {
  console.log("\nTop 10 highest-value lines (raw allocated value):");
  for (const line of validation.topHighestValueLines) {
    console.log(
      `  #${line.position}  EUR ${formatMoney(line.allocatedValue)}  (${line.valueSource}, ${line.preferentialFlag})${
        line.flags.length ? `  ⚠ ${line.flags.join(", ")}` : ""
      }`
    );
  }
}

function printFlagged(validation: AllocationSourceValidation) {
  if (validation.flaggedLines.length === 0) {
    console.log("\nNo line-level corruption flags.");
    return;
  }
  console.log("\n⚠ Flagged lines:");
  for (const line of validation.flaggedLines) {
    console.log(
      `  #${line.position}: ${line.flags.join(", ")} — line_total=${formatMoney(line.lineTotal)}, unit×qty=${formatMoney(line.computedUnitTimesQty)}, allocated=${formatMoney(line.allocatedValue)}`
    );
  }
}

function runValidation(label: string, invoice: NormalizedInvoice) {
  const engine = runPreferentialOriginEngine(invoice);
  const validation = validateAllocationSources(invoice, engine.lines);
  const allocation = computePreferentialAllocation(invoice, engine.lines);

  printSummary(label, validation);
  printLineTable(validation.lines);
  printTop10(validation);
  printFlagged(validation);

  if (allocation) {
    const scaledSum = allocation.preferentialValue + allocation.nonPreferentialValue;
    console.log("\nAfter reconciliation scaling:");
    console.log(`  Preferential:     EUR ${formatMoney(allocation.preferentialValue)}`);
    console.log(`  Non-preferential: EUR ${formatMoney(allocation.nonPreferentialValue)}`);
    console.log(`  Scaled sum:       EUR ${formatMoney(scaledSum)}`);
  }

  return { validation, allocation };
}

async function main() {
  console.log("Allocation source validation — 2602002968\n");

  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error(`Fixture not found: ${FIXTURE_PATH}`);
    process.exit(1);
  }

  const pdfText = fs.existsSync(PDF_PATH)
    ? await extractPdfText(fs.readFileSync(PDF_PATH))
    : fs.readFileSync(path.join(__dirname, "fixtures", "2602002968-pdf-text.txt"), "utf8");

  const base = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
  const invoice = enrichInvoiceDocument(base, pdfText);

  const { validation } = runValidation("Production path (enriched OCR + PDF)", invoice);

  console.log("\n=== Assertions (invoice 2602002968) ===");
  assert(validation.lines.length === 38, `38 classified lines (got ${validation.lines.length})`);
  assert(
    Math.abs(validation.rawLineSum - validation.canonicalInvoiceTotal) < 1,
    `raw line sum within EUR 1 of canonical (${validation.rawLineSum} vs ${validation.canonicalInvoiceTotal})`
  );
  assert(!validation.scalingApplied, "no reconciliation scaling required for clean line values");
  assert(
    Math.abs(validation.scalingFactor - 1) < 0.01,
    `scaling factor ≈ 1 (got ${validation.scalingFactor})`
  );
  assert(!validation.corruptionDetected, "no OCR line value corruption flags");
  assert(validation.flaggedLines.length === 0, "zero flagged lines");

  const prefLines = validation.lines.filter((l) => l.preferentialFlag === "YES");
  const nonPrefLines = validation.lines.filter((l) => l.preferentialFlag === "NO");
  assert(prefLines.length === 18, `18 preferential lines (got ${prefLines.length})`);
  assert(nonPrefLines.length === 20, `20 non-preferential lines (got ${nonPrefLines.length})`);
  assert(
    validation.lines.every((l) => l.valueSource === "line_total"),
    "all lines derive value from line_total (real OCR field)"
  );
  assert(
    validation.lines.every((l) => !l.flags.includes("UNIT_QTY_MISMATCH")),
    "unit_price × quantity matches line_total on every line"
  );

  // Corruption scenario — scaling must not suppress visibility of bad lines
  console.log("\n=== Corruption scenario (inflated line_total) ===");
  const corrupted: NormalizedInvoice = {
    ...base,
    total_value: "2.301.137,62",
    items: base.items?.map((item) => ({
      ...item,
      line_total: (2301137.62 / (base.items?.length ?? 38)).toFixed(2),
    })),
  };
  const corruptedInvoice = enrichInvoiceDocument(corrupted, pdfText);
  const corruptedValidation = validateAllocationSources(
    corruptedInvoice,
    runPreferentialOriginEngine(corruptedInvoice).lines
  );

  printSummary("Inflated OCR line totals", corruptedValidation);
  printFlagged(corruptedValidation);

  assert(corruptedValidation.scalingApplied, "corrupted data triggers scaling");
  assert(corruptedValidation.corruptionDetected, "corrupted data raises corruption flags");
  assert(
    corruptedValidation.flaggedLines.length === corruptedValidation.lines.length,
    "every line flagged when line_total > 50% invoice total"
  );
  assert(
    corruptedValidation.flaggedLines.every((l) =>
      l.flags.includes("LINE_TOTAL_EXCEEDS_HALF_INVOICE")
    ),
    "flags include LINE_TOTAL_EXCEEDS_HALF_INVOICE"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
