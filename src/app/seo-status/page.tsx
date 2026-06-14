import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { IS_PRELAUNCH, PRELAUNCH_ROBOTS, X_ROBOTS_TAG_VALUE } from "@/config/prelaunch";
import { FEATURE_FLAGS } from "@/config/feature-flags";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "SEO Status",
  description: "Prelaunch SEO configuration status.",
  path: "/seo-status",
  noIndex: true,
});

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-border py-3 last:border-0">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="text-sm font-semibold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}

export default function SeoStatusPage() {
  const environment = IS_PRELAUNCH ? "PRELAUNCH" : "PRODUCTION";
  const seoDisabled = IS_PRELAUNCH ? "YES" : "NO";
  const robotsBlocked = IS_PRELAUNCH ? "YES" : "NO";
  const sitemapDisabled = IS_PRELAUNCH ? "YES" : "NO";
  const canonicalDisabled = IS_PRELAUNCH ? "YES" : "NO";
  const structuredDataDisabled = IS_PRELAUNCH ? "YES" : "NO";

  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0 max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-slate-900">SEO Status</h1>
          <p className="mt-2 text-sm text-slate-500">
            Deployment verification — search engines must not index prelaunch hosts.
          </p>

          <div className="mt-8 rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
            <StatusRow label="SEO Disabled" value={seoDisabled} />
            <StatusRow label="Robots Blocked" value={robotsBlocked} />
            <StatusRow label="Sitemap Disabled" value={sitemapDisabled} />
            <StatusRow label="Canonical URLs Disabled" value={canonicalDisabled} />
            <StatusRow label="Structured Data Disabled" value={structuredDataDisabled} />
            <StatusRow label="Environment" value={environment} />
            <StatusRow label="Admin Mode" value={FEATURE_FLAGS.adminMode ? "ON" : "OFF"} />
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Developer tooling flags:{" "}
            <a href="/admin-status" className="font-medium text-brand-600 hover:underline">
              /admin-status
            </a>
          </p>

          <div className="mt-6 rounded-xl border border-surface-border bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
            <p>
              <span className="font-semibold text-slate-800">X-Robots-Tag:</span>{" "}
              {IS_PRELAUNCH ? X_ROBOTS_TAG_VALUE : "not set (production indexing allowed)"}
            </p>
            <p>
              <span className="font-semibold text-slate-800">robots index:</span>{" "}
              {String(PRELAUNCH_ROBOTS.index)}
            </p>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
