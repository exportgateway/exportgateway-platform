/**
 * HS / tariff code normalization, OCR repair, and validation.
 * Final codes must match ^[0-9]{6,12}$ — no alphabetic characters.
 */

export const HS_CODE_PATTERN = /^[0-9]{6,12}$/;

export const INVALID_HS_CODE = "INVALID_HS_CODE";

export const INVALID_HS_CODE_MESSAGE =
  "HS code contains invalid characters and could not be repaired from OCR";

const OCR_REPAIR_MAP: Record<string, string> = {
  O: "0",
  o: "0",
  I: "1",
  i: "1",
  l: "1",
  B: "8",
  b: "8",
  S: "5",
  s: "5",
};

export interface HsNormalizationResult {
  raw: string;
  normalized: string | null;
  invalid: boolean;
  repaired: boolean;
}

/** Remove spaces, dots, and dashes from a raw HS token. */
export function stripHsSeparators(raw: string): string {
  return raw.trim().replace(/[\s.\-–—]+/g, "");
}

function applyOcrRepair(token: string): { value: string; repaired: boolean } {
  let repaired = false;
  let output = "";
  for (const char of token) {
    const replacement = OCR_REPAIR_MAP[char];
    if (replacement != null) {
      output += replacement;
      if (replacement !== char) repaired = true;
    } else {
      output += char;
    }
  }
  return { value: output, repaired };
}

function isValidHsDigits(value: string): boolean {
  return HS_CODE_PATTERN.test(value);
}

function hasRepairableOcrCharacters(token: string): boolean {
  return [...token].some((char) => OCR_REPAIR_MAP[char] != null);
}

function tokenLooksLikeHsAttempt(token: string): boolean {
  if (!token) return false;
  return /[0-9A-Za-z]/.test(token);
}

/**
 * Normalize, OCR-repair, and validate an HS token.
 * Returns invalid=true when the raw token looks like an HS code but cannot be validated.
 */
export function normalizeAndValidateHsToken(raw: string | null | undefined): HsNormalizationResult {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { raw: "", normalized: null, invalid: false, repaired: false };
  }

  const stripped = stripHsSeparators(trimmed);
  if (!stripped) {
    return { raw: trimmed, normalized: null, invalid: false, repaired: false };
  }

  if (isValidHsDigits(stripped)) {
    return { raw: trimmed, normalized: stripped, invalid: false, repaired: false };
  }

  if (hasRepairableOcrCharacters(stripped)) {
    const { value, repaired } = applyOcrRepair(stripped);
    if (isValidHsDigits(value)) {
      return { raw: trimmed, normalized: value, invalid: false, repaired };
    }
  }

  if (tokenLooksLikeHsAttempt(stripped)) {
    return { raw: trimmed, normalized: null, invalid: true, repaired: false };
  }

  return { raw: trimmed, normalized: null, invalid: false, repaired: false };
}

/** Normalize a valid HS token, applying OCR repair when needed. Returns null when invalid or empty. */
export function normalizeHsToken(raw: string | null | undefined): string | null {
  return normalizeAndValidateHsToken(raw).normalized;
}

export function isInvalidHsToken(raw: string | null | undefined): boolean {
  return normalizeAndValidateHsToken(raw).invalid;
}
