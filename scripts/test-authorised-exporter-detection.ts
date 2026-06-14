/**
 * Authorised exporter detection regression — concept engine + MAXX GROUP real PDF.
 * Run: npm run test:authorised-exporter-detection
 */
import fs from "fs";
import path from "path";
import { detectAuthorisedExporter } from "../src/lib/export-auditor/authorised-exporter-detection-engine";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { collectDeclarationCorpus } from "../src/lib/export-auditor/preferential-origin-engine";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const PDF = path.join(
  process.env.MIXED_EU_PDF_DIR ??
    "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_pfd_report\\MIXED_EU_INVOICES",
  "MAXX GROUP.pdf"
);

const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

const MAXX_DECLARATION = `THE EXPORTER OF THE PRODUCTS COVERED BY THIS DOCUMENT
(customer authorization NO NL86525748B01)
DECLARES THAT, EXCEPT WHERE OTHERWISE CLEARLY INDICATED,
THESE PRODUCTS ARE OF EU AND TURKEY PREFERENTIAL ORIGIN.`;

type Fixture = {
  label: string;
  corpus: string;
  exporter?: string;
  expectedNumber: string;
  expectedCountry: string;
  minConfidence: number;
};

const FIXTURES: Fixture[] = [
  {
    label: "customer authorization (US spelling)",
    corpus: MAXX_DECLARATION,
    exporter: "Mamiye Europe BV, Netherlands",
    expectedNumber: "NL86525748B01",
    expectedCountry: "NL",
    minConfidence: 100,
  },
  {
    label: "customer authorisation (UK spelling)",
    corpus: `The exporter of the products covered by this document
(customer authorisation No SI12345678)
declares that these products are of EU preferential origin`,
    exporter: "PGP INDE d.o.o., Slovenija",
    expectedNumber: "SI12345678",
    expectedCountry: "SI",
    minConfidence: 90,
  },
  {
    label: "authorisation no slash format",
    corpus: `The exporter of the products covered by this document
(customs authorisation No SI/239/10)
declares that these products are of EU preferential origin`,
    exporter: "PGP INDE, Tržič, Slovenija",
    expectedNumber: "SI/239/10",
    expectedCountry: "SI",
    minConfidence: 100,
  },
  {
    label: "authorization no (US spelling)",
    corpus: `The exporter of the products covered by this document
(customs authorization No AT/920/038)
declares that these products are of EU preferential origin`,
    exporter: "HENN GmbH, Austria",
    expectedNumber: "AT/920/038",
    expectedCountry: "AT",
    minConfidence: 100,
  },
  {
    label: "approved exporter",
    corpus: `The exporter of the products covered by this document
(approved exporter No DE123456789)
declares that these products are of EU preferential origin`,
    exporter: "Supplier GmbH, Germany",
    expectedNumber: "DE123456789",
    expectedCountry: "DE",
    minConfidence: 90,
  },
  {
    label: "authorised exporter label",
    corpus: `The exporter of the products covered by this document
(authorised exporter No IT123456789ABC)
declares that these products are of EU preferential origin`,
    exporter: "Fashion SRL, Italy",
    expectedNumber: "IT123456789ABC",
    expectedCountry: "IT",
    minConfidence: 90,
  },
  {
    label: "authorized exporter label",
    corpus: `The exporter of the products covered by this document
(authorized exporter No FR006130/0032)
declares that these products are of EU preferential origin`,
    exporter: "Export SA, France",
    expectedNumber: "FR006130/0032",
    expectedCountry: "FR",
    minConfidence: 90,
  },
  {
    label: "ATU Austria format",
    corpus: `The exporter of the products covered by this document
(customs authorisation No ATU12345678)
declares that these products are of EU preferential origin`,
    exporter: "Austrian Exporter GmbH, Wien, Austria",
    expectedNumber: "ATU12345678",
    expectedCountry: "AT",
    minConfidence: 100,
  },
  {
    label: "Spain ES compact",
    corpus: `The exporter of the products covered by this document
(authorisation no ES12345678901)
declares that these products are of EU preferential origin`,
    exporter: "Export SL, Spain",
    expectedNumber: "ES12345678901",
    expectedCountry: "ES",
    minConfidence: 90,
  },
  {
    label: "Portugal PT",
    corpus: `The exporter of the products covered by this document
(authorisation no PT123456789)
declares that these products are of EU preferential origin`,
    exporter: "Lda Porto, Portugal",
    expectedNumber: "PT123456789",
    expectedCountry: "PT",
    minConfidence: 90,
  },
  {
    label: "Croatia HR",
    corpus: `The exporter of the products covered by this document
(authorisation no HR12345678901)
declares that these products are of EU preferential origin`,
    exporter: "Export d.o.o., Croatia",
    expectedNumber: "HR12345678901",
    expectedCountry: "HR",
    minConfidence: 90,
  },
  {
    label: "Poland PL",
    corpus: `The exporter of the products covered by this document
(authorisation no PL1234567890)
declares that these products are of EU preferential origin`,
    exporter: "Sp. z o.o., Poland",
    expectedNumber: "PL1234567890",
    expectedCountry: "PL",
    minConfidence: 90,
  },
  {
    label: "country mismatch still detected",
    corpus: MAXX_DECLARATION,
    exporter: "Mamiye Europe SRL, Italy",
    expectedNumber: "NL86525748B01",
    expectedCountry: "NL",
    minConfidence: 70,
  },
];

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
  console.log("Authorised exporter detection regression\n");

  for (const fixture of FIXTURES) {
    console.log(`Fixture: ${fixture.label}`);
    const invoice: NormalizedInvoice = {
      exporter: fixture.exporter,
      origin_declaration_text: fixture.corpus,
      ocr_text: fixture.corpus,
    };
    const result = detectAuthorisedExporter(fixture.corpus, invoice);
    assert(result.detected === true, "authorised_exporter_detected = TRUE");
    assert(
      result.authorisation_number === fixture.expectedNumber,
      `authorisation_number = ${fixture.expectedNumber} (got ${result.authorisation_number})`
    );
    assert(
      result.authorisation_country === fixture.expectedCountry,
      `authorisation_country = ${fixture.expectedCountry} (got ${result.authorisation_country})`
    );
    assert(
      result.confidence >= fixture.minConfidence,
      `confidence >= ${fixture.minConfidence} (got ${result.confidence})`
    );
    assert(Boolean(result.detection_rule), `detection_rule set (${result.detection_rule})`);
  }

  if (!fs.existsSync(PDF)) {
    console.error(`\nReal PDF not found: ${PDF}`);
    process.exit(1);
  }

  console.log("\nReal PDF: MAXX GROUP 6124746");
  const pdfText = await extractPdfText(fs.readFileSync(PDF));
  const raw = await fetchOcr(PDF);
  const serverInput: NormalizedInvoice = {
    ...raw,
    ocr_metadata: { ...raw.ocr_metadata, extracted_pdf_text: pdfText },
  };
  const enriched = enrichInvoiceDocument(serverInput, pdfText);
  const report = mapAuditReportToExportReport(enriched, baseAudit(), "6124746.pdf");
  const corpus = collectDeclarationCorpus(enriched);
  const detection = detectAuthorisedExporter(corpus, enriched);

  assert(
    report.preferenceOrigin.authorisedExporterDetected === true,
    "report authorisedExporterDetected = YES"
  );
  assert(
    report.preferenceOrigin.authorisedExporterNumber === "NL86525748B01",
    `authorisation_number = NL86525748B01 (got ${report.preferenceOrigin.authorisedExporterNumber})`
  );
  assert(
    report.preferenceOrigin.authorisedExporterConfidence === 100,
    `confidence = 100 (got ${report.preferenceOrigin.authorisedExporterConfidence})`
  );
  assert(
    report.preferenceOrigin.authorisedExporterDetectionRule ===
      "EXPORTER_DECLARATION_WITH_AUTHORIZATION",
    `detection_rule = EXPORTER_DECLARATION_WITH_AUTHORIZATION (got ${report.preferenceOrigin.authorisedExporterDetectionRule})`
  );
  assert(
    report.preferenceOrigin.authorisationCountry === "NL",
    `authorisation_country = NL (got ${report.preferenceOrigin.authorisationCountry})`
  );

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} assertion(s) failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
