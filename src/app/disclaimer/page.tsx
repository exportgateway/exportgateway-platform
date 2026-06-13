import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { customsDisclaimer, legalEntity } from "@/lib/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Customs & Trade Disclaimer",
  description: "ExportGateway customs and trade disclaimer — indicative estimates, verification requirements, and liability limitations.",
  path: "/disclaimer",
});

export default function DisclaimerPage() {
  return (
    <MarketingLayout>
      <article className="pt-32 pb-16 sm:pt-40">
        <div className="container-text section-padding !pt-0 px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{customsDisclaimer.title}</h1>
          <p className="mt-4 text-lg text-slate-600">{customsDisclaimer.summary}</p>
          <p className="mt-2 text-sm text-slate-500">
            Operated by {legalEntity.companyName} · Last updated: June 9, 2026
          </p>

          <div className="mt-10 space-y-6">
            {customsDisclaimer.points.map((point, i) => (
              <section key={i} className="rounded-xl border border-amber-100 bg-amber-50/30 p-6">
                <p className="text-slate-700 leading-relaxed">{point}</p>
              </section>
            ))}
          </div>

          <section className="mt-12 rounded-xl border border-surface-border bg-surface-muted/50 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Contact</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Questions about this disclaimer? Contact{" "}
              <a href={`mailto:${legalEntity.email}`} className="text-brand-600 hover:underline">
                {legalEntity.email}
              </a>
              . For legal terms see our{" "}
              <Link href="/terms" className="text-brand-600 hover:underline">Terms & Conditions</Link>.
            </p>
          </section>
        </div>
      </article>
    </MarketingLayout>
  );
}
