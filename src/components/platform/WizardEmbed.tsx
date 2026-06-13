"use client";

import { useState } from "react";
import { ExternalLink, Maximize2, Minimize2, Shield } from "lucide-react";
import { getWizardUrl } from "@/lib/api-config";
import { cn } from "@/lib/utils";

interface WizardEmbedProps {
  className?: string;
}

export function WizardEmbed({ className }: WizardEmbedProps) {
  const wizardUrl = getWizardUrl();
  const [fullscreen, setFullscreen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const iframe = (
    <iframe
      src={wizardUrl}
      title="Export Compliance Wizard"
      className="h-full w-full border-0 bg-white"
      allow="clipboard-write"
      onLoad={() => setLoaded(true)}
    />
  );

  return (
    <>
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm",
          className
        )}
        data-screenshot="customs-wizard"
      >
        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-gradient-to-r from-slate-50 to-white px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">Export Compliance Wizard</p>
              <p className="text-[11px] text-slate-400 truncate">Live · CN/HS classification & compliance</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-surface-muted"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>
            <a
              href={wizardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-surface-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Tab</span>
            </a>
          </div>
        </div>
        <div className="relative h-[min(75vh,900px)] min-h-[480px] w-full">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                <p className="mt-3 text-sm text-slate-500">Loading Compliance Wizard…</p>
              </div>
            </div>
          )}
          {iframe}
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Export Compliance Wizard</p>
            <div className="flex items-center gap-2">
              <a
                href={wizardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-surface-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in New Tab
              </a>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Exit Full Screen
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">{iframe}</div>
        </div>
      )}
    </>
  );
}
