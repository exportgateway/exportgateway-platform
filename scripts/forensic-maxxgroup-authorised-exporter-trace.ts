/**
 * Forensic trace — MAXX GROUP authorised exporter detection.
 * Run: npm run forensic:maxxgroup-authorised-exporter
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  collectDeclarationCorpus,
  extractOriginDeclarationBlock,
  extractAuthorisedExporterNumber,
  detectDeclarations,
} from "../src/lib/export-auditor/preferential-origin-engine";
import { detectAuthorisedExporter } from "../src/lib/export-auditor/authorised-exporter-detection-engine";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF = path.join(
  process.env.MIXED_EU_PDF_DIR ??
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES",
  "MAXX GROUP.pdf"
);

const OUT = path.join(process.cwd(), "FORENSIC_MAXXGROUP_AUTHORISED_EXPORTER.md");

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

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
  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const raw = await fetchOcr(PDF);
  const serverInput: NormalizedInvoice = {
    ...raw,
    ocr_metadata: { ...raw.ocr_metadata, extracted_pdf_text: pdfText },
  };

  const corpus = collectDeclarationCorpus(serverInput);
  const declarationBlock = extractOriginDeclarationBlock(corpus);
  const legacyNumber = extractAuthorisedExporterNumber(corpus);
  const legacyDeclarations = detectDeclarations(corpus);
  const legacyAuthDecl = legacyDeclarations.filter((d) => d.kind === "authorised_exporter");

  const enriched = enrichInvoiceDocument(serverInput, pdfText);
  const enrichedCorpus = collectDeclarationCorpus(enriched);
  const detection = detectAuthorisedExporter(enrichedCorpus, enriched);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");

  const md = `# FORENSIC MAXX GROUP — Authorised Exporter Detection

Invoice: **6124746** | PDF: **MAXX GROUP.pdf**

## Root cause summary

**WHY \`NL86525748B01\` failed detection (before fix):**

| Stage | Function | Result | Rejection reason |
|-------|----------|--------|------------------|
| Authorization extraction | \`extractAuthorisedExporterNumber()\` in \`preferential-origin-engine.ts\` | **null** | Patterns required \`customs authorization no\` + slash format (\`XX/ddd/ddd\`) — invoice uses **customer authorization NO NL86525748B01** (compact alphanumeric, no slashes) |
| Declaration kind | \`detectDeclarations()\` pattern \`authorised_exporter\` | **not matched** | Same — required \`customs authorization\` inside exporter declaration block, not \`customer authorization\` |
| Final report | \`mapPreferenceOrigin()\` | **NO** | \`authorised_exporter_detected\` false when both declaration kind and number extraction failed |

**Rejected identifier:** \`NL86525748B01\`  
**Blocking rule:** \`REF_SLASH = [A-Z]{2}/\\d+/\\d+\` and \`REF_COMPACT = [A-Z]{2}\\d{6}/\\d{4}\` — neither matches compact \`NL86525748B01\`.

---

## Phase 1 — Pipeline trace

### 1. OCR extracted text (declaration excerpt)

\`\`\`
${declarationBlock ?? "(not extracted by legacy block regex)"}
\`\`\`

Full PDF text declaration search:
\`\`\`
${pdfText.match(/the exporter of the products covered by this document[\s\S]{0,500}?preferential origin/i)?.[0]?.slice(0, 500) ?? "(not found in PDF text)"}
\`\`\`

### 2. Preferential declaration block

**Source:** \`extractOriginDeclarationBlock(corpus)\`  
**Matched:** ${declarationBlock ? "YES" : "NO"}

### 3. Authorization extraction (legacy)

**Function:** \`extractAuthorisedExporterNumber(corpus)\`  
**Result:** ${legacyNumber ?? "null"}  
**Legacy authorised_exporter declarations:** ${legacyAuthDecl.length}

### 4. New engine detection

**Function:** \`detectAuthorisedExporter(corpus, invoice)\`

| Field | Value |
|-------|-------|
| detected | ${detection.detected} |
| authorisation_number | ${detection.authorisation_number ?? "—"} |
| authorisation_country | ${detection.authorisation_country ?? "—"} |
| exporter_country | ${detection.exporter_country ?? "—"} (${detection.exporter_country_code ?? "?"}) |
| detection_rule | ${detection.detection_rule ?? "—"} |
| confidence | ${detection.confidence} |
| country_match | ${detection.country_match ?? "n/a"} |

**Trace steps:**

| Stage | Matched | Pattern / source | Rejection |
|-------|---------|------------------|-----------|
${detection.trace
  .map(
    (step) =>
      `| ${step.stage} | ${step.matched ? "YES" : "NO"} | ${step.pattern ?? step.source_text ?? "—"} | ${step.rejection_reason ?? "—"} |`
  )
  .join("\n")}

### 5. Final report mapping

| Report field | Value |
|--------------|-------|
| authorisedExporterDetected | ${report.preferenceOrigin.authorisedExporterDetected} |
| authorisedExporterNumber | ${report.preferenceOrigin.authorisedExporterNumber ?? "—"} |
| authorisationCountry | ${report.preferenceOrigin.authorisationCountry ?? "—"} |
| authorisedExporterDetectionRule | ${report.preferenceOrigin.authorisedExporterDetectionRule ?? "—"} |
| authorisedExporterConfidence | ${report.preferenceOrigin.authorisedExporterConfidence ?? "—"} |

---

## Fix applied

**New file:** \`authorised-exporter-detection-engine.ts\`

Concept-based detection:
- A) Exporter declaration language
- B) authorization / authorisation reference (including **customer authorization**)
- C) Compact identifiers (\`NL86525748B01\`, slash formats, ATU, etc.)

**Wired in:** \`document-enrichment.ts\`, \`preferential-origin-engine.ts\`, \`map-api-response.ts\`

---

## After fix — success criteria

| Check | Expected | Actual |
|-------|----------|--------|
| authorised_exporter_detected | YES | ${report.preferenceOrigin.authorisedExporterDetected ? "YES" : "NO"} |
| authorisation_number | NL86525748B01 | ${report.preferenceOrigin.authorisedExporterNumber ?? "—"} |
| confidence | 100 | ${report.preferenceOrigin.authorisedExporterConfidence ?? "—"} |
| GOLDEN (no manual override) | true | concept engine |
`;

  fs.writeFileSync(OUT, md, "utf8");
  console.log(`Wrote ${OUT}`);
  console.log(`authorisedExporterDetected: ${report.preferenceOrigin.authorisedExporterDetected}`);
  console.log(`authorisation_number: ${report.preferenceOrigin.authorisedExporterNumber}`);
  console.log(`confidence: ${report.preferenceOrigin.authorisedExporterConfidence}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
