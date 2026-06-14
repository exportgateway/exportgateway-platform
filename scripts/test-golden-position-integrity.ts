/**
 * Golden position integrity — exact reconciliation for 50–500 position invoices.
 * Run: npm run test:golden-position-integrity
 */
import fs from "fs";
import path from "path";
import type { ApiInvoiceItem, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import { deduplicateCommercialLineItems } from "../src/lib/export-auditor/commercial-line-deduplication";
import { normalizeInvoiceCommercialDescriptions } from "../src/lib/export-auditor/commercial-description-normalizer";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { validatePositionIntegrityExact } from "../src/lib/export-auditor/position-integrity-engine";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { parseLocaleNumber } from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse } from "../src/lib/export-auditor/api-types";

const PDF = path.join(
  process.env.MIXED_EU_PDF_DIR ??
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES",
  "MAXX GROUP.pdf"
);

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

const LARGE_SIZES = [50, 100, 200, 500] as const;

let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function styleCodeForPosition(pos: number): string {
  return `1AB${String(pos).padStart(8, "0")}XY`;
}

function lineMetrics(pos: number): {
  style: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  hs: string;
  coo: string;
  description: string;
} {
  const style = styleCodeForPosition(pos);
  const qty = (pos % 10) + 1;
  const unitPrice = 10 + (pos % 7);
  const lineTotal = qty * unitPrice;
  const hs = pos % 3 === 0 ? "6109100010" : "6204620090";
  const coo = pos % 2 === 0 ? "China" : "Vietnam";
  const description = `Jersey knit garment navy size M`;
  return { style, qty, unitPrice, lineTotal, hs, coo, description };
}

function buildPdfCorpus(positionCount: number): string {
  const lines: string[] = ["Style Description", "Commercial Invoice"];
  let totalUnits = 0;
  let totalValue = 0;

  for (let pos = 1; pos <= positionCount; pos += 1) {
    const m = lineMetrics(pos);
    totalUnits += m.qty;
    totalValue += m.lineTotal;
    lines.push(
      `${m.qty} ${m.style} ${m.lineTotal.toFixed(2)} ${m.description}`,
      `HS Code - ${m.hs}`,
      `Origin - ${m.coo}`
    );
  }

  lines.push("");
  lines.push(`Total Units: ${totalUnits}`);
  lines.push(`Total ${totalValue.toFixed(2)}`);
  return lines.join("\n");
}

function buildSyntheticInvoice(positionCount: number): {
  invoice: NormalizedInvoice;
  expectedUnits: number;
  expectedTotal: number;
  hsByStyle: Map<string, string>;
  cooByStyle: Map<string, string>;
} {
  const pdfCorpus = buildPdfCorpus(positionCount);
  const items: ApiInvoiceItem[] = [];
  let expectedUnits = 0;
  let expectedTotal = 0;
  const hsByStyle = new Map<string, string>();
  const cooByStyle = new Map<string, string>();

  for (let pos = 1; pos <= positionCount; pos += 1) {
    const m = lineMetrics(pos);
    expectedUnits += m.qty;
    expectedTotal += m.lineTotal;
    hsByStyle.set(m.style, m.hs);
    cooByStyle.set(m.style, m.coo);
    items.push({
      position_number: pos,
      item_code: m.style,
      description: `${m.qty} ${m.style} ${m.lineTotal.toFixed(2)} ${m.description} HS Code - ${m.hs} Origin - ${m.coo}`,
      quantity: m.qty,
      unit_price: m.unitPrice,
      line_total: m.lineTotal,
      hs_code: m.hs,
      country_of_origin: m.coo,
    });
  }

  const invoice: NormalizedInvoice = {
    invoice_number: `SYN-${positionCount}`,
    invoice_value: expectedTotal,
    currency: "EUR",
    items,
    ocr_metadata: { extracted_pdf_text: pdfCorpus },
    ocr_text: pdfCorpus,
  };

  return { invoice, expectedUnits, expectedTotal, hsByStyle, cooByStyle };
}

function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  return parseLocaleNumber(String(raw)) ?? 0;
}

function verifyExactIntegrity(
  label: string,
  invoice: NormalizedInvoice,
  expected: {
    positionCount: number;
    expectedUnits: number;
    expectedTotal: number;
    hsByStyle: Map<string, string>;
    cooByStyle: Map<string, string>;
  }
): void {
  console.log(`\n${label}`);

  const prepared: NormalizedInvoice = {
    ...invoice,
    items: normalizeInvoiceCommercialDescriptions(invoice.items ?? []),
  };

  const result = validatePositionIntegrityExact(prepared);
  assert(result.passed, `integrity exact pass (${result.failures.length} failures)`);

  if (!result.passed && result.failures.length > 0) {
    for (const failure of result.failures.slice(0, 5)) {
      console.log(`    - ${failure.message}`);
    }
  }

  assert(result.positionCount === expected.positionCount, `position count=${expected.positionCount}`);
  assert(result.sourceCount === expected.positionCount, `source count=${expected.positionCount}`);

  const items = prepared.items ?? [];
  const totalUnits = items.reduce((sum, item) => sum + parseNum(item.quantity), 0);
  const lineSum = items.reduce((sum, item) => sum + parseNum(item.line_total), 0);

  assert(totalUnits === expected.expectedUnits, `units=${expected.expectedUnits}`);
  assert(lineSum.toFixed(2) === expected.expectedTotal.toFixed(2), `line sum=${expected.expectedTotal.toFixed(2)}`);
  assert(
    result.invoiceTotal.toFixed(2) === expected.expectedTotal.toFixed(2),
    `invoice total=${expected.expectedTotal.toFixed(2)}`
  );

  let hsOk = true;
  let cooOk = true;
  for (const item of items) {
    const style = item.item_code?.trim() ?? "";
    const expectedHs = expected.hsByStyle.get(style);
    const expectedCoo = expected.cooByStyle.get(style);
    if (expectedHs && (item.hs_code ?? "").trim() !== expectedHs) hsOk = false;
    if (expectedCoo && (item.country_of_origin ?? "").trim() !== expectedCoo) cooOk = false;
  }
  assert(hsOk, "100% HS allocation exact");
  assert(cooOk, "100% COO allocation exact");

  assert(result.traceability.passed, "traceability audit passed");
  assert(
    result.traceability.records.length === expected.positionCount,
    `traceability records=${expected.positionCount}`
  );
}

function testSyntheticSize(positionCount: number): void {
  const built = buildSyntheticInvoice(positionCount);
  verifyExactIntegrity(`Synthetic ${positionCount} positions (clean)`, built.invoice, {
    positionCount,
    expectedUnits: built.expectedUnits,
    expectedTotal: built.expectedTotal,
    hsByStyle: built.hsByStyle,
    cooByStyle: built.cooByStyle,
  });

  const triplicatedItems = [
    ...built.invoice.items!,
    ...built.invoice.items!,
    ...built.invoice.items!,
  ];
  const triplicated: NormalizedInvoice = {
    ...built.invoice,
    items: triplicatedItems,
  };
  const deduped = deduplicateCommercialLineItems(triplicated).invoice;
  verifyExactIntegrity(`Synthetic ${positionCount} positions (3× dedup)`, deduped, {
    positionCount,
    expectedUnits: built.expectedUnits,
    expectedTotal: built.expectedTotal,
    hsByStyle: built.hsByStyle,
    cooByStyle: built.cooByStyle,
  });
}

function testDistinctColourNotMerged(): void {
  console.log("\nDistinct colour rows must not merge");
  const base = lineMetrics(1);
  const itemA: ApiInvoiceItem = {
    position_number: 1,
    item_code: base.style,
    description: "Jersey knit garment black",
    quantity: 5,
    line_total: 50,
    hs_code: base.hs,
    country_of_origin: base.coo,
  };
  const itemB: ApiInvoiceItem = {
    position_number: 2,
    item_code: base.style,
    description: "Jersey knit garment white",
    quantity: 5,
    line_total: 50,
    hs_code: base.hs,
    country_of_origin: base.coo,
  };
  const deduped = deduplicateCommercialLineItems({
    invoice_number: "COLOUR-TEST",
    items: [itemA, itemB],
  }).invoice;
  assert((deduped.items?.length ?? 0) === 2, "black/white same style kept as 2 rows");
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

async function testMaxxGroupRealPdf(): Promise<void> {
  console.log("\nMAXX GROUP real PDF (23 positions)");
  if (!fs.existsSync(PDF)) {
    console.log(`  ⊘ skipped — PDF not found: ${PDF}`);
    return;
  }

  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const raw = await fetchOcr(PDF);
  const enriched = enrichInvoiceDocument(
    {
      ...raw,
      ocr_metadata: { ...raw.ocr_metadata, extracted_pdf_text: pdfText },
    },
    pdfText
  );
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");
  const result = validatePositionIntegrityExact(enriched, report);

  assert(result.passed, `MAXX GROUP integrity (${result.failures.length} failures)`);
  if (!result.passed) {
    for (const failure of result.failures.slice(0, 5)) {
      console.log(`    - ${failure.code}: ${failure.message}`);
    }
  }
  assert(result.positionCount === 23, "23 final positions");
  assert(result.sourceCount === 23, "23 source positions");
  assert(result.traceability.passed, "traceability chain reconciled");
}

async function main() {
  console.log("Golden position integrity — exact match regression\n");

  testDistinctColourNotMerged();

  for (const size of LARGE_SIZES) {
    testSyntheticSize(size);
  }

  await testMaxxGroupRealPdf();

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
