/** Invoice line types — goods, service/transport, and packaging. */

export const LINE_TYPE_SERVICE = "SERVICE" as const;
export const LINE_TYPE_GOODS = "GOODS" as const;
export const LINE_TYPE_PACKAGING = "PACKAGING" as const;

export type InvoiceLineType =
  | typeof LINE_TYPE_SERVICE
  | typeof LINE_TYPE_GOODS
  | typeof LINE_TYPE_PACKAGING;

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

const PACKAGING_LINE_PATTERNS: RegExp[] = [
  /\bpallet(?:s|te)?\b/i,
  /\bpal\b/i,
  /\bcarton(?:s)?\b/i,
  /\bctn(?:s)?\b/i,
  /\bbox(?:es)?\b/i,
  /\bcrate(?:s)?\b/i,
  /\bpackaging\b/i,
  /\bpacking\s+material\b/i,
  /\bwooden\s+case\b/i,
  /\bwooden\s+box\b/i,
  /^\s*(?:1\s+)?(?:pallet|carton|box|crate)\b/i,
];

/** True when a line is freight, transport, shipping, courier, or logistics — not customs goods. */
export function isServiceOrTransportLine(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return false;
  return SERVICE_LINE_PATTERNS.some((re) => re.test(text));
}

/** True when a line describes packaging materials (pallet, carton, box, crate). */
export function isPackagingLine(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return false;
  if (isServiceOrTransportLine(text)) return false;
  return PACKAGING_LINE_PATTERNS.some((re) => re.test(text));
}

/** True for service/transport or packaging — excluded from HS and origin aggregation. */
export function isNonGoodsLine(description: string | null | undefined): boolean {
  return isServiceOrTransportLine(description) || isPackagingLine(description);
}

export function resolveInvoiceLineType(
  description: string | null | undefined
): InvoiceLineType {
  if (isServiceOrTransportLine(description)) return LINE_TYPE_SERVICE;
  if (isPackagingLine(description)) return LINE_TYPE_PACKAGING;
  return LINE_TYPE_GOODS;
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
  const isPackaging = isPackagingLine(description);
  return isService || isPackaging || (isService && isPlaceholderServiceHsCode(hsRaw));
}
