/**
 * Mamiye non-preferential style exclusion — real PDF text, no synthetic fixture JSON.
 * Run: npm run test:mamiye-non-preferential-exception
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  extractNonPreferentialExclusions,
  EXPLICIT_NON_PREFERENTIAL_DECLARATION,
} from "../src/lib/export-auditor/preferential-origin-exception-engine";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF_DIR =
  process.env.MIXED_EU_PDF_DIR ??
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES";

const PDF = path.join(PDF_DIR, "MAXX GROUP.pdf");
const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

const TARGET_STYLE = "2AA089S26JER002";

let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

async function fetchOcr(pdfPath: string): Promise<NormalizedInvoice> {
  const buf = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), path.basename(pdfPath));
  const res = await fetch(`${BASE}/export-auditor/ocr`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR ${res.status}: ${await res.text()}`);
  return (await res.json()) as NormalizedInvoice;
}

function baseAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: { destination_outside_eu: true },
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

async function main() {
  console.log("MAMIYE non-preferential exception (real PDF)\n");

  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const { exclusionCodes } = extractNonPreferentialExclusions(pdfText);
  assert(
    exclusionCodes.has(TARGET_STYLE),
    `${TARGET_STYLE} in exclusion set (got ${[...exclusionCodes].join(", ") || "none"})`
  );

  const raw = await fetchOcr(PDF);
  const enriched = enrichInvoiceDocument(raw, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");
  const prefs = report.preferenceOrigin.lineItems;
  const items = enriched.items ?? [];

  const targetItem = items.find(
    (item) =>
      item.description?.toUpperCase().includes(TARGET_STYLE) ||
      item.item_code?.toUpperCase().includes(TARGET_STYLE)
  );
  assert(Boolean(targetItem), `line item containing ${TARGET_STYLE} found`);

  const targetPref = prefs.find(
    (p) =>
      targetItem &&
      (p.position_number === targetItem.position_number ||
        items.indexOf(targetItem) + 1 === p.position_number)
  );
  assert(targetPref?.preferential_origin === "NO", `${TARGET_STYLE} preferential = NO (got ${targetPref?.preferential_origin ?? "—"})`);
  assert(
    targetPref?.preference_reason.includes(EXPLICIT_NON_PREFERENTIAL_DECLARATION) ?? false,
    "reason cites EXPLICIT_NON_PREFERENTIAL_DECLARATION"
  );

  const yes = prefs.filter((p) => p.preferential_origin === "YES").length;
  const no = prefs.filter((p) => p.preferential_origin === "NO").length;
  assert(no >= 1, `at least 1 NO preferential line (got YES=${yes} NO=${no})`);
  assert(yes < items.length, "not all lines marked YES when exclusions present");

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
