"use client";

/**
 * @deprecated Archived 2026-06-15 — replaced by native ClassificationWizard.
 * Legacy iframe embed for WordPress / historical reference only.
 * Do not import from production paths.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";
import { getWizardUrl } from "@/lib/api-config";
import { cn } from "@/lib/utils";

interface WizardEmbedProps {
  className?: string;
}

interface WizardStatus {
  healthOk: boolean;
  uiOk: boolean;
  uiStatus: number;
  message?: string;
}

const INITIAL_IFRAME_HEIGHT = 520;
const RESIZE_POLL_MS = 400;
const RESIZE_BURST_DELAYS_MS = [0, 100, 250, 500, 1000, 2000, 4000, 8000];

export function WizardEmbed({ className }: WizardEmbedProps) {
  const wizardBaseUrl = getWizardUrl();
  const wizardOrigin = useMemo(() => new URL(wizardBaseUrl).origin, [wizardBaseUrl]);
  const { effectivePlan } = usePlanAccess();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeHeightRef = useRef(INITIAL_IFRAME_HEIGHT);
  const heightSyncedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(INITIAL_IFRAME_HEIGHT);
  const [heightSynced, setHeightSynced] = useState(false);

  const iframeSrc = useMemo(() => {
    const url = new URL(wizardBaseUrl);
    url.searchParams.set("embedded", "1");
    url.searchParams.set("plan", effectivePlan);
    return url.toString();
  }, [wizardBaseUrl, effectivePlan]);

  const applyIframeHeight = useCallback((rawHeight: number) => {
    if (!Number.isFinite(rawHeight) || rawHeight <= 0) return;
    const nextHeight = Math.max(INITIAL_IFRAME_HEIGHT, Math.ceil(rawHeight));
    const prevHeight = iframeHeightRef.current;
    iframeHeightRef.current = nextHeight;
    setIframeHeight(nextHeight);
    if (nextHeight > prevHeight + 8) {
      heightSyncedRef.current = true;
      setHeightSynced(true);
    }
  }, []);

  const requestIframeResize = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: "egw-request-resize" }, wizardOrigin);
  }, [wizardOrigin]);

  async function checkWizardStatus() {
    setStatusLoading(true);
    setLoaded(false);
    iframeHeightRef.current = INITIAL_IFRAME_HEIGHT;
    heightSyncedRef.current = false;
    setIframeHeight(INITIAL_IFRAME_HEIGHT);
    setHeightSynced(false);
    try {
      const res = await fetch("/api/wizard-status", { cache: "no-store" });
      const data = (await res.json()) as WizardStatus;
      setStatus(data);
    } catch {
      setStatus({
        healthOk: false,
        uiOk: false,
        uiStatus: 0,
        message: "Could not reach wizard status endpoint",
      });
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    void checkWizardStatus();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !loaded) return;
    iframe.contentWindow.postMessage({ type: "egw-plan", plan: effectivePlan }, wizardOrigin);
    requestIframeResize();
  }, [effectivePlan, loaded, requestIframeResize, wizardOrigin]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== wizardOrigin) return;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return;
      if (event.data?.type !== "egw-wizard-resize") return;
      applyIframeHeight(Number(event.data.height));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyIframeHeight, wizardOrigin]);

  useEffect(() => {
    if (!loaded || statusLoading || (status != null && !status.uiOk)) return;

    requestIframeResize();
    const burstTimers = RESIZE_BURST_DELAYS_MS.map((delay) =>
      setTimeout(requestIframeResize, delay)
    );
    const pollTimer = setInterval(requestIframeResize, RESIZE_POLL_MS);

    return () => {
      burstTimers.forEach(clearTimeout);
      clearInterval(pollTimer);
    };
  }, [loaded, iframeSrc, requestIframeResize, status, statusLoading]);

  const uiUnavailable = status != null && !status.uiOk;
  const showIframe = !statusLoading && !uiUnavailable;
  const iframeScrolling = heightSynced ? "no" : "auto";

  const errorPanel = (
    <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 bg-slate-50 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <p className="text-base font-semibold text-slate-900">Classification Wizard UI unavailable</p>
        <p className="text-sm leading-relaxed text-slate-600">
          {status?.healthOk
            ? "The wizard API is running, but the web UI returned an error."
            : status?.message ?? "The Export Classification Wizard backend could not be reached."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void checkWizardStatus()}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-surface-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
        <a
          href={wizardBaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <ExternalLink className="h-4 w-4" />
          Open wizard URL
        </a>
      </div>
    </div>
  );

  return (
    <div
      className={cn("w-full rounded-2xl border border-surface-border bg-white shadow-sm", className)}
      data-screenshot="customs-wizard"
    >
      <div
        className="relative w-full overflow-visible"
        style={{
          minHeight:
            statusLoading || uiUnavailable || (showIframe && !loaded)
              ? INITIAL_IFRAME_HEIGHT
              : undefined,
        }}
      >
        {statusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              <p className="mt-3 text-sm text-slate-500">Loading Classification Wizard…</p>
            </div>
          </div>
        )}
        {!statusLoading && uiUnavailable && errorPanel}
        {showIframe && !loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              <p className="mt-3 text-sm text-slate-500">Loading Classification Wizard…</p>
            </div>
          </div>
        )}
        {showIframe && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="Export Classification Wizard"
            className="block w-full border-0 bg-white"
            style={{ height: loaded ? iframeHeight : INITIAL_IFRAME_HEIGHT }}
            scrolling={iframeScrolling}
            allow="clipboard-write"
            onLoad={() => {
              setLoaded(true);
              requestIframeResize();
            }}
          />
        )}
      </div>
    </div>
  );
}
