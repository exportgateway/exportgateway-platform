import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { FAQAccordion } from "@/components/ui/FAQAccordion";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { CTASection } from "@/components/home/CTASection";
import {
  intrastatAiFaq,
  intrastatAiFeatures,
  intrastatAiWorkflow,
} from "@/lib/intrastat-ai-content";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Intrastat AI Auditor | ExportGateway",
  description:
    "Upload invoices and automatically prepare Intrastat reporting data using OCR, AI tariff classification and validation workflows.",
  path: "/intrastat-ai",
  noIndex: true,
});

export default function IntrastatAiPage() {
  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0">
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <ModuleStatusBadge status="coming-soon" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
              Enterprise-ready
            </span>
          </div>
          <SectionHeader
            title="Intrastat AI Auditor"
            description="Upload invoices and ERP exports. AI extracts product data, validates Intrastat requirements, suggests tariff codes and prepares reporting files."
          />
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-2">
            <Button href="/early-access" size="lg">
              Join Early Access
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" href="/contact" size="lg">
              Book a Demo
            </Button>
          </div>
        </div>
      </section>

      <section className="section-padding bg-surface-muted/30 border-y border-surface-border">
        <div className="container-narrow max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-6">
            What is Intrastat AI Auditor?
          </h2>
          <p className="text-slate-600 leading-relaxed text-center">
            Intrastat reporting requires accurate product codes, values, weights, and country-of-origin
            data across high-volume trade flows. Intrastat AI Auditor automates the path from source
            invoices to validated reporting datasets — reducing manual data entry, classification errors,
            and submission delays for exporters and compliance teams operating in the EU.
          </p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-narrow">
          <SectionHeader
            badge="How it works"
            title="How AI automates Intrastat reporting"
            description="A connected workflow from document upload to report-ready output."
          />
          <div className="max-w-2xl mx-auto flex flex-wrap justify-center gap-2 sm:gap-3">
            {intrastatAiWorkflow.map((step, i) => (
              <span key={step} className="inline-flex items-center gap-2">
                <span className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  {step}
                </span>
                {i < intrastatAiWorkflow.length - 1 && (
                  <span className="text-slate-300 hidden sm:inline" aria-hidden>
                    ↓
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-surface-muted/20">
        <div className="container-narrow">
          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {intrastatAiFeatures.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-surface-border bg-white p-6 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-slate-900">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-narrow">
          <SectionHeader
            badge="FAQ"
            title="Frequently asked questions"
            description="Common questions about Intrastat AI Auditor."
          />
          <div className="max-w-3xl mx-auto">
            <FAQAccordion items={intrastatAiFaq} />
          </div>
          <p className="mt-8 text-center text-sm text-slate-500">
            Explore live tools today on the{" "}
            <Link href="/platform" className="text-brand-600 hover:underline font-medium">
              Platform Hub
            </Link>
            .
          </p>
        </div>
      </section>

      <CTASection />
    </MarketingLayout>
  );
}
