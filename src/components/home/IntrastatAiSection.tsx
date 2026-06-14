"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "@/components/ui/AnimatedSection";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { Icon } from "@/components/ui/Icon";

const workflowSteps = [
  "Upload invoices",
  "OCR extraction",
  "Tariff validation",
  "Missing data detection",
  "Transport cost allocation",
  "Intrastat report generation",
];

const featureCards = [
  {
    icon: "FileSearch" as const,
    title: "OCR Invoice Processing",
    description: "Extract line items, values, and product data from invoices and ERP exports.",
  },
  {
    icon: "Shield" as const,
    title: "AI Tariff Classification",
    description: "Suggest CN/HS codes aligned with Intrastat reporting requirements.",
  },
  {
    icon: "Globe" as const,
    title: "Intrastat Validation Engine",
    description: "Validate mandatory fields, thresholds, and country-specific rules.",
  },
  {
    icon: "Truck" as const,
    title: "Transport Cost Allocation",
    description: "Split freight costs across countries for accurate statistical reporting.",
  },
  {
    icon: "FileText" as const,
    title: "Report Generation",
    description: "Prepare Intrastat reporting files ready for submission workflows.",
  },
  {
    icon: "Lock" as const,
    title: "Audit Trail",
    description: "Full traceability from source documents to generated reports.",
  },
];

export function IntrastatAiSection() {
  return (
    <section id="intrastat-ai" className="section-padding bg-white border-y border-surface-border">
      <div className="container-narrow">
        <FadeIn>
          <div className="text-center mx-auto max-w-3xl mb-12 sm:mb-16">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
                Intrastat AI
              </span>
              <ModuleStatusBadge status="coming-soon" />
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-balance leading-tight text-slate-900">
              Intrastat AI Auditor
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-balance text-slate-600">
              Upload invoices. ExportGateway prepares Intrastat reporting data automatically.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-5">
              Workflow
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm font-medium text-slate-700">
              {workflowSteps.map((step, i) => (
                <span key={step} className="inline-flex items-center gap-2">
                  <span className="rounded-lg bg-white border border-emerald-100 px-3 py-1.5 shadow-sm">
                    {step}
                  </span>
                  {i < workflowSteps.length - 1 && (
                    <span className="text-emerald-400 hidden sm:inline" aria-hidden>
                      ↓
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featureCards.map((card, i) => (
            <FadeIn key={card.title} delay={0.05 * i}>
              <div className="relative h-full rounded-2xl border border-surface-border bg-surface-muted/20 p-5">
                <ModuleStatusBadge
                  status="coming-soon"
                  className="absolute top-4 right-4 scale-90 origin-top-right"
                />
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Icon name={card.icon} className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 pr-20">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{card.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.3}>
          <div className="mt-10 text-center">
            <Link
              href="/intrastat-ai"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              Learn about Intrastat AI Auditor
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
