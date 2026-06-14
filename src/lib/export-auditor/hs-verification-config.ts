/**
 * HS Verification thresholds — configurable via environment.
 * Used when comparing invoice HS codes against Export Compliance Wizard classification.
 */

function parseThreshold(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Minimum wizard confidence (%) to flag a high-confidence HS discrepancy. */
export const HS_VERIFICATION_CONFIDENCE_THRESHOLD = parseThreshold(
  process.env.HS_VERIFICATION_CONFIDENCE_THRESHOLD,
  80
);

/** Minimum description/HS similarity (%) to accept same chapter/subheading as verified. */
export const HS_VERIFICATION_SIMILARITY_THRESHOLD = parseThreshold(
  process.env.HS_VERIFICATION_SIMILARITY_THRESHOLD,
  95
);
