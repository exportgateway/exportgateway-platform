/**
 * HS classification workflow — invoice, wizard, user override, and import sources.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { filterGoodsLines, normalizeAggregationItems } from "@/lib/export-auditor/hs-aggregation-engine";
import { normalizeAndValidateHsToken } from "@/lib/export-auditor/hs-code-normalize";
import {
  isServiceOrTransportLine,
  shouldSkipHsValidationForLine,
} from "@/lib/export-auditor/service-line-detection";
import {
  INVALID_HS_FORMAT,
  UNKNOWN_HS_CODE,
  compareHsStatusSeverity,
  formatHsValidationSource,
  hsConfidenceForStatus,
  isAggregationEligibleHsStatus,
  validateHsCode,
  worstHsStatus,
} from "@/lib/export-auditor/hs-validation-engine";
import type { HsAggregationRow, HsSource, HsStatus, LineHsClassification } from "@/lib/export-auditor/types";

function resolvePositionNumber(item: ApiInvoiceItem, index: number): number {
  const extended = item as ApiInvoiceItem & { position_number?: number | null };
  return typeof extended.position_number === "number" && extended.position_number > 0
    ? extended.position_number
    : index + 1;
}

function resolveRawHsCandidates(item: ApiInvoiceItem): string[] {
  const extended = item as ApiInvoiceItem & {
    final_hs_code?: string | null;
    invoice_hs_code?: string | null;
    hs_code?: string | null;
    wizard_hs_code?: string | null;
  };
  return [
    extended.hs_code,
    extended.invoice_hs_code,
    extended.final_hs_code,
    extended.wizard_hs_code,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function resolvePrimaryInvoiceHsRaw(item: ApiInvoiceItem): string | null {
  const extended = item as ApiInvoiceItem & {
    invoice_hs_code?: string | null;
    hs_code?: string | null;
  };
  return extended.invoice_hs_code?.trim() || extended.hs_code?.trim() || null;
}

function validateItemHsCandidate(raw: string | null | undefined) {
  return validateHsCode(raw);
}

/** Resolve final HS code used for aggregation and declaration (any source). */
export function resolveFinalHsCodeForItem(item: ApiInvoiceItem): string | null {
  const extended = item as ApiInvoiceItem & {
    final_hs_code?: string | null;
    hs_code?: string | null;
    wizard_hs_code?: string | null;
    invoice_hs_code?: string | null;
  };

  for (const raw of [
    extended.final_hs_code,
    extended.hs_code,
    extended.invoice_hs_code,
    extended.wizard_hs_code,
  ]) {
    const validation = validateItemHsCandidate(raw);
    if (validation.hsStatus === "INVALID_FORMAT" || validation.hsStatus === "MISSING") {
      continue;
    }
    if (validation.normalizedHs) return validation.normalizedHs;
  }

  return null;
}

/** Invoice-printed HS before wizard/user/import override. */
export function resolveInvoiceHsCodeForItem(item: ApiInvoiceItem): string | null {
  const validation = validateItemHsCandidate(resolvePrimaryInvoiceHsRaw(item));
  return validation.normalizedHs;
}

function resolveHsSource(
  item: ApiInvoiceItem,
  invoiceHsCode: string | null,
  finalHsCode: string | null
): HsSource | null {
  const extended = item as ApiInvoiceItem & {
    hs_source?: HsSource | null;
    wizard_hs_code?: string | null;
  };
  const explicitSource = extended.hs_source ?? null;
  const wizardValidation = validateItemHsCandidate(extended.wizard_hs_code);

  if (!finalHsCode) return null;
  if (explicitSource) return explicitSource;
  if (invoiceHsCode && invoiceHsCode === finalHsCode) return "INVOICE";
  if (wizardValidation.normalizedHs === finalHsCode && !invoiceHsCode) return "WIZARD";
  if (invoiceHsCode && invoiceHsCode !== finalHsCode) return "USER";
  return "INVOICE";
}

function buildSkippedServiceLineClassification(positionNumber: number): LineHsClassification {
  return {
    positionNumber,
    invoiceHsCode: null,
    normalizedHsCode: null,
    finalHsCode: null,
    hsStatus: "MISSING",
    hsSource: null,
    repairApplied: false,
    validationSource: "none",
    hsConfidence: hsConfidenceForStatus("MISSING"),
  };
}

/** Classify a single goods line for HS status and source. */
export function classifyLineHs(item: ApiInvoiceItem, positionNumber: number): LineHsClassification {
  if (isServiceOrTransportLine(item.description)) {
    return buildSkippedServiceLineClassification(positionNumber);
  }

  const invoiceRaw = resolvePrimaryInvoiceHsRaw(item);
  const invoiceValidation = validateItemHsCandidate(invoiceRaw);
  const finalHsCode = resolveFinalHsCodeForItem(item);
  const finalValidation = finalHsCode
    ? validateItemHsCandidate(finalHsCode)
    : invoiceValidation;

  const hsStatus: HsStatus = (() => {
    if (!finalHsCode) return invoiceValidation.hsStatus;
    if (
      invoiceValidation.repairApplied &&
      invoiceValidation.normalizedHs === finalHsCode
    ) {
      return "REPAIRED";
    }
    return finalValidation.hsStatus;
  })();

  const hsSource = resolveHsSource(item, invoiceValidation.normalizedHs, finalHsCode);

  return {
    positionNumber,
    invoiceHsCode: invoiceValidation.invoiceHs,
    normalizedHsCode: finalHsCode ?? invoiceValidation.normalizedHs,
    finalHsCode,
    hsStatus,
    hsSource,
    repairApplied: invoiceValidation.repairApplied || finalValidation.repairApplied,
    validationSource: finalValidation.validationSource,
    hsConfidence: hsConfidenceForStatus(hsStatus),
  };
}

/** Build line-level HS classifications for all invoice items. */
export function buildLineHsClassifications(invoice: NormalizedInvoice): LineHsClassification[] {
  const items = invoice.items ?? [];
  return items.map((item, index) => classifyLineHs(item, resolvePositionNumber(item, index)));
}

/** Document-level HS status — worst severity across goods lines (service lines excluded). */
export function evaluateDocumentHsStatus(classifications: LineHsClassification[]): HsStatus {
  const goodsLines = classifications.filter(
    (line) =>
      line.finalHsCode ||
      line.hsStatus === "INVALID_FORMAT" ||
      line.hsStatus === "UNKNOWN_HS"
  );
  if (goodsLines.length === 0) {
    return "MISSING";
  }
  return worstHsStatus(goodsLines.map((line) => line.hsStatus));
}

export function collectFinalHsCodes(classifications: LineHsClassification[]): string[] {
  return [
    ...new Set(
      classifications
        .filter((line) => line.finalHsCode && isAggregationEligibleHsStatus(line.hsStatus))
        .map((line) => line.finalHsCode as string)
    ),
  ];
}

export interface HsWorkflowSummary {
  documentHsStatus: HsStatus;
  linesWithFinalHs: number;
  totalGoodsLines: number;
  finalHsCodes: string[];
  lineClassifications: LineHsClassification[];
}

export function buildHsWorkflowSummary(invoice: NormalizedInvoice): HsWorkflowSummary {
  const lineClassifications = buildLineHsClassifications(invoice);
  const goodsItems = filterGoodsLines(normalizeAggregationItems(invoice));
  const goodsClassifications = lineClassifications.filter((line) =>
    goodsItems.some((item) => item.position_number === line.positionNumber)
  );

  const linesWithFinalHs = goodsClassifications.filter((line) => line.finalHsCode).length;

  return {
    documentHsStatus: evaluateDocumentHsStatus(goodsClassifications),
    linesWithFinalHs,
    totalGoodsLines: goodsItems.length,
    finalHsCodes: collectFinalHsCodes(goodsClassifications),
    lineClassifications,
  };
}

export function hasHsForCustomsReady(summary: Pick<HsWorkflowSummary, "documentHsStatus">): boolean {
  return (
    summary.documentHsStatus === "VALID" ||
    summary.documentHsStatus === "REPAIRED" ||
    summary.documentHsStatus === "UNKNOWN_HS"
  );
}

export function deriveAggregationHsMetadata(
  row: Pick<HsAggregationRow, "hsCode" | "sourcePositions">,
  classifications: LineHsClassification[]
): Pick<
  HsAggregationRow,
  "hsStatus" | "hsSource" | "invoiceHsCode" | "normalizedHsCode" | "repairApplied" | "validationSource" | "hsConfidence"
> {
  const lines = classifications.filter(
    (line) => row.sourcePositions.includes(line.positionNumber) && line.finalHsCode === row.hsCode
  );

  if (lines.length === 0) {
    return {
      hsStatus: "MISSING",
      hsSource: null,
      invoiceHsCode: null,
      normalizedHsCode: null,
      repairApplied: false,
      validationSource: "none",
      hsConfidence: 0,
    };
  }

  const hsStatus = worstHsStatus(lines.map((line) => line.hsStatus));
  const sources = [...new Set(lines.map((line) => line.hsSource).filter(Boolean))] as HsSource[];
  const hsSource = sources.length === 1 ? sources[0]! : sources[0] ?? null;
  const primary = lines[0]!;

  return {
    hsStatus,
    hsSource,
    invoiceHsCode: primary.invoiceHsCode,
    normalizedHsCode: primary.normalizedHsCode,
    repairApplied: lines.some((line) => line.repairApplied),
    validationSource: primary.validationSource,
    hsConfidence: hsConfidenceForStatus(hsStatus),
  };
}

export function formatHsStatusLabel(status: HsStatus): string {
  switch (status) {
    case "VALID":
      return "Valid";
    case "REPAIRED":
      return "Repaired";
    case "INVALID_FORMAT":
      return "Invalid format";
    case "UNKNOWN_HS":
      return "Unknown HS";
    case "MISSING":
      return "Missing";
    default:
      return status;
  }
}

export function formatHsSourceLabel(source: HsSource | null): string {
  if (!source) return "—";
  switch (source) {
    case "INVOICE":
      return "Invoice";
    case "WIZARD":
      return "Wizard";
    case "USER":
      return "User";
    case "IMPORTED":
      return "Imported";
    default:
      return source;
  }
}

/** Collect invalid-format HS issues from line items. */
export function collectInvalidHsCodeIssues(invoice: NormalizedInvoice): Array<{
  id: string;
  type: "error";
  message: string;
  field: string;
}> {
  const issues: Array<{ id: string; type: "error"; message: string; field: string }> = [];
  const seen = new Set<string>();

  for (const [index, item] of (invoice.items ?? []).entries()) {
    if (isServiceOrTransportLine(item.description)) continue;

    for (const raw of resolveRawHsCandidates(item)) {
      if (shouldSkipHsValidationForLine(item.description, raw)) continue;

      const validation = validateHsCode(raw);
      if (validation.hsStatus !== "INVALID_FORMAT") continue;
      const position =
        typeof item.position_number === "number" && item.position_number > 0
          ? item.position_number
          : index + 1;
      const key = `${position}:${validation.invoiceHs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        id: INVALID_HS_FORMAT,
        type: "error",
        message: `Invalid HS code "${validation.invoiceHs}" on position ${position}`,
        field: INVALID_HS_FORMAT,
      });
    }
  }

  return issues;
}

/** Collect unknown-nomenclature HS issues from line items. */
export function collectUnknownHsCodeIssues(invoice: NormalizedInvoice): Array<{
  id: string;
  type: "warning";
  message: string;
  field: string;
}> {
  const issues: Array<{ id: string; type: "warning"; message: string; field: string }> = [];
  const seen = new Set<string>();

  for (const [index, item] of (invoice.items ?? []).entries()) {
    if (isServiceOrTransportLine(item.description)) continue;

    for (const raw of resolveRawHsCandidates(item)) {
      if (shouldSkipHsValidationForLine(item.description, raw)) continue;

      const validation = validateHsCode(raw);
      if (validation.hsStatus !== "UNKNOWN_HS") continue;
      const position =
        typeof item.position_number === "number" && item.position_number > 0
          ? item.position_number
          : index + 1;
      const key = `${position}:${validation.normalizedHs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        id: UNKNOWN_HS_CODE,
        type: "warning",
        message: `HS code "${validation.normalizedHs}" on position ${position} not found in nomenclature index`,
        field: UNKNOWN_HS_CODE,
      });
    }
  }

  return issues;
}

export { formatHsValidationSource, normalizeAndValidateHsToken };
