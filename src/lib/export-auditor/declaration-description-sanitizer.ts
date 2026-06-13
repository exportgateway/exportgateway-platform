const PART_CODE_PATTERNS: RegExp[] = [
  /\bREF[-_][A-Z0-9-]+\b/gi,
  /\b[A-Z]{2,5}[-_]\d+\b/gi,
  /\bTYPE[-_][A-Z0-9]+\b/gi,
  /\bSERIES[-_]?\d+\b/gi,
  /\bLOT[-_]?\d+\b/gi,
  /\b(?:PN|P\/N|PART\s*(?:NO|#)?\.?)\s*[:#]?\s*[\w-]+\b/gi,
  /\b(?:MOD|MODEL)\s*[:#]?\s*[\w-]+\b/gi,
  /\b[A-Z]{1,3}\d{2,}[A-Z0-9-]*\b/g,
];

const BRAND_BLOCKLIST: RegExp[] = [
  /\bpepperl\s*[+&]?\s*fuchs\b/gi,
  /\bsiemens\b/gi,
  /\babb\b/gi,
  /\bsick\b/gi,
  /\bifm\b/gi,
  /\ballen\s*bradley\b/gi,
  /\brockwell\b/gi,
  /\bschneider\b/gi,
  /\bphoenix\s*contact\b/gi,
  /\bwago\b/gi,
  /\bfesto\b/gi,
  /\bbosch\b/gi,
];

const MARKETING_FLUFF: RegExp[] = [
  /\b(?:premium|high[\s-]?quality|top[\s-]?quality|brand[\s-]?new|genuine|original|authentic|professional|industrial[\s-]?grade|heavy[\s-]?duty|best[\s-]?in[\s-]?class|state[\s-]?of[\s-]?the[\s-]?art|innovative|advanced|superior|ultimate|exclusive|deluxe|luxury|new\s+arrival)\b/gi,
  /\b(?:made\s+in\s+\w+)\b/gi,
];

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Strip part codes, brands, and marketing language before AI/rules processing. */
export function sanitizeCommercialDescription(original: string): string {
  let cleaned = original.trim();
  if (!cleaned) return "";

  for (const pattern of [...PART_CODE_PATTERNS, ...BRAND_BLOCKLIST, ...MARKETING_FLUFF]) {
    cleaned = cleaned.replace(pattern, " ");
  }

  cleaned = cleaned.replace(/\(\s*\)/g, " ");
  cleaned = cleaned.replace(/[,;|/\\]+/g, " ");
  cleaned = cleaned.replace(/\s+[-–—]\s+/g, " ");

  return collapseSpaces(cleaned);
}
