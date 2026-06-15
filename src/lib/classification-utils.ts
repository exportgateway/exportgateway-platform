/** Presentation helpers for native Classification Wizard — display only. */

export function formatCnCode(code: string | null | undefined): string {
  return String(code ?? "—").replace(/\s/g, "");
}

export function formatCnCodeSpaced(code: string | null | undefined): string {
  const digits = formatCnCode(code);
  if (digits === "—" || digits.length < 4) return digits;
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)}`;
  }
  if (digits.length >= 6) {
    return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  }
  return digits;
}

/** User-facing confidence source label */
export function formatConfidenceSource(source: string): string {
  const normalized = source.trim();
  if (normalized === "AI Classification") return "AI Analysis";
  return normalized;
}

export function capitalizeEvidenceStrength(strength: string): string {
  if (!strength || strength === "—") return "None";
  return strength.charAt(0).toUpperCase() + strength.slice(1).toLowerCase();
}

/** Parse AES declaration count from GET /health response. */
export function extractAesRecordCount(health: Record<string, unknown> | null | undefined): number | null {
  if (!health) return null;
  const engine = health.aes_knowledge_engine as Record<string, unknown> | undefined;
  if (!engine) return null;

  const historical = Number(engine.historical_records);
  if (Number.isFinite(historical) && historical > 0) return historical;

  const exports = Number(engine.exports_records);
  const imports = Number(engine.imports_records);
  if (Number.isFinite(exports) && Number.isFinite(imports) && exports + imports > 0) {
    return exports + imports;
  }
  return null;
}

export function formatAesStatLabel(count: number | null): string {
  if (count == null || count < 1000) return "70,000+";
  const rounded = Math.floor(count / 1000) * 1000;
  return `${rounded.toLocaleString("en-US")}+`;
}

export function isLowConfidenceResult(confidence: string, manualRecommended: boolean): boolean {
  return confidence === "LOW" || manualRecommended;
}
