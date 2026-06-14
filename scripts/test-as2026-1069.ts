/**
 * Golden regression — Apecs invoice AS2026-1069 (production OCR failure pattern).
 * Run: npm run test:as2026-1069
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  isRejectedConsigneeText,
  isValidConsigneeText,
} from "../src/lib/export-auditor/english-invoice-field-extractor";
import { buildOcrObservability } from "../src/lib/export-auditor/ocr-observability";
import { sanitizeInvoiceForBackendApi } from "../src/lib/export-auditor/backend-invoice-sanitize";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import { parseQuantity } from "../src/lib/export-auditor/parse-quantity";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import { resolveIssueCode } from "../src/lib/export-auditor/issue-readiness";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "as2026-1069-ocr.json");

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "Review required.",
  };
}

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

console.log("AS2026-1069 — Apecs production failure regression\n");

const parserOutput = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;

assert(parserOutput.consignee === "QR for payment", "fixture has polluted parser consignee");
assert(parserOutput.total_value_numeric === 22, "fixture has wrong parser total 22 EUR");
assert((parserOutput.items?.length ?? 0) === 0, "fixture has empty parser line items");

const enriched = enrichInvoiceDocument(
  {
    ...parserOutput,
    incoterms: "DAP",
    shipment_summary: {
      package_count: 1,
      gross_weight_total: 10,
      gross_weight_unit: "kg",
      net_weight_total: null,
      net_weight_unit: null,
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  null
);

assert(enriched.invoice_number === "AS2026-1069", "invoice_number = AS2026-1069");
assert(enriched.invoice_date === "21.05.2026", "invoice_date = 21.05.2026");
assert(enriched.exporter?.includes("Apecs.S d.o.o.") === true, "exporter = Apecs.S d.o.o.");
assert(enriched.country_code === "RS", "destination_country = RS");
assert(isValidConsigneeText(enriched.consignee), "consignee is valid (no QR text)");
assert(
  enriched.consignee?.includes("Braca Maric") === true,
  "consignee includes Braca Maric recipient"
);
assert(!isRejectedConsigneeText(enriched.consignee), "no consignee value contains QR text");
assert(
  Math.abs(resolveInvoiceValue(enriched) - 21790.3) < 0.01,
  "invoice_value = 21790.30"
);
assert((enriched.items?.length ?? 0) === 3, "line_items = 3");
assert(enriched.document_flags?.PARSER_MAPPING_FAILURE !== true, "parser mapping recovered");
assert(enriched.document_flags?.TOTAL_VALUE_PARSING_ERROR !== true, "total value corrected from OCR");

const sanitized = sanitizeInvoiceForBackendApi(enriched);
for (const item of sanitized.items ?? []) {
  assert(typeof item.quantity === "string", "sanitized item quantity is string for backend API");
  assert(typeof item.unit_price === "string", "sanitized item unit_price is string for backend API");
  assert(typeof item.line_total === "string", "sanitized item line_total is string for backend API");
}
assert(
  sanitized.document_flags?.TOTAL_VALUE_PARSING_ERROR === undefined,
  "internal document flags stripped before backend POST"
);

const obs = buildOcrObservability(enriched, 1);
assert((obs.dataExtractionCompleteness ?? 0) >= 80, "completeness >= 80%");

const report = mapAuditReportToExportReport(enriched, minimalAudit(), "AS2026-1069.pdf");
assert(report.customsReadiness?.status !== "CUSTOMS_BLOCKED", "customs status != BLOCKED");
assert(
  !report.issues.some((issue) => isRejectedConsigneeText(issue.message)),
  "no issue message contains QR consignee text"
);

console.log("\nLive PDF layout (dev-server extractPdfText capture):");

const livePdfText = fs
  .readFileSync(path.join(__dirname, "fixtures/as2026-live-pdfText.txt"), "utf8")
  .trim();
const liveEnriched = enrichInvoiceDocument(
  {
    ...parserOutput,
    ocr_text: livePdfText,
    incoterms: "DAP",
    shipment_summary: {
      package_count: 1,
      gross_weight_total: 10,
      gross_weight_unit: "kg",
      net_weight_total: null,
      net_weight_unit: null,
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  livePdfText
);
assert(liveEnriched.consignee?.includes("Braca Maric") === true, "live layout consignee Braca Maric");
assert(Math.abs(resolveInvoiceValue(liveEnriched) - 21790.3) < 0.01, "live layout invoice 21790.30");
assert((liveEnriched.items?.length ?? 0) === 3, "live layout 3 line items");
assert(parseQuantity(liveEnriched.items?.[0]?.quantity) === 1400, "live layout line 1 qty 1400");
assert(parseQuantity(liveEnriched.items?.[1]?.quantity) === 100, "live layout line 2 qty 100");
assert(parseQuantity(liveEnriched.items?.[2]?.quantity) === 2000, "live layout line 3 qty 2000");
const liveTotalQty = (liveEnriched.items ?? []).reduce(
  (sum, item) => sum + parseQuantity(item.quantity),
  0
);
assert(liveTotalQty === 3500, "live layout total quantity 3500");
const liveObs = buildOcrObservability(liveEnriched, 1);
assert((liveObs.dataExtractionCompleteness ?? 0) >= 90, "live layout data extraction >= 90%");
const liveAudit = minimalAudit();
liveAudit.issues = [
  { severity: "WARNING", code: "EUR1_RECOMMENDED", message: "Recommend EUR.1 certificate" },
  { severity: "WARNING", code: "NO_AUTHORISED_EXPORTER", message: "No authorised exporter number" },
];
const liveReport = mapAuditReportToExportReport(liveEnriched, liveAudit, "AS2026-1069.pdf");
assert(liveReport.customsReadiness?.status === "CUSTOMS_REVIEW", "live layout CUSTOMS_REVIEW");
assert(
  !liveReport.issues.some((issue) => resolveIssueCode(issue) === "EUR1_RECOMMENDED"),
  "EUR1_RECOMMENDED absent when evidence not DECLARED"
);
assert(
  !liveReport.issues.some((issue) => resolveIssueCode(issue) === "NO_AUTHORISED_EXPORTER"),
  "NO_AUTHORISED_EXPORTER absent without preferential declaration"
);

console.log("\nParser returned 1 merged line — table must recover Pos 1–3:");

const parserOneLineItem = enrichInvoiceDocument(
  {
    ...parserOutput,
    ocr_text: livePdfText,
    total_value_numeric: 21790.3,
    total_value: "21.790,30",
    items: [
      {
        position_number: 1,
        description: "Merged parser row",
        quantity: "3500",
        line_total: "22235.00",
      },
    ],
    incoterms: "DAP",
    shipment_summary: {
      package_count: 1,
      gross_weight_total: 10,
      gross_weight_unit: "kg",
      net_weight_total: null,
      net_weight_unit: null,
      package_type: "COLLI",
      pallet_dimensions: null,
      pallet_count: null,
    },
  },
  livePdfText
);
assert((parserOneLineItem.items?.length ?? 0) === 3, "parser 1 item replaced by 3 table rows");
assert(parserOneLineItem.items?.[0]?.position_number === 1, "Pos 1 recovered");
assert(parserOneLineItem.items?.[1]?.position_number === 2, "Pos 2 recovered");
assert(parserOneLineItem.items?.[2]?.position_number === 3, "Pos 3 recovered");
const parserOneObs = buildOcrObservability(parserOneLineItem, 1);
assert((parserOneObs.dataExtractionCompleteness ?? 0) >= 90, "completeness >= 90% after line recovery");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
