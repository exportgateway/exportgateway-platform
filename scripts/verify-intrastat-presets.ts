/**
 * Validates Intrastat quick-route presets at build time.
 * Ensures coordinates exist and live allocation API succeeds for each preset.
 */
import { intrastatPresets } from "../src/lib/intrastat-presets";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_WIZARD_URL?.replace(/\/$/, "") ||
  "https://export-compliance-wizard.onrender.com";

function assertCoordinates(
  location: { latitude: number; longitude: number; city: string },
  label: string
): void {
  const { latitude, longitude, city } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`${label}: missing coordinates for ${city}`);
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error(`${label}: invalid coordinates for ${city}`);
  }
}

async function verifyPresetApi(preset: (typeof intrastatPresets)[number]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/intrastat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from_lat: preset.from.latitude,
      from_lon: preset.from.longitude,
      to_lat: preset.to.latitude,
      to_lon: preset.to.longitude,
      total_cost: parseFloat(preset.total_cost) || 100,
      domestic_country: preset.reporting_country,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${preset.label}: API ${res.status} — ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { success?: boolean; total_km?: number; detail?: string };
  if (!data.success) {
    throw new Error(`${preset.label}: API returned success=false — ${data.detail ?? "unknown"}`);
  }
  if (!Number.isFinite(data.total_km) || (data.total_km ?? 0) <= 0) {
    throw new Error(`${preset.label}: invalid total_km`);
  }
}

async function main(): Promise<void> {
  console.log("Verifying Intrastat quick-route presets…");

  if (intrastatPresets.length === 0) {
    throw new Error("No intrastat presets defined");
  }

  const ids = new Set<string>();
  for (const preset of intrastatPresets) {
    if (!preset.id || ids.has(preset.id)) {
      throw new Error(`Duplicate or missing preset id: ${preset.id}`);
    }
    ids.add(preset.id);

    assertCoordinates(preset.from, `${preset.label} (from)`);
    assertCoordinates(preset.to, `${preset.label} (to)`);

    if (!preset.reporting_country?.trim()) {
      throw new Error(`${preset.label}: missing reporting_country`);
    }

    await verifyPresetApi(preset);
    console.log(`  ✓ ${preset.label}`);
  }

  console.log(`✅ All ${intrastatPresets.length} Intrastat presets verified`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("❌ Intrastat preset verification failed:", message);
  process.exit(1);
});
