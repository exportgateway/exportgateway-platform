/** Service / transport invoice lines — excluded from goods aggregation and origin analysis. */

export const LINE_TYPE_SERVICE = "SERVICE" as const;
export const LINE_TYPE_GOODS = "GOODS" as const;
export type InvoiceLineType = typeof LINE_TYPE_SERVICE | typeof LINE_TYPE_GOODS;

const SERVICE_LINE_PATTERNS: RegExp[] = [
  /^\s*transport\s*$/i,
  /\bfreight\b/i,
  /\bmainfreight\b/i,
  /\bshipping\b/i,
  /\bshipping\s+cost\b/i,
  /\bcourier\b/i,
  /\blogistics\b/i,
  /\bservice\s*(?:charge|fee|cost)?\b/i,
  /\btransport\s+costs?\b/i,
  /\bdelivery\s+charge\b/i,
  /\bfreight\s+forward/i,
  /\bexport\s+costs\b/i,
  /stroški\s+izvoza/i,
  /\bprevoz\b/i,
  /\bcarriage\b/i,
];

/** True when a line is freight, transport, shipping, courier, or logistics — not customs goods. */
export function isServiceOrTransportLine(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return false;
  return SERVICE_LINE_PATTERNS.some((re) => re.test(text));
}

export function resolveInvoiceLineType(
  description: string | null | undefined
): InvoiceLineType {
  return isServiceOrTransportLine(description) ? LINE_TYPE_SERVICE : LINE_TYPE_GOODS;
}

/** True for empty, "0", "00000000", or other all-zero padded service HS placeholders. */
export function isPlaceholderServiceHsCode(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return true;
  const stripped = trimmed.replace(/[\s.\-–—]+/g, "");
  if (!stripped) return true;
  return /^0+$/.test(stripped);
}

/** Skip HS format/nomenclature validation for service lines and placeholder service HS tokens. */
export function shouldSkipHsValidationForLine(
  description: string | null | undefined,
  hsRaw: string | null | undefined
): boolean {
  const isService = isServiceOrTransportLine(description);
  return isService || (isService && isPlaceholderServiceHsCode(hsRaw));
}
