import type { Metadata } from "next";

import { Check } from "lucide-react";

import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { CTASection } from "@/components/home/CTASection";
import { pricingPlans } from "@/lib/constants";
import { buildPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "ExportGateway pricing — Free customs workflow tools, Pro at €49/month for regular exporters, Enterprise at €190/month for customs brokers and high-volume operations.",
  path: "/pricing",
});

const comparisonFeatures = [
  { name: "Export Auditor", free: true, pro: true, enterprise: true },
  { name: "OCR Invoice Validation", free: true, pro: true, enterprise: true },
  { name: "Export Readiness Check", free: true, pro: true, enterprise: true },
  { name: "Rule-Based Validation Engine", free: false, pro: true, enterprise: true },
  { name: "Preference Origin Analysis", free: false, pro: true, enterprise: true },
  { name: "EUR.1 Eligibility Check", free: false, pro: true, enterprise: true },
  { name: "Customs Disposition Generator", free: false, pro: true, enterprise: true },
  { name: "AI Validation", free: false, pro: false, enterprise: true },
  { name: "AI Customs Reasoning", free: false, pro: false, enterprise: true },
  { name: "AI Tariff Wizard", free: false, pro: false, enterprise: true },
  { name: "AI Declaration Review", free: false, pro: false, enterprise: true },
  { name: "Mixed-Origin Intelligence", free: false, pro: false, enterprise: true },
  { name: "MRN Preparation", free: false, pro: false, enterprise: true },
  { name: "HS Aggregation", free: false, pro: false, enterprise: true },
  { name: "Multi-Document Audit", free: false, pro: false, enterprise: true },
  { name: "Team Accounts", free: false, pro: false, enterprise: true },
  { name: "API Access", free: false, pro: false, enterprise: true },
];

export default function PricingPage() {
  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0">
          <SectionHeader
            badge="Pricing"
            title="Plans for every stage of your export operation"
            description="Automate customs preparation, validate export documents, and reduce filing risk — from occasional shipments to high-volume logistics operations."
          />

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
            {pricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl border p-8 flex flex-col card-hover",
                  plan.highlighted
                    ? "border-brand-500 bg-brand-50/40 shadow-2xl shadow-brand-500/15 md:scale-[1.04] md:z-10 ring-2 ring-brand-500/20"
                    : "border-surface-border bg-white md:mt-4 md:mb-4"
                )}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    className={cn(
                      "font-bold text-slate-900",
                      plan.highlighted ? "text-5xl" : "text-4xl"
                    )}
                  >
                    {plan.price}
                  </span>
                  {plan.period && <span className="text-slate-500">{plan.period}</span>}
                </div>
                <p className="mt-3 text-sm text-slate-500">{plan.description}</p>
                <ul className="mt-8 space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <Check className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                  {plan.limits && plan.limits.length > 0 && (
                    <>
                      <li className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Limits
                      </li>
                      {plan.limits.map((limit) => (
                        <li
                          key={limit}
                          className="flex items-start gap-2.5 text-sm text-slate-500"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                          {limit}
                        </li>
                      ))}
                    </>
                  )}
                </ul>
                <Button
                  variant={plan.highlighted ? "primary" : "secondary"}
                  href={plan.href}
                  className="mt-8 w-full"
                  size="lg"
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-10 max-w-2xl mx-auto rounded-2xl border border-surface-border bg-slate-50/80 p-6 text-center">
            <p className="text-lg font-semibold text-slate-900">
              One customs declaration can take 30–120 minutes.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  Manual processing
                </p>
                <p className="text-2xl font-bold text-slate-900">30–120 minutes</p>
                <p className="text-xs text-slate-500 mt-0.5">per shipment</p>
              </div>
              <span className="hidden sm:block text-slate-300 text-2xl" aria-hidden>
                vs
              </span>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  ExportGateway
                </p>
                <p className="text-2xl font-bold text-brand-600">Seconds to minutes</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600 leading-relaxed">
              Reduce export preparation time, improve document quality, and identify compliance
              risks before customs filing.
            </p>
          </div>
        </div>
      </section>

      <section className="section-padding bg-surface-muted/50">
        <div className="container-narrow">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">Compare plans</h2>
          <div className="overflow-x-auto rounded-2xl border border-surface-border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-6 py-4 text-left font-semibold text-slate-900">Feature</th>
                  <th className="px-6 py-4 text-center font-semibold text-slate-900">Free</th>
                  <th className="px-6 py-4 text-center font-semibold text-brand-600">Pro</th>
                  <th className="px-6 py-4 text-center font-semibold text-slate-900">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature) => (
                  <tr key={feature.name} className="border-b border-surface-border last:border-0">
                    <td className="px-6 py-3.5 text-slate-700">{feature.name}</td>
                    {[feature.free, feature.pro, feature.enterprise].map((included, i) => (
                      <td key={i} className="px-6 py-3.5 text-center">
                        {included ? (
                          <Check className="h-4 w-4 text-brand-600 mx-auto" />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <CTASection />
    </MarketingLayout>
  );
}
