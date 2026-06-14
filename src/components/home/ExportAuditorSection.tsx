"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { FadeIn } from "@/components/ui/AnimatedSection";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";

const workflowSteps = [
  "Upload invoice",
  "OCR extraction",
  "HS classification",
  "Export validation",
  "Customs readiness report",
];

const benefits = [
  "OCR document extraction",
  "HS code detection",
  "EUR.1 readiness",
  "Origin checks",
  "Export compliance validation",
];

export function ExportAuditorSection() {
  return (
    <section id="export-auditor" className="section-padding bg-gradient-to-b from-violet-50/60 to-white border-y border-surface-border">
      <div className="container-narrow">
        <FadeIn>
          <SectionHeader
            badge="Export Auditor"
            title="Upload an invoice. Get export-ready in minutes."
            description="AI-powered OCR extraction, HS detection, and customs readiness validation — the fastest path from invoice to compliant export filing."
          />
        </FadeIn>

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
          <FadeIn delay={0.1}>
            <div className="rounded-2xl border border-violet-100 bg-white p-6 sm:p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-6">
                How it works
              </p>
              <ol className="space-y-4">
                {workflowSteps.map((step, i) => (
                  <li key={step} className="flex items-center gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-800 uppercase tracking-wide">
                      {step}
                    </span>
                    {i < workflowSteps.length - 1 && (
                      <span className="hidden sm:block ml-auto text-violet-300" aria-hidden>
                        ↓
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <ul className="space-y-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-slate-700">
                  <Check className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
                  <span className="text-sm font-medium">{benefit}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button href="/platform/export-auditor" size="lg">
                Try Export Auditor
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Link
                href="/pricing"
                className="btn-secondary justify-center"
              >
                View pricing
              </Link>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
