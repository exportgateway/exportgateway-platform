/**
 * One-off forensic trace for MAMIYE 6124746 — real PDF only.
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { resolveIssueCode } from "../src/lib/export-auditor/issue-readiness";
import { validateInvoiceTotalConsistency } from "../src/lib/export-auditor/invoice-total-consistency-validator";
import { reconcilePositionCounts } from "../src/lib/export-auditor/position-count-reconciliation";
import { buildInvoiceTextCorpus } from "../src/lib/export-auditor/invoice-corpus";
import { buildPositionTraceability } from "../src/lib/export-auditor/position-traceability";
import { applyHsClassificationSanity } from "../src/lib/export-auditor/hs-classification-sanity";
import { validateHsCode } from "../src/lib/export-auditor/hs-validation-engine";
import { parseLocaleNumber, resolveInvoiceValue, sumLineTotals } from "../src/lib/export-auditor/parse-locale-number";
import { parseApparelStyleRows } from "../src/lib/export-auditor/line-value-recovery-engine";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF = "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES\\MAXX GROUP.pdf";
const BASE = process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") || "https://export-auditor.onrender.com";

async function fetchOcr(pdfPath: string): Promise<NormalizedInvoice> {
  const buf = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), path.basename(pdfPath));
  const res = await fetch(`${BASE}/export-auditor/ocr`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR ${res.status}`);
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

function posVal(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return parseLocaleNumber(String(v)) ?? 0;
}

async function main() {
  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const raw = await fetchOcr(PDF);
  console.log("RAW OCR items", raw.items?.length ?? 0);
  const enriched = enrichInvoiceDocument(raw, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");

  const grand = resolveInvoiceValue(enriched);
  const lineSum = sumLineTotals(enriched.items) ?? 0;
  console.log("\n=== PARSED APPAREL ROWS ===");
  const parsed = parseApparelStyleRows(pdfText);
  console.log("count", parsed.length, "sum", parsed.reduce((s, r) => s + r.lineTotal, 0).toFixed(2));
  parsed.forEach((r, i) => console.log(i + 1, r.styleCode, r.quantity, r.lineTotal.toFixed(2)));
  const totalMatch = pdfText.match(/(?:Total|Grand\s+Total|Invoice\s+Total)[^\d]*([\d.,\s]+)/gi);
  console.log("PDF totals", totalMatch?.slice(0, 5));
  console.log({ grand, lineSum, diff: grand - lineSum });

  console.log("\n=== LINE RECONCILIATION ===");
  let sum = 0;
  for (const item of enriched.items ?? []) {
    const q = posVal(item.quantity);
    const lt = posVal(item.line_total);
    const up = posVal(item.unit_price);
    sum += lt;
    console.log(
      `${item.position_number ?? "?"} | qty=${q} | unit=${up} | line=${lt.toFixed(2)} | style=${(item.description ?? "").slice(0, 40)}`
    );
  }
  console.log("computed sum", sum.toFixed(2));

  const corpus = buildInvoiceTextCorpus(enriched);
  const recon = reconcilePositionCounts(corpus, enriched.items, buildPositionTraceability(enriched).length);
  console.log("\n=== POSITION COUNTS ===", recon);

  console.log("\n=== ISSUES ===");
  for (const i of report.issues) {
    console.log(resolveIssueCode(i), i.message?.slice(0, 120));
  }

  const sanity = applyHsClassificationSanity(enriched);
  console.log("\n=== HS SANITY WARNINGS ===", sanity.warnings.length);
  for (const w of sanity.warnings.slice(0, 5)) {
    console.log(w.positionNumber, w.candidates.join(","), "->", w.selected);
  }

  console.log("\n=== UNKNOWN HS ===");
  for (const [idx, item] of (enriched.items ?? []).entries()) {
    const hs = item.hs_code?.trim();
    if (!hs) continue;
    const v = validateHsCode(hs);
    if (v.hsStatus === "UNKNOWN_HS") {
      console.log(idx + 1, hs, v);
    }
  }
}

main().catch(console.error);
