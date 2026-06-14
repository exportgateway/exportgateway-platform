/**
 * Forensic trace — DEXXON 261000177 + MAMIYE 6124746 (real PDFs, real OCR API).
 * Run: npx tsx scripts/forensic-trace-dexxon-mamiye.ts
 */
import fs from "fs";
import path from "path";
import { extractPdfText, extractPdfPageCount } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { extractHsCodes } from "../src/lib/export-auditor/invoice-fields";
import {
  extractGenericHsCodes,
  extractHsByPosition,
  extractHsHitsFromCorpus,
} from "../src/lib/export-auditor/hs-code-extraction-engine";
import {
  extractCooByPosition,
  extractCooHitsFromCorpus,
} from "../src/lib/export-auditor/country-of-origin-extraction-engine";
import {
  extractHsByPositionBlock,
  extractCooByPositionBlock,
  corpusContainsVisibleHsLabels,
} from "../src/lib/export-auditor/position-block-extraction";
import {
  extractEnglishLineItemsWithDiagnostics,
  shouldRecoverLineItemsFromTable,
} from "../src/lib/export-auditor/english-invoice-field-extractor";
import { buildInvoiceTextCorpus } from "../src/lib/export-auditor/invoice-corpus";
import {
  countCorpusPositionLines,
  validateCustomsExtractionIntegrity,
} from "../src/lib/export-auditor/extraction-integrity-validator";
import { detectCommercialGoodsLines } from "../src/lib/export-auditor/commercial-line-detector";
import { resolveIssueCode } from "../src/lib/export-auditor/issue-readiness";
import { normalizeAndValidateHsToken } from "../src/lib/export-auditor/hs-code-normalize";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF_DIR =
  process.env.MIXED_EU_PDF_DIR ??
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES";

const CASES = [
  {
    id: "DEXXON",
    pdf: "Invoice 261000177.pdf",
    fileName: "261000177.pdf",
    out: "FORENSIC_DEXXON_261000177.md",
  },
  {
    id: "MAMIYE",
    pdf: "MAXX GROUP.pdf",
    fileName: "6124746.pdf",
    out: "FORENSIC_MAMIYE_6124746.md",
  },
] as const;

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

function snap(label: string, data: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
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

interface PositionForensic {
  position: number;
  rawHsDetected: string | null;
  normalizedHs: string | null;
  finalHs: string | null;
  rejectionReason: string | null;
  rawCoo: string | null;
  finalCoo: string | null;
}

function traceDexxonHs(
  raw: NormalizedInvoice,
  enriched: NormalizedInvoice,
  corpus: string
): PositionForensic[] {
  const hsByPos = extractHsByPosition(corpus);
  const blockHs = extractHsByPositionBlock(corpus);
  const blockCoo = extractCooByPositionBlock(corpus);
  const hits = extractHsHitsFromCorpus(corpus);
  const maxPos = Math.max(
    ...(enriched.items ?? []).map((i) => i.position_number ?? 0),
    ...[...hsByPos.keys()],
    ...[...blockHs.keys()],
    10
  );

  const rows: PositionForensic[] = [];
  for (let pos = 1; pos <= maxPos; pos++) {
    const item = (enriched.items ?? []).find((i) => i.position_number === pos);
    const rawFromBlock = blockHs.get(pos) ?? null;
    const rawFromHits = hsByPos.get(pos) ?? null;
    const rawHs = rawFromBlock ?? rawFromHits;
    const norm = rawHs ? normalizeAndValidateHsToken(rawHs) : null;
    rows.push({
      position: pos,
      rawHsDetected: rawHs,
      normalizedHs: norm?.normalized ?? null,
      finalHs: item?.hs_code?.trim() ?? null,
      rejectionReason:
        rawHs && !item?.hs_code?.trim()
          ? norm?.invalid
            ? `normalizeAndValidateHsToken rejected: ${norm.reason ?? "invalid"}`
            : "enrichItemsFromHits / goodsPositions filter skipped line"
          : !rawHs
            ? "no HS hit in corpus for position"
            : null,
      rawCoo: blockCoo.get(pos) ?? null,
      finalCoo: item?.country_of_origin?.trim() ?? null,
    });
  }
  return rows.filter((r) => r.position <= (enriched.items?.length ?? 0) || r.rawHsDetected);
}

interface LineDiscardForensic {
  position: number | null;
  description: string;
  kept: boolean;
  discardReason: string | null;
}

function traceMamiyeLines(
  raw: NormalizedInvoice,
  enriched: NormalizedInvoice,
  corpus: string
): {
  rawPositionsDetected: number;
  positionsKept: number;
  discards: LineDiscardForensic[];
} {
  const { items: recovered, partialRecovery } = extractEnglishLineItemsWithDiagnostics(corpus);
  const shouldRecover = shouldRecoverLineItemsFromTable(raw, corpus);
  const corpusPositions = countCorpusPositionLines(corpus);
  const hsHits = extractHsHitsFromCorpus(corpus);
  const hsLabeledLines = [...corpus.matchAll(/HS\s*Code\s*[-–]\s*(\d{8,10})/gi)];
  const goodsLines = detectCommercialGoodsLines(enriched);

  const finalPositions = new Set(
    (enriched.items ?? []).map((i) => i.position_number).filter(Boolean) as number[]
  );

  const discards: LineDiscardForensic[] = [];

  for (const item of raw.items ?? []) {
    const pos = item.position_number ?? null;
    const kept = pos != null && finalPositions.has(pos);
    discards.push({
      position: pos,
      description: (item.description ?? "").slice(0, 60),
      kept,
      discardReason: kept
        ? null
        : `parser line dropped — OCR returned ${raw.items?.length ?? 0} items, enriched ${enriched.items?.length ?? 0}`,
    });
  }

  if (recovered.length > (enriched.items?.length ?? 0)) {
    for (const item of recovered) {
      const pos = item.position_number ?? null;
      if (pos != null && !finalPositions.has(pos)) {
        discards.push({
          position: pos,
          description: (item.description ?? "").slice(0, 60),
          kept: false,
          discardReason: shouldRecover
            ? "TABLE_RECONSTRUCTION extracted but not applied (shouldRecoverLineItemsFromTable gate)"
            : "extractEnglishLineItems found row but recovery gate blocked",
        });
      }
    }
  }

  return {
    rawPositionsDetected: Math.max(corpusPositions, hsLabeledLines.length, hsHits.length),
    positionsKept: enriched.items?.length ?? 0,
    discards,
  };
}

function renderDexxonReport(ctx: {
  pdfPath: string;
  pdfText: string;
  raw: NormalizedInvoice;
  enriched: NormalizedInvoice;
  report: ReturnType<typeof mapAuditReportToExportReport>;
  positions: PositionForensic[];
  integrity: ReturnType<typeof validateCustomsExtractionIntegrity>;
}): string {
  const corpus = buildInvoiceTextCorpus(ctx.enriched);
  const hsHits = extractHsHitsFromCorpus(corpus);
  const visibleLabels = corpusContainsVisibleHsLabels(corpus);

  return `# FORENSIC DEXXON 261000177

Generated: ${new Date().toISOString()}

## Source PDF

- Path: \`${ctx.pdfPath}\`
- PDF text length: ${ctx.pdfText.length}
- Visible HS labels in corpus: ${visibleLabels}
- OCR API items: ${ctx.raw.items?.length ?? 0}
- OCR \`ocr_text\` length: ${ctx.ocr_text_len(ctx.raw)}

## Extracted OCR evidence (sample)

\`\`\`
${ctx.pdfText.slice(0, 1800)}
\`\`\`

## Pipeline trace

| Stage | line items | HS on lines | HS corpus hits | aggregation rows |
|---|---:|---:|---:|---:|
| RAW OCR | ${ctx.raw.items?.length ?? 0} | ${ctx.raw.items?.filter((i) => i.hs_code?.trim()).length ?? 0} | ${extractGenericHsCodes(ctx.raw.ocr_text ?? "").length} | — |
| PDF TEXT | — | — | ${extractGenericHsCodes(ctx.pdfText).length} | — |
| ENRICHED | ${ctx.enriched.items?.length ?? 0} | ${ctx.enriched.items?.filter((i) => i.hs_code?.trim()).length ?? 0} | ${extractGenericHsCodes(corpus).length} | ${ctx.report.hsAggregationReport.hsAggregation.length} |
| FINAL REPORT | ${ctx.report.invoiceSummary.lineItemCount} | ${extractHsCodes(ctx.enriched).length} detected | — | ${ctx.report.hsAggregationReport.hsAggregation.length} |

### HS hits by extractor

\`\`\`json
${JSON.stringify(hsHits.slice(0, 20), null, 2)}
\`\`\`

### Per-position forensic

| Pos | Raw HS | Normalized | Final HS | Rejection |
|---:|---|---|---|---|
${ctx.positions.map((p) => `| ${p.position} | ${p.rawHsDetected ?? "—"} | ${p.normalizedHs ?? "—"} | ${p.finalHs ?? "—"} | ${p.rejectionReason ?? "—"} |`).join("\n")}

## Root cause

${ctx.rootCause}

## Exact function causing data loss

${ctx.functionCause}

## Proposed permanent fix

${ctx.fix}

## Integrity flags

\`\`\`json
${JSON.stringify(ctx.integrity.flags, null, 2)}
\`\`\`

Issues: ${ctx.report.issues.map((i) => resolveIssueCode(i)).join(", ") || "none"}

## Verification (real PDF)

- HS codes detected: ${extractHsCodes(ctx.enriched).length}
- Line HS backfill: ${ctx.enriched.items?.filter((i) => i.hs_code?.trim()).length ?? 0}
- HS_EXTRACTION_FAILURE: ${ctx.report.issues.some((i) => resolveIssueCode(i) === "HS_EXTRACTION_FAILURE")}
`;
}

function renderMamiyeReport(ctx: {
  pdfPath: string;
  pdfText: string;
  raw: NormalizedInvoice;
  enriched: NormalizedInvoice;
  report: ReturnType<typeof mapAuditReportToExportReport>;
  lineTrace: ReturnType<typeof traceMamiyeLines>;
  integrity: ReturnType<typeof validateCustomsExtractionIntegrity>;
  rootCause: string;
  functionCause: string;
  fix: string;
}): string {
  const corpus = buildInvoiceTextCorpus(ctx.enriched);
  const hsCodes = extractHsCodes(ctx.enriched);
  const hsLabeled = [...corpus.matchAll(/HS\s*Code\s*[-–]\s*(\d{8,10})/gi)].map((m) => m[1]);

  return `# FORENSIC MAMIYE 6124746

Generated: ${new Date().toISOString()}

## Source PDF

- Path: \`${ctx.pdfPath}\`
- Invoice number in PDF: 6124746
- PDF text length: ${ctx.pdfText.length}
- HS Code labeled rows in PDF text: ${hsLabeled.length}
- Unique HS in PDF: ${[...new Set(hsLabeled)].join(", ")}

## Extracted OCR evidence (sample)

\`\`\`
${ctx.pdfText.slice(0, 2000)}
\`\`\`

## Pipeline trace

| Stage | line items | corpus position rows | HS on lines |
|---|---:|---:|---:|
| RAW OCR | ${ctx.raw.items?.length ?? 0} | — | ${ctx.raw.items?.filter((i) => i.hs_code?.trim()).length ?? 0} |
| ENRICHED | ${ctx.enriched.items?.length ?? 0} | ${countCorpusPositionLines(corpus)} | ${ctx.enriched.items?.filter((i) => i.hs_code?.trim()).length ?? 0} |
| FINAL REPORT | ${ctx.report.invoiceSummary.lineItemCount} | — | ${hsCodes.length} detected |

### Line count forensic

- Raw positions detected: ${ctx.lineTrace.rawPositionsDetected}
- Positions kept: ${ctx.lineTrace.positionsKept}
- EXTRACTION_LINE_COUNT_MISMATCH: ${ctx.report.issues.some((i) => resolveIssueCode(i) === "EXTRACTION_LINE_COUNT_MISMATCH")}

### Discarded positions

| Pos | Description | Kept | Reason |
|---:|---|:---:|---|
${ctx.lineTrace.discards.slice(0, 40).map((d) => `| ${d.position ?? "—"} | ${d.description} | ${d.kept ? "✓" : "✗"} | ${d.discardReason ?? "—"} |`).join("\n")}

## Root cause

${ctx.rootCause}

## Exact function causing data loss

${ctx.functionCause}

## Proposed permanent fix

${ctx.fix}

## Integrity flags

\`\`\`json
${JSON.stringify(ctx.integrity.flags, null, 2)}
\`\`\`

## Verification (real PDF)

- Line items: ${ctx.enriched.items?.length ?? 0}
- HS codes detected: ${hsCodes.length} (${hsCodes.join(", ")})
- Positions in report: ${(ctx.enriched.items ?? []).map((i) => i.position_number).join(", ")}
`;
}

// helper for report template
function ocr_text_len(inv: NormalizedInvoice) {
  return inv.ocr_text?.length ?? 0;
}

async function runCase(caseDef: (typeof CASES)[number]) {
  const pdfPath = path.join(PDF_DIR, caseDef.pdf);
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  console.log(`\n######## ${caseDef.id} — ${pdfPath} ########\n`);

  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfText = await extractPdfText(pdfBuffer);
  const pageCount = await extractPdfPageCount(pdfBuffer);

  snap("PDF TEXT preview", { length: pdfText.length, pageCount, preview: pdfText.slice(0, 500) });

  let raw: NormalizedInvoice;
  try {
    raw = await fetchOcr(pdfPath);
    snap("RAW OCR", {
      invoice_number: raw.invoice_number,
      items: raw.items?.length,
      items_with_hs: raw.items?.filter((i) => i.hs_code?.trim()).length,
      ocr_text_len: raw.ocr_text?.length,
      sample_items: raw.items?.slice(0, 3),
    });
  } catch (err) {
    console.warn("OCR API failed, using PDF-text-only synthetic raw:", err);
    raw = {
      invoice_number: caseDef.id === "DEXXON" ? "261000177" : "6124746",
      items: [],
      ocr_text: pdfText,
      country_code: "RS",
      country: "Serbia",
      currency: "EUR",
      ocr_metadata: { page_count: pageCount },
    } as NormalizedInvoice;
  }

  const enriched = enrichInvoiceDocument(raw, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), caseDef.fileName);
  const integrity = validateCustomsExtractionIntegrity(enriched);
  const corpus = buildInvoiceTextCorpus(enriched);

  snap("ENRICHED", {
    items: enriched.items?.length,
    items_with_hs: enriched.items?.filter((i) => i.hs_code?.trim()).length,
    items_with_coo: enriched.items?.filter((i) => i.country_of_origin?.trim()).length,
    hs_detected: extractHsCodes(enriched),
    aggregation: report.hsAggregationReport.hsAggregation.length,
    issues: report.issues.map((i) => resolveIssueCode(i)),
    integrity: integrity.flags,
  });

  if (caseDef.id === "DEXXON") {
    const positions = traceDexxonHs(raw, enriched, corpus);
    snap("DEXXON position trace", positions);

    const md = renderDexxonReport({
      pdfPath,
      pdfText,
      raw,
      enriched,
      report,
      positions,
      integrity,
      ocr_text_len,
      rootCause:
        positions.every((p) => !p.rawHsDetected) && extractGenericHsCodes(corpus).includes("85235110")
          ? "HS 85235110 is present in corpus via standalone/tabular patterns but `extractHsByPosition` / `extractHsByPositionBlock` fail because Dexxon uses inline tabular layout (position marker `.\\tN` at line end, COO on continuation line) — position blocks never form."
          : (enriched.items ?? []).filter((i) => i.hs_code?.trim()).length === 0
            ? "HS visible in corpus but `runMultiPassCustomsExtraction` → `enrichItemsFromHits` did not backfill line.hs_code."
            : "Partial extraction — see per-position table.",
      functionCause:
        "`splitPositionBlocks` (position-block-extraction.ts) + `extractPositionRowHits` (hs-code-extraction-engine.ts) — Dexxon positions are suffix markers, not line-leading numbers.",
      fix:
        "Add Dexxon-style tabular row parser: detect `description qty price total\\tcode\\t.\\tN` rows and continuation `CN\\t...\\tFM... 85235110` lines; map HS/COO by trailing position index.",
    });
    fs.writeFileSync(path.join(process.cwd(), caseDef.out), md, "utf8");
    console.log(`Wrote ${caseDef.out}`);
  } else {
    const lineTrace = traceMamiyeLines(raw, enriched, corpus);
    snap("MAMIYE line trace", lineTrace);

    const md = renderMamiyeReport({
      pdfPath,
      pdfText,
      raw,
      enriched,
      report,
      lineTrace,
      integrity,
      rootCause:
        lineTrace.positionsKept < lineTrace.rawPositionsDetected
          ? `OCR/parser returns ${raw.items?.length ?? 0} lines but PDF contains ${lineTrace.rawPositionsDetected}+ HS-labeled style rows. \`shouldRecoverLineItemsFromTable\` / \`extractEnglishLineItemsWithDiagnostics\` do not parse Mamiye quantity-first style rows (\`8\\t2AA065C99JER005\\t620.80\\tLadies...\`).`
          : "Line count OK but HS/COO may still be missing per line.",
      functionCause:
        "`extractItemsFromTableText` / `reconstructLineItemsFromNumberedRows` (english-invoice-field-extractor.ts) — Mamiye uses qty-first tabular rows, not Pos/Description headers.",
      fix:
        "Add Mamiye commercial-invoice style extractor: rows matching `^(\\d+)\\t([A-Z0-9]+)\\t([\\d,.]+)\\t(.+)$` with following `HS Code - NNNNNNNN` / `Origin - Country` continuation lines.",
    });
    fs.writeFileSync(path.join(process.cwd(), caseDef.out), md, "utf8");
    console.log(`Wrote ${caseDef.out}`);
  }
}

async function main() {
  console.log("Forensic trace — real PDFs from", PDF_DIR);
  for (const c of CASES) {
    await runCase(c);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
