export function getWizardUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WIZARD_URL?.replace(/\/$/, "") ||
    "https://export-compliance-wizard.onrender.com"
  );
}

export function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_WIZARD_URL?.replace(/\/$/, "") ||
    "https://export-compliance-wizard.onrender.com"
  );
}

/** Dedicated Export Auditor API — OCR, readiness, disposition, preference-origin, audit-report. */
export function getExportAuditorApiUrl(): string {
  return (
    process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
    "https://export-auditor.onrender.com"
  );
}

/** Public Mapbox token for client-side map rendering (maps only — restrict in Mapbox dashboard). */
export function getMapboxPublicToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
}

/** Mistral OCR billing rate per page (USD) — used for observability cost estimates. */
export function getMistralOcrCostPerPageUsd(): number {
  const raw = process.env.MISTRAL_OCR_COST_PER_PAGE_USD?.trim();
  if (raw) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 0.002;
}
