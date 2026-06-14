/**
 * Invoice date readiness checks.
 * Run: npm run test:invoice-date-readiness
 */

import { adjustReadinessScore } from "../src/lib/export-auditor/readiness-score";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { isMrnExportReady } from "../src/lib/export-auditor/mrn-export";
import {
  evaluateInvoiceDateReadiness,
  INVOICE_DATE_IN_FUTURE,
  INVOICE_DATE_OLDER_THAN_180_DAYS,
  startOfUtcDay,
} from "../src/lib/export-auditor/invoice-date-readiness";
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

const REFERENCE = startOfUtcDay(new Date());

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

const TOMORROW = formatIsoDate(addUtcDays(REFERENCE, 1));
const TODAY_ISO = formatIsoDate(REFERENCE);
const OLD_DATE = formatIsoDate(addUtcDays(REFERENCE, -200));
const RECENT_DATE = formatIsoDate(addUtcDays(REFERENCE, -40));

const baseInvoice: NormalizedInvoice = {
  invoice_number: "INV-001",
  exporter: "Exporter GmbH",
  consignee: "Buyer Ltd",
  country: "Germany",
  country_code: "DE",
  incoterms: "EXW",
  total_value_numeric: 1000,
  shipment_summary: {
    package_count: 1,
    package_type: "COLLI",
    gross_weight_total: 100,
    gross_weight_unit: "kg",
    net_weight_total: 80,
    net_weight_unit: "kg",
    pallet_dimensions: null,
    pallet_count: null,
  },
  items: [{ description: "Goods", hs_code: "84713000", quantity: 1, line_total: 1000 }],
};

const auditStub: AuditReportResponse = {
  audit_status: "READY",
  readiness: { score: 100, status: "READY", warnings: [], errors: [] },
  preference_origin: {},
  issues: [],
  recommended_actions: [],
  summary: "Export audit completed.",
};

function reportForDate(invoiceDate: string) {
  return mapAuditReportToExportReport(
    { ...baseInvoice, invoice_date: invoiceDate },
    auditStub,
    "test.pdf"
  );
}

console.log("evaluateInvoiceDateReadiness");

const future = evaluateInvoiceDateReadiness(
  { ...baseInvoice, invoice_date: TOMORROW },
  REFERENCE
);
assert(future.length === 1 && future[0].code === INVOICE_DATE_IN_FUTURE, `${TOMORROW} → ERROR INVOICE_DATE_IN_FUTURE`);
assert(future[0].severity === "error", `${TOMORROW} severity ERROR`);

const todayPass = evaluateInvoiceDateReadiness(
  { ...baseInvoice, invoice_date: TODAY_ISO },
  REFERENCE
);
assert(todayPass.length === 0, `${TODAY_ISO} → PASS`);

const old = evaluateInvoiceDateReadiness(
  { ...baseInvoice, invoice_date: OLD_DATE },
  REFERENCE
);
assert(
  old.length === 1 && old[0].code === INVOICE_DATE_OLDER_THAN_180_DAYS,
  `${OLD_DATE} → WARNING INVOICE_DATE_OLDER_THAN_180_DAYS`
);
assert(old[0].severity === "warning", `${OLD_DATE} severity WARNING`);

const recent = evaluateInvoiceDateReadiness(
  { ...baseInvoice, invoice_date: RECENT_DATE },
  REFERENCE
);
assert(recent.length === 0, `${RECENT_DATE} → PASS`);

const usJan20 = evaluateInvoiceDateReadiness(
  { ...baseInvoice, invoice_date: "01/20/2026" },
  startOfUtcDay(new Date("2026-06-14T12:00:00.000Z"))
);
assert(
  !usJan20.some((i) => i.code === INVOICE_DATE_IN_FUTURE),
  "01/20/2026 (US MM/DD) → no INVOICE_DATE_IN_FUTURE"
);

console.log("\nreadiness score penalties (base 100)");
const futureIssues = [
  {
    id: INVOICE_DATE_IN_FUTURE,
    type: "error" as const,
    message: future[0].message,
    field: INVOICE_DATE_IN_FUTURE,
  },
];
assert(
  adjustReadinessScore(100, { destinationOutsideEu: false } as never, futureIssues) === 50,
  "INVOICE_DATE_IN_FUTURE → -50 points"
);

const oldIssues = [
  {
    id: INVOICE_DATE_OLDER_THAN_180_DAYS,
    type: "warning" as const,
    message: old[0].message,
    field: INVOICE_DATE_OLDER_THAN_180_DAYS,
  },
];
assert(
  adjustReadinessScore(100, { destinationOutsideEu: false } as never, oldIssues) === 90,
  "INVOICE_DATE_OLDER_THAN_180_DAYS → -10 points"
);

console.log("\nmapAuditReportToExportReport — issues, actions, MRN");
const futureReport = reportForDate(TOMORROW);
assert(
  futureReport.issues.some((i) => i.field === INVOICE_DATE_IN_FUTURE && i.type === "error"),
  "future date in report.issues (Overview / Issues tab)"
);
assert(
  futureReport.recommendedActions.some((a) =>
    a.description.includes("Invoice date is in the future")
  ),
  "future date in recommendedActions"
);
assert(futureReport.readinessScore === 50, `future date readinessScore 50 (got ${futureReport.readinessScore})`);
assert(futureReport.mrnExportReady === false, "future date mrnExportReady false");

const todayReport = reportForDate(TODAY_ISO);
assert(
  !todayReport.issues.some((i) => i.field === INVOICE_DATE_IN_FUTURE),
  "today no invoice date issue"
);
assert(todayReport.mrnExportReady === true, "today mrnExportReady true (HS present)");

const oldReport = reportForDate(OLD_DATE);
assert(
  oldReport.issues.some((i) => i.field === INVOICE_DATE_OLDER_THAN_180_DAYS && i.type === "warning"),
  "old date warning in issues"
);
assert(oldReport.readinessScore === 90, `old date readinessScore 90 (got ${oldReport.readinessScore})`);
assert(oldReport.mrnExportReady === true, "old date mrnExportReady true");

const recentReport = reportForDate(RECENT_DATE);
assert(
  !recentReport.issues.some((i) => i.field === INVOICE_DATE_OLDER_THAN_180_DAYS),
  `${RECENT_DATE} no age warning`
);

console.log("\nisMrnExportReady with future issue");
assert(
  isMrnExportReady(
    { hsAggregationReport: todayReport.hsAggregationReport },
    futureReport.issues
  ) === false,
  "isMrnExportReady false when future date issue present"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
