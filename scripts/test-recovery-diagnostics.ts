/**
 * Parser recovery provenance + data recovery diagnostics tests.
 * Run: npm run test:recovery-diagnostics
 */

import fs from "fs";
import path from "path";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { buildDataRecoveryDiagnostics } from "../src/lib/export-auditor/data-recovery-diagnostics";
import { formatFieldRecoveryStatus } from "../src/lib/export-auditor/data-recovery-diagnostics";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";

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

function minimalAudit(): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {},
    issues: [],
    recommended_actions: [],
    summary: "",
  };
}

console.log("1. AS2026-1069 — recovery provenance on production failure fixture");

const parserOutput = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "as2026-1069-ocr.json"), "utf8")
) as NormalizedInvoice;

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

assert(Boolean(enriched.parser_input_snapshot), "parser snapshot captured");
assert((enriched.parser_recovery_provenance?.length ?? 0) >= 3, "multiple recoveries recorded");

const diagnostics = buildDataRecoveryDiagnostics(enriched);
assert(diagnostics.fieldsRecovered >= 3, "at least 3 fields recovered");
assert(diagnostics.recoveryPercentage > 0, "recovery percentage > 0");

const consigneeStatus = diagnostics.fieldStatuses.find((row) => row.field === "consignee");
assert(consigneeStatus?.status === "recovered", "consignee status recovered");
assert(
  consigneeStatus?.recovery_source === "OCR_CONSIGNEE_RECOVERY",
  "consignee source OCR_CONSIGNEE_RECOVERY"
);
assert(
  formatFieldRecoveryStatus(consigneeStatus!) === "Recovered (OCR_CONSIGNEE_RECOVERY)",
  "consignee display label"
);

const invoiceNumberStatus = diagnostics.fieldStatuses.find((row) => row.field === "invoice_number");
assert(invoiceNumberStatus?.status === "parsed", "invoice number parsed normally");

const lineItemsStatus = diagnostics.fieldStatuses.find((row) => row.field === "line_items");
assert(lineItemsStatus?.status === "recovered", "line items recovered");
assert(
  lineItemsStatus?.recovery_source === "TABLE_RECONSTRUCTION",
  "line items TABLE_RECONSTRUCTION"
);

const valueStatus = diagnostics.fieldStatuses.find((row) => row.field === "invoice_value");
assert(valueStatus?.status === "recovered", "invoice value recovered");
assert(valueStatus?.recovery_source === "OCR_TOTAL_RECOVERY", "invoice value OCR_TOTAL_RECOVERY");

console.log("\n2. Mapped report — recovery diagnostics attached");

const report = mapAuditReportToExportReport(enriched, minimalAudit(), "AS2026-1069.pdf");
assert(Boolean(report.dataRecoveryDiagnostics), "report includes dataRecoveryDiagnostics");
assert(
  (report.dataRecoveryDiagnostics?.recoveryCount ?? 0) >= 3,
  "report recovery count populated"
);

if ((report.dataRecoveryDiagnostics?.recoveryPercentage ?? 0) > 30) {
  assert(
    report.customsReadiness?.status !== "CUSTOMS_READY",
    "high recovery downgrades customs readiness from READY"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
