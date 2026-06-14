import { NextResponse } from "next/server";
import { getWizardUrl } from "@/lib/api-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = getWizardUrl();

  try {
    const [healthRes, rootRes] = await Promise.all([
      fetch(`${base}/health`, { cache: "no-store", signal: AbortSignal.timeout(12_000) }),
      fetch(`${base}/`, { cache: "no-store", signal: AbortSignal.timeout(12_000) }),
    ]);

    const healthOk = healthRes.ok;
    let health: Record<string, unknown> | null = null;
    if (healthOk) {
      try {
        health = (await healthRes.json()) as Record<string, unknown>;
      } catch {
        health = null;
      }
    }

    return NextResponse.json({
      wizardUrl: base,
      healthOk,
      uiOk: rootRes.ok,
      uiStatus: rootRes.status,
      apiReady: healthOk,
      uiReady: rootRes.ok,
      message: rootRes.ok
        ? "Wizard UI available"
        : healthOk
          ? "Wizard API is healthy but the UI page failed to load — redeploy export-compliance-wizard with the TemplateResponse fix"
          : "Wizard backend unreachable",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wizard status check failed";
    return NextResponse.json(
      {
        wizardUrl: base,
        healthOk: false,
        uiOk: false,
        uiStatus: 0,
        apiReady: false,
        uiReady: false,
        message,
      },
      { status: 503 }
    );
  }
}
