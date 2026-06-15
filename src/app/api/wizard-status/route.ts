import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-config";

export const dynamic = "force-dynamic";

/** Classification API health — used for monitoring; native wizard calls /health via server actions. */
export async function GET() {
  const base = getApiBaseUrl();

  try {
    const healthRes = await fetch(`${base}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

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
      apiUrl: base,
      healthOk,
      apiReady: healthOk,
      status: health?.status ?? (healthOk ? "ok" : "unavailable"),
      message: healthOk ? "Classification API available" : "Classification API unreachable",
      health,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification API status check failed";
    return NextResponse.json(
      {
        apiUrl: base,
        healthOk: false,
        apiReady: false,
        status: "error",
        message,
      },
      { status: 503 }
    );
  }
}
