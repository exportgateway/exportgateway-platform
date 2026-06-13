/**
 * Origin issue severity reclassification tests.
 * Run: npm run test:origin-issue-reclassification
 */

import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import {
  MISSING_COUNTRY_OF_ORIGIN,
  MISSING_COUNTRY_OF_ORIGIN_INFO_MESSAGE,
  NO_ORIGIN_DECLARATION,
  NO_ORIGIN_DECLARATION_INFO_MESSAGE,
  reclassifyOriginIssues,
  shouldUpgradeOriginDeclarationToWarning,
} from "../src/lib/export-auditor/issue-readiness";
import { getIssuePenalty, resolveIssueCode } from "../src/lib/export-auditor/issue-readiness";
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

function basePreferenceOrigin(
  overrides: Partial<PreferenceOriginAnalysis> = {}
): PreferenceOriginAnalysis {
  return {
    destinationOutsideEu: true,
    preferenceScheme: "PEM",
    schemeLabel: "PEM",
    applicableProofDocuments: ["EUR.1"],
    preferenceWorkflowActive: true,
    preferentialOriginStatus: "NOT_DECLARED",
    invoiceDeclarationSufficient: false,
    eur1Recommended: false,
    originDeclarationFound: false,
    authorisedExporterDetected: false,
    statementOnOriginDetected: false,
    rexRegistrationDetected: false,
    rexRegistrationNumber: null,
    status: "Not declared",
    recommendation: NO_ORIGIN_DECLARATION_INFO_MESSAGE,
    requiredDocuments: [],
    lineItems: [],
    declarationsDetected: [],
    preferentialOriginSummary: "",
    authorisedExporterNumber: null,
    mixedOrigin: false,
    mixedOriginTotals: null,
    preferentialAllocation: null,
    ...overrides,
  };
}

console.log("shouldUpgradeOriginDeclarationToWarning");
assert(
  !shouldUpgradeOriginDeclarationToWarning(basePreferenceOrigin()),
  "no upgrade when preference not claimed"
);
assert(
  shouldUpgradeOriginDeclarationToWarning(
    basePreferenceOrigin({ preferentialOriginStatus: "MIXED_ORIGIN", mixedOrigin: true })
  ),
  "upgrade when mixed origin"
);
assert(
  shouldUpgradeOriginDeclarationToWarning(
    basePreferenceOrigin({
      authorisedExporterDetected: true,
      originDeclarationFound: false,
    })
  ),
  "upgrade when authorised exporter without declaration"
);
assert(
  shouldUpgradeOriginDeclarationToWarning(
    basePreferenceOrigin({
      lineItems: [
        {
          position_number: 1,
          country_of_origin: "DE",
          preferential_origin: "YES",
          preference_reason: "Marked *",
          preference_source: "invoice_declaration",
        },
      ],
      originDeclarationFound: false,
    })
  ),
  "upgrade when lines claim preferential without declaration"
);

console.log("\nreclassifyOriginIssues");
const plainIssues: AuditIssue[] = [
  {
    id: "1",
    type: "warning",
    field: "NO_ORIGIN_DECLARATION",
    message: "No origin declaration found on invoice",
  },
  {
    id: "2",
    type: "warning",
    field: "MISSING_COUNTRY_OF_ORIGIN",
    message: "More than 20% of goods line items are missing country of origin.",
  },
];
const reclassified = reclassifyOriginIssues(plainIssues, basePreferenceOrigin());
assert(reclassified[0]?.type === "info", "NO_ORIGIN default severity = info");
assert(
  reclassified[0]?.message === NO_ORIGIN_DECLARATION_INFO_MESSAGE,
  "NO_ORIGIN info message updated"
);
assert(reclassified[1]?.type === "info", "MISSING_COUNTRY default severity = info");
assert(
  reclassified[1]?.message === MISSING_COUNTRY_OF_ORIGIN_INFO_MESSAGE,
  "MISSING_COUNTRY info message updated"
);

console.log("\nreadiness penalties");
assert(
  getIssuePenalty(reclassified[0], NO_ORIGIN_DECLARATION) === 0,
  "NO_ORIGIN penalty = 0"
);
assert(
  getIssuePenalty(reclassified[1], MISSING_COUNTRY_OF_ORIGIN) === 0,
  "MISSING_COUNTRY penalty = 0"
);

console.log("\nmapAuditReportToExportReport integration");
function buildAudit(issues: AuditReportResponse["issues"]): AuditReportResponse {
  return {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: false,
    },
    issues,
    recommended_actions: [],
    summary: "Review.",
  };
}

const undeclaredInvoice: NormalizedInvoice = {
  invoice_number: "UNDECL-1",
  country_code: "RS",
  country: "Serbia",
  currency: "EUR",
  total_value: "500.00",
  items: [{ description: "Part", quantity: 1, line_total: "500.00" }],
};

const mapped = mapAuditReportToExportReport(
  undeclaredInvoice,
  buildAudit([
    {
      severity: "WARNING",
      code: "NO_ORIGIN_DECLARATION",
      message: "No preferential origin declaration detected.",
    },
    {
      severity: "WARNING",
      code: "MISSING_COUNTRY_OF_ORIGIN",
      message: "Country of origin is missing on invoice lines.",
    },
  ]),
  "undeclared.pdf"
);

const originIssue = mapped.issues.find((i) => resolveIssueCode(i) === NO_ORIGIN_DECLARATION);
const cooIssue = mapped.issues.find((i) => resolveIssueCode(i) === MISSING_COUNTRY_OF_ORIGIN);
assert(originIssue?.type === "info", "mapped NO_ORIGIN is info");
assert(cooIssue?.type === "info", "mapped MISSING_COUNTRY is info");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
