import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractCountriesOfOrigin } from "@/lib/export-auditor/invoice-fields";
import { formatOriginCountriesDetected } from "@/lib/export-auditor/origin-countries-summary";
import type { PreferenceOriginAnalysis } from "@/lib/export-auditor/types";

export interface DispositionOriginSummary {
  countryOfOriginLine: string | null;
  originStatusLine: string | null;
  preferentialOriginLine: string | null;
}

export function hasOriginEvidence(preferenceOrigin: PreferenceOriginAnalysis): boolean {
  return (
    preferenceOrigin.originDeclarationFound ||
    preferenceOrigin.authorisedExporterDetected ||
    preferenceOrigin.statementOnOriginDetected ||
    preferenceOrigin.declarationsDetected.length > 0 ||
    preferenceOrigin.lineItems.some(
      (line) => line.preferential_origin === "YES" || line.preferential_origin === "NO"
    )
  );
}

export function isMixedPreferentialOrigin(preferenceOrigin: PreferenceOriginAnalysis): boolean {
  const statuses = new Set(
    preferenceOrigin.lineItems.map((line) => line.preferential_origin)
  );
  if (statuses.size <= 1) {
    return false;
  }
  if (
    statuses.has("YES") &&
    (statuses.has("NO") || statuses.has("NOT_DECLARED") || statuses.has("UNKNOWN"))
  ) {
    return true;
  }
  return statuses.has("NO") && (statuses.has("NOT_DECLARED") || statuses.has("UNKNOWN"));
}

function allLinesPreferential(preferenceOrigin: PreferenceOriginAnalysis): boolean {
  return (
    preferenceOrigin.lineItems.length > 0 &&
    preferenceOrigin.lineItems.every((line) => line.preferential_origin === "YES")
  );
}

/** Build origin summary lines for customs disposition — never emits N/A when evidence exists. */
export function deriveDispositionOriginSummary(
  preferenceOrigin: PreferenceOriginAnalysis,
  invoice: NormalizedInvoice
): DispositionOriginSummary {
  if (!hasOriginEvidence(preferenceOrigin)) {
    return {
      countryOfOriginLine: null,
      originStatusLine: null,
      preferentialOriginLine: null,
    };
  }

  if (
    isMixedPreferentialOrigin(preferenceOrigin) ||
    preferenceOrigin.preferentialOriginStatus === "MIXED_ORIGIN"
  ) {
    const countries = extractCountriesOfOrigin(invoice);
    return {
      countryOfOriginLine:
        countries.length > 0 ? `Country of Origin: ${countries.join(", ")}` : null,
      originStatusLine: "Origin Status: Mixed Origin Goods",
      preferentialOriginLine: "Preferential Origin: Mixed",
    };
  }

  if (preferenceOrigin.preferentialOriginStatus === "NON_PREFERENTIAL_EXPORT") {
    const originDetected = formatOriginCountriesDetected(invoice.items);
    return {
      countryOfOriginLine: originDetected
        ? `Origin Countries Detected: ${originDetected}`
        : null,
      originStatusLine: "Origin Status: NON_PREFERENTIAL_EXPORT",
      preferentialOriginLine: null,
    };
  }

  if (
    preferenceOrigin.preferentialOriginStatus === "CONFIRMED" ||
    allLinesPreferential(preferenceOrigin)
  ) {
    const countries = extractCountriesOfOrigin(invoice);
    return {
      countryOfOriginLine:
        countries.length > 0 ? `Country of Origin: ${countries.join(", ")}` : null,
      originStatusLine: "Origin Status: EU Preferential Origin",
      preferentialOriginLine: "Preferential Origin: Confirmed",
    };
  }

  const countries = extractCountriesOfOrigin(invoice);
  if (countries.length > 0) {
    return {
      countryOfOriginLine: `Country of Origin: ${countries.join(", ")}`,
      originStatusLine: "Origin Status: Non-Preferential Origin",
      preferentialOriginLine: null,
    };
  }

  if (
    preferenceOrigin.originDeclarationFound ||
    preferenceOrigin.authorisedExporterDetected ||
    preferenceOrigin.statementOnOriginDetected
  ) {
    return {
      countryOfOriginLine: null,
      originStatusLine: "Origin Status: EU Preferential Origin",
      preferentialOriginLine:
        preferenceOrigin.preferentialOriginStatus === "CONFIRMED"
          ? "Preferential Origin: Confirmed"
          : null,
    };
  }

  return {
    countryOfOriginLine: null,
    originStatusLine: "Origin Status: Non-Preferential Origin",
    preferentialOriginLine: null,
  };
}

export function formatDispositionOriginSummary(summary: DispositionOriginSummary): string[] {
  return [
    summary.countryOfOriginLine,
    summary.originStatusLine,
    summary.preferentialOriginLine,
  ].filter((line): line is string => Boolean(line?.trim()));
}

const NA_ORIGIN_PATTERNS = [
  /Country of Origin:\s*N\/A\s*/gi,
  /Country of Origin:\s*—\s*/gi,
  /Country of Origin:\s*-\s*/gi,
  /Origin Status:\s*N\/A\s*/gi,
  /Preferential Origin:\s*N\/A\s*/gi,
];

/** Remove placeholder N/A origin lines and inject computed summary when missing. */
export function sanitizeDispositionOriginText(
  text: string,
  originSummary: DispositionOriginSummary
): string {
  let sanitized = text;
  for (const pattern of NA_ORIGIN_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  sanitized = sanitized.replace(/\n{3,}/g, "\n\n").trim();

  const summaryLines = formatDispositionOriginSummary(originSummary);
  if (summaryLines.length === 0) {
    return sanitized;
  }

  const lower = sanitized.toLowerCase();
  const hasOriginContent =
    /country of origin:/i.test(sanitized) ||
    /origin status:/i.test(sanitized) ||
    /preferential origin:/i.test(sanitized);

  if (hasOriginContent) {
    return sanitized;
  }

  return `${sanitized}\n\n${summaryLines.join("\n")}`.trim();
}
