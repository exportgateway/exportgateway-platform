"use server";

import { getApiBaseUrl } from "@/lib/api-config";
import type {
  ClassifyV2Request,
  ClassifyV2Response,
  UsageResponse,
} from "@/lib/wizard-types";

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
    }
    return `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export type ClassifyProductV2Result =
  | { success: true; data: ClassifyV2Response }
  | { success: false; detail: string };

export type ClassificationUsageResult =
  | { success: true; data: UsageResponse }
  | { success: false; detail: string };

export interface WizardHealthResponse {
  status: string;
  production_ready?: boolean;
  aes_loading?: boolean;
  app?: string;
  environment?: string;
  [key: string]: unknown;
}

export type WizardHealthResult =
  | { success: true; data: WizardHealthResponse }
  | { success: false; detail: string };

/** POST /classify/v2 — server-side fetch (no client CORS). */
export async function classifyProductV2(
  payload: ClassifyV2Request
): Promise<ClassifyProductV2Result> {
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/classify/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, detail: await parseApiError(res) };
    }

    return { success: true, data: (await res.json()) as ClassifyV2Response };
  } catch (err) {
    return {
      success: false,
      detail: err instanceof Error ? err.message : "Network error contacting classification API",
    };
  }
}

/** GET /classify/v2/usage — monthly plan usage snapshot. */
export async function getClassificationUsage(plan: string): Promise<ClassificationUsageResult> {
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(
      `${baseUrl}/classify/v2/usage?plan=${encodeURIComponent(plan)}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return { success: false, detail: await parseApiError(res) };
    }

    return { success: true, data: (await res.json()) as UsageResponse };
  } catch (err) {
    return {
      success: false,
      detail: err instanceof Error ? err.message : "Network error contacting classification API",
    };
  }
}

/** GET /health — wizard backend availability (API-only). */
export async function healthCheck(): Promise<WizardHealthResult> {
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/health`, { cache: "no-store" });

    if (!res.ok) {
      return { success: false, detail: await parseApiError(res) };
    }

    return { success: true, data: (await res.json()) as WizardHealthResponse };
  } catch (err) {
    return {
      success: false,
      detail: err instanceof Error ? err.message : "Network error contacting classification API",
    };
  }
}
