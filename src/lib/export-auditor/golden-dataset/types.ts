/**
 * Golden Invoice Validation Dataset — types and schema.
 */

import type { CustomsReadinessStatus, DeclarationReadinessStatus } from "@/lib/export-auditor/types";

export type GoldenAnomalyCode =
  | "PHYSICAL_WEIGHT_CONTRADICTION"
  | "DESTINATION_COUNTRY_CONTRADICTION"
  | "HS_CLASSIFICATION_DISCREPANCY"
  | "ORIGIN_DECLARATION_CONTRADICTION";

export interface GoldenAnomaly {
  code: GoldenAnomalyCode;
  message: string;
  severity: "critical" | "warning";
}

export interface GoldenOriginExpectation {
  evidenceStatus?: string | null;
  preferentialOriginStatus?: string | null;
  mixedOrigin?: boolean;
}

/** Fields captured from validation report for regression comparison. */
export interface GoldenExpectedResults {
  schemaVersion: 1;
  id: string;
  label: string;
  capturedAt: string;
  source: {
    invoicePdf?: string | null;
    validationReportPdf?: string | null;
    invoiceSource: string;
  };
  expected: GoldenCapturedFields;
  /** Anomaly codes allowed on this invoice (e.g. known data gaps). */
  allowedAnomalies?: GoldenAnomalyCode[];
  notes?: string;
}

export interface GoldenCapturedFields {
  exporter?: string | null;
  consignee?: string | null;
  destinationCountry?: string | null;
  destinationCountryCode?: string | null;
  invoiceNumber?: string | null;
  invoiceValue?: number | null;
  currency?: string | null;
  incoterms?: string | null;
  hsCodes?: string[];
  origin?: GoldenOriginExpectation;
  packageCount?: number | null;
  grossWeight?: number | null;
  netWeight?: number | null;
  customsReadiness?: CustomsReadinessStatus | null;
  declarationReadiness?: DeclarationReadinessStatus | null;
  dataExtractionCompleteness?: number | null;
  lineCount?: number | null;
}

export interface GoldenCompareOptions {
  valueTolerance?: number;
  stringMatch?: "exact" | "contains" | "normalized";
}

export interface GoldenFieldDifference {
  field: keyof GoldenCapturedFields | string;
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface GoldenInvoiceCompareResult {
  id: string;
  label: string;
  passed: boolean;
  fieldDifferences: GoldenFieldDifference[];
  anomalies: GoldenAnomaly[];
  unexpectedAnomalies: GoldenAnomaly[];
  criticalAnomalies: GoldenAnomaly[];
  extractionAccuracy: number;
  customsReadinessMatch: boolean;
  readinessFieldsMatched: number;
  readinessFieldsTotal: number;
}

export interface GoldenDatasetSummary {
  runAt: string;
  totalInvoices: number;
  passed: number;
  failed: number;
  passRate: number;
  failureRate: number;
  avgExtractionAccuracy: number;
  customsReadinessAccuracy: number;
  productionReadinessPercent: number;
  criticalAnomalyCount: number;
  recurringDefects: Array<{ code: string; count: number; invoices: string[] }>;
  fieldFailureCounts: Array<{ field: string; count: number }>;
  results: GoldenInvoiceCompareResult[];
}

export const GOLDEN_COMPARE_FIELDS: Array<keyof GoldenCapturedFields> = [
  "exporter",
  "consignee",
  "destinationCountry",
  "destinationCountryCode",
  "invoiceNumber",
  "invoiceValue",
  "incoterms",
  "hsCodes",
  "origin",
  "packageCount",
  "grossWeight",
  "netWeight",
  "customsReadiness",
  "declarationReadiness",
  "dataExtractionCompleteness",
  "lineCount",
];
