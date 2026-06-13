"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  type CookieConsentState,
  defaultCookieConsent,
  readCookieConsent,
  writeCookieConsent,
} from "@/lib/cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const stored = readCookieConsent();
    if (!stored) setVisible(true);
  }, []);

  function persist(partial: Pick<CookieConsentState, "analytics" | "marketing">) {
    writeCookieConsent({
      ...defaultCookieConsent(),
      ...partial,
      decidedAt: new Date().toISOString(),
    });
    setVisible(false);
    setManageOpen(false);
  }

  function acceptAll() {
    persist({ analytics: true, marketing: true });
  }

  function rejectAll() {
    persist({ analytics: false, marketing: false });
  }

  function savePreferences() {
    persist({ analytics, marketing });
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-surface-border bg-white/95 p-4 shadow-2xl backdrop-blur sm:p-6"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
    >
      <div className="container-narrow mx-auto max-w-4xl">
        {!manageOpen ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h2 id="cookie-consent-title" className="text-sm font-semibold text-slate-900">
                Cookie preferences
              </h2>
              <p id="cookie-consent-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
                We use necessary cookies to run ExportGateway. With your consent we may use analytics
                cookies to improve the platform. Marketing cookies are reserved for future campaigns.{" "}
                <Link href="/cookies" className="font-medium text-brand-600 hover:text-brand-700">
                  Cookie Policy
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={rejectAll}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reject All
              </button>
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Manage Preferences
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Accept All
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Manage cookie preferences</h2>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start justify-between gap-4 rounded-lg border border-surface-border p-3">
                <div>
                  <p className="font-medium text-slate-900">Necessary</p>
                  <p className="mt-0.5 text-slate-500">Required for site functionality and consent storage.</p>
                </div>
                <span className="text-xs font-semibold text-slate-400">Always on</span>
              </li>
              <li className="flex items-start justify-between gap-4 rounded-lg border border-surface-border p-3">
                <div>
                  <p className="font-medium text-slate-900">Analytics</p>
                  <p className="mt-0.5 text-slate-500">Anonymous usage metrics to improve tools and content.</p>
                </div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="h-4 w-4 rounded border-surface-border text-brand-600"
                  />
                  <span className="sr-only">Enable analytics cookies</span>
                </label>
              </li>
              <li className="flex items-start justify-between gap-4 rounded-lg border border-surface-border p-3">
                <div>
                  <p className="font-medium text-slate-900">Marketing</p>
                  <p className="mt-0.5 text-slate-500">Future campaign and attribution cookies (not active today).</p>
                </div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={marketing}
                    onChange={(e) => setMarketing(e.target.checked)}
                    className="h-4 w-4 rounded border-surface-border text-brand-600"
                  />
                  <span className="sr-only">Enable marketing cookies</span>
                </label>
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
