/**
 * Live-payload regression — DENKIRS 2026-156 (actual /export-auditor/ocr JSON shape).
 * Run: npm run test:golden-denkirs-2026-156
 *
 * Uses scripts/fixtures/denkirs-2026-156-ocr-live.json — NOT synthetic OCR text blocks.
 */
import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  attachRawOcrShipmentMetadata,
  NO_OCR_SHIPMENT_DATA_MESSAGE,
} from "../src/lib/export-auditor/shipment-extraction-diagnostics";
import { resolveInvoiceValue } from "../src/lib/export-auditor/parse-locale-number";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "scripts/fixtures/denkirs-2026-156-ocr-live.json"
);

const LIVE_PDF_TEXT = "-- 1 of 2 --\n\n\n\n-- 2 of 2 --";
const LIVE_PDF_TEXT_LENGTH = 28;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: {
      score: 45,
      status: "WARNING",
      warnings: [
        "Destination is within the EU customs territory.",
        "Missing gross weight",
        "Missing package count",
      ],
      errors: [],
    },
    preference_origin: { destination_outside_eu: false },
    issues: [
      {
        severity: "warning",
        message: "Destination is within the EU customs territory.",
        code: "EU_DESTINATION",
      },
      { severity: "warning", message: "Missing gross weight", code: "MISSING_GROSS_WEIGHT" },
      { severity: "warning", message: "Missing package count", code: "MISSING_PACKAGE_COUNT" },
    ],
    recommended_actions: [],
    summary: "",
  };
}

console.log("DENKIRS 2026-156 — live OCR payload regression\n");

const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as NormalizedInvoice;
delete (raw as Record<string, unknown>)._captureNote;

assert(raw.country_code === "RS", "fixture OCR country_code is RS");
assert(raw.incoterms === "FCA Ljubljana", "fixture incoterms is FCA Ljubljana");
assert(!raw.ocr_text?.trim(), "fixture has no ocr_text (matches live OCR)");
assert(raw.shipment_summary == null, "fixture has no shipment_summary (matches live OCR)");

const withMeta = attachRawOcrShipmentMetadata(raw, LIVE_PDF_TEXT_LENGTH);
const enriched = enrichInvoiceDocument(withMeta, LIVE_PDF_TEXT);

assert(
  enriched.country_code === "RS",
  `destination stays RS after enrichment (got ${enriched.country_code})`
);
assert(enriched.country?.toLowerCase().includes("serbia") === true, "destination country name remains Serbia");

assert(
  enriched.shipment_summary?.gross_weight_total == null,
  `gross weight not invented (got ${enriched.shipment_summary?.gross_weight_total})`
);
assert(
  enriched.shipment_summary?.package_count == null,
  `package count not invented (got ${enriched.shipment_summary?.package_count})`
);
assert(
  Math.abs(resolveInvoiceValue(enriched) - 4507.22) < 0.01,
  `invoice value preserved (${resolveInvoiceValue(enriched)})`
);

const report = mapAuditReportToExportReport(enriched, minimalAudit(), "Invoice_156.pdf");

assert(
  report.invoiceSummary.destinationCountryCode === "RS",
  `UI destinationCountryCode=RS (got ${report.invoiceSummary.destinationCountryCode})`
);
assert(report.shipmentSummary.grossWeightTotal == null, "UI gross weight remains null");
assert(report.shipmentSummary.packageCount == null, "UI package count remains null");
assert(
  report.shipmentExtractionDiagnostics?.noOcrShipmentData === true,
  "shipment diagnostics flag no OCR shipment data"
);
assert(
  report.shipmentExtractionDiagnostics?.primarySource === "Not Available",
  "shipment source is Not Available"
);
assert(
  report.issues.some((issue) => issue.message === NO_OCR_SHIPMENT_DATA_MESSAGE),
  "shows OCR provider shipment message instead of generic parsing warnings"
);
assert(
  !report.issues.some((issue) => /gross shipment weight is missing/i.test(issue.message)),
  "generic gross weight warning suppressed"
);
assert(
  !report.issues.some((issue) => /package count is missing/i.test(issue.message)),
  "generic package count warning suppressed"
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
