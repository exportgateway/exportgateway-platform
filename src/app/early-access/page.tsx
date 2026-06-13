import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { EarlyAccessForm } from "@/components/early-access/EarlyAccessForm";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";

export const metadata: Metadata = {
  title: "Early Access",
  description: "Join ExportGateway early access for platform launch updates, Pro features, and Freight Intelligence public deployment.",
};

export default async function EarlyAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const plan = params.plan;

  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0">
          <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto items-start">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <ModuleStatusBadge status="in-development" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Join Early Access</h1>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">
                ExportGateway is preparing for public launch. Join early access to get notified when the
                Dashboard, Freight Intelligence public deployment, Pro features, and AI Trade Assistant launch.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Compliance Wizard is Live today — no wait required
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-500 font-bold">→</span>
                  Early access members get Pro launch pricing
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-500 font-bold">→</span>
                  Priority onboarding for forwarders and brokers
                </li>
              </ul>
            </div>
            <EarlyAccessForm defaultPlan={plan} />
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
