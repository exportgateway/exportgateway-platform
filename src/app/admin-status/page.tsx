import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { FEATURE_FLAGS, formatFeatureFlagState } from "@/config/feature-flags";
import { IS_PRELAUNCH } from "@/config/prelaunch";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Admin Status",
  description: "Admin mode and developer tooling flag status.",
  path: "/admin-status",
  noIndex: true,
});

function StatusRow({ label, value }: { label: string; value: string }) {
  const enabled = value === "ENABLED";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-border py-3 last:border-0">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          enabled ? "text-emerald-700" : "text-slate-500"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function AdminStatusPage() {
  const adminModeRaw = process.env.NEXT_PUBLIC_ADMIN_MODE ?? "(unset)";

  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0 max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-slate-900">Admin Status</h1>
          <p className="mt-2 text-sm text-slate-500">
            Developer tooling flags — independent of prelaunch SEO settings.
          </p>

          <div className="mt-8 rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
            <StatusRow
              label="Admin Mode"
              value={formatFeatureFlagState(FEATURE_FLAGS.adminMode)}
            />
            <StatusRow
              label="Validation PDF Export"
              value={formatFeatureFlagState(FEATURE_FLAGS.validationPdfExport)}
            />
            <StatusRow
              label="Golden Dataset Tools"
              value={formatFeatureFlagState(FEATURE_FLAGS.goldenDatasetTools)}
            />
            <StatusRow
              label="OCR Diagnostics"
              value={formatFeatureFlagState(FEATURE_FLAGS.ocrDebugPanels)}
            />
            <StatusRow
              label="Forensic Diagnostics"
              value={formatFeatureFlagState(FEATURE_FLAGS.forensicDiagnostics)}
            />
            <StatusRow
              label="Extraction Trace Logs"
              value={formatFeatureFlagState(FEATURE_FLAGS.extractionTraceLogs)}
            />
          </div>

          <div className="mt-6 rounded-xl border border-surface-border bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
            <p>
              <span className="font-semibold text-slate-800">NEXT_PUBLIC_ADMIN_MODE:</span>{" "}
              {adminModeRaw}
            </p>
            <p>
              <span className="font-semibold text-slate-800">NEXT_PUBLIC_PRELAUNCH:</span>{" "}
              {IS_PRELAUNCH ? "true" : "false"} (does not gate admin tools)
            </p>
            <p className="pt-1 text-slate-500">
              Localhost: set <code className="text-slate-700">NEXT_PUBLIC_ADMIN_MODE=true</code> in{" "}
              <code className="text-slate-700">.env.development</code> or{" "}
              <code className="text-slate-700">.env.local</code>, then restart{" "}
              <code className="text-slate-700">npm run dev</code>.
            </p>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
