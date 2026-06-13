/**
 * Readiness score tuning — tiered penalties and export status.
 * Run: npm run test:readiness-score
 */

import { adjustReadinessScore, getReadinessVerdict } from "../src/lib/export-auditor/readiness-score";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  INVOICE_DATE_IN_FUTURE,
  INVOICE_DATE_OLDER_THAN_180_DAYS,
} from "../src/lib/export-auditor/invoice-date-readiness";
import {
  HS_CODE_NOT_ON_INVOICE,
  HS_CODE_NOT_ON_INVOICE_MESSAGE,
  MISSING_VAT_ARTICLE,
  VAT_ARTICLE_CANONICAL_MESSAGE,
} from "../src/lib/export-auditor/issue-readiness";
import type { AuditReportResponse, NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import type { AuditIssue, PreferenceOriginAnalysis } from "../src/lib/export-auditor/types";

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

const resolvedPreferenceOrigin: PreferenceOriginAnalysis = {
  destinationOutsideEu: true,
  preferenceScheme: "PEM",
  schemeLabel: "Pan-Euro-Mediterranean (PEM)",
  applicableProofDocuments: ["Invoice Declaration", "Authorised Exporter", "EUR.1"],
  preferenceWorkflowActive: true,
  preferentialOriginStatus: "CONFIRMED",
  invoiceDeclarationSufficient: true,
  evidenceStatus: "DECLARED",
  eur1Recommended: false,
  originDeclarationFound: true,
  authorisedExporterDetected: true,
  statementOnOriginDetected: false,
  rexRegistrationDetected: false,
  rexRegistrationNumber: null,
  authorisedExporterNumber: "FR006130/0032",
  status: "Confirmed",
  recommendation: "Authorised exporter declaration detected.",
  requiredDocuments: [],
  lineItems: [
    {
      position_number: 1,
      country_of_origin: "FR",
      preferential_origin: "YES",
      preference_reason: "Declared",
      preference_source: "invoice_declaration",
    },
    {
      position_number: 2,
      country_of_origin: "FR",
      preferential_origin: "YES",
      preference_reason: "Declared",
      preference_source: "invoice_declaration",
    },
  ],
  declarationsDetected: [],
  preferentialOriginSummary: "All lines preferential.",
  mixedOrigin: false,
  mixedOriginTotals: null,
  preferentialAllocation: null,
};

console.log("MISSING_VAT_ARTICLE penalty capped at 5 points");
const vatOnlyIssues: AuditIssue[] = [
  {
    id: "vat-1",
    type: "warning",
    field: MISSING_VAT_ARTICLE,
    message: VAT_ARTICLE_CANONICAL_MESSAGE,
  },
];
assert(
  adjustReadinessScore(80, resolvedPreferenceOrigin, vatOnlyIssues, {
    hsCodeCount: 1,
    mrnExportReady: true,
  }) >= 90,
  "single MISSING_VAT_ARTICLE with customs-complete floor → score >= 90"
);
assert(
  adjustReadinessScore(100, resolvedPreferenceOrigin, vatOnlyIssues, {
    hsCodeCount: 1,
    mrnExportReady: true,
  }) === 95,
  "100 base with only MISSING_VAT_ARTICLE → 95"
);

console.log("\nCritical blockers heavily penalized");
const criticalIssues: AuditIssue[] = [
  {
    id: "dest",
    type: "error",
    field: "MISSING_DESTINATION",
    message: "Destination country is missing.",
  },
];
assert(
  adjustReadinessScore(100, { destinationOutsideEu: false } as never, criticalIssues) <= 85,
  "MISSING_DESTINATION error reduces score heavily"
);

console.log("\nMissing HS on invoice is informational");
const missingHsIssues: AuditIssue[] = [
  {
    id: HS_CODE_NOT_ON_INVOICE,
    type: "info",
    field: HS_CODE_NOT_ON_INVOICE,
    message: HS_CODE_NOT_ON_INVOICE_MESSAGE,
  },
];
assert(
  adjustReadinessScore(100, { destinationOutsideEu: false } as never, missingHsIssues) >= 95,
  "HS_CODE_NOT_ON_INVOICE info penalty is light"
);

console.log("\nFuture invoice date remains critical");
const futureIssues: AuditIssue[] = [
  {
    id: "future",
    type: "error",
    field: INVOICE_DATE_IN_FUTURE,
    message: "Invoice date is in the future.",
  },
];
assert(
  adjustReadinessScore(100, resolvedPreferenceOrigin, futureIssues) === 50,
  "INVOICE_DATE_IN_FUTURE → -50 points"
);

console.log("\nOld invoice date minor penalty preserved");
const oldIssues: AuditIssue[] = [
  {
    id: "old",
    type: "warning",
    field: INVOICE_DATE_OLDER_THAN_180_DAYS,
    message: "Invoice is older than 180 days.",
  },
];
assert(
  adjustReadinessScore(100, resolvedPreferenceOrigin, oldIssues) === 90,
  "INVOICE_DATE_OLDER_THAN_180_DAYS → -10 points"
);

console.log("\nVAT issue deduplication in mapped report");
const invoice: NormalizedInvoice = {
  invoice_number: "FA26022525",
  exporter: "Robot Coupe",
  consignee: "OSA TERMOSISTEM",
  country: "KOSOVO",
  country_code: "XK",
  incoterms: "EXW",
  currency: "EUR",
  total_value: "5593.70",
  items: [
    {
      position_number: 1,
      description: "Item",
      quantity: 1,
      line_total: "5593.70",
      hs_code: "8438809900",
      country_of_origin: "FR",
    },
  ],
  shipment_summary: {
    package_count: 1,
    package_type: "PALLET",
    gross_weight_total: 81,
    gross_weight_unit: "kg",
    net_weight_total: 65,
    net_weight_unit: "kg",
    pallet_dimensions: null,
    pallet_count: null,
  },
  origin_declaration_text:
    "The exporter of the products covered by this document declares that these products are of EU preferential origin. Customs authorization no FR006130/0032",
  authorised_exporter_number: "FR006130/0032",
};

const audit: AuditReportResponse = {
  audit_status: "WARNING",
  readiness: {
    score: 80,
    status: "WARNING",
    warnings: ["VAT article is missing."],
    errors: [],
  },
  preference_origin: {
    destination_outside_eu: true,
    origin_declaration_found: true,
    authorised_exporter_found: true,
    eur1_recommended: false,
  },
  issues: [
    {
      severity: "WARNING",
      code: MISSING_VAT_ARTICLE,
      message: "VAT article is missing.",
    },
    {
      severity: "WARNING",
      code: MISSING_VAT_ARTICLE,
      message: VAT_ARTICLE_CANONICAL_MESSAGE,
    },
  ],
  recommended_actions: [],
  summary: "Readiness score test",
};

const report = mapAuditReportToExportReport(invoice, audit, "FA26022525.pdf");
const vatMapped = report.issues.filter((issue) => issue.field === MISSING_VAT_ARTICLE);
assert(vatMapped.length === 1, "mapped report has one MISSING_VAT_ARTICLE issue");
assert(
  vatMapped[0]?.message === VAT_ARTICLE_CANONICAL_MESSAGE,
  "canonical VAT warning message retained"
);
assert(report.readinessScore >= 90, `mapped readinessScore >= 90 (got ${report.readinessScore})`);

const verdict = getReadinessVerdict(report);
assert(
  verdict.exportStatus === "Ready",
  `export status Ready for score >= 90 (got "${verdict.exportStatus}")`
);
assert(
  verdict.statusMessage === "Ready with 1 documentation warning.",
  `status message documentation warning (got "${verdict.statusMessage}")`
);
assert(
  verdict.exportStatus !== "Needs Review",
  "customs-complete invoice is not Needs Review"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
