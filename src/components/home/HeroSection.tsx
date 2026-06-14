"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/AnimatedSection";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { pillarMeta } from "@/lib/platform-modules";
import { formatMetricPlus, PLATFORM_METRICS } from "@/lib/platform-metrics";

const quickSteps = [
  "Upload invoices",
  "Classify goods",
  "Validate exports",
  "Estimate freight",
  "Prepare Intrastat",
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28 lg:pt-44">
      <div className="absolute inset-0 bg-hero-glow" />
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-40" />

      <div className="container-narrow relative px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <FadeIn>
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50/80 px-4 py-1.5 text-sm font-medium text-brand-700">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                  </span>
                  AI-Powered Trade Compliance
                </span>
                <ModuleStatusBadge status="live" showDot />
              </div>
            </FadeIn>

            <FadeIn delay={0.1}>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-slate-900 text-balance leading-[1.1]">
                One platform for customs, freight and{" "}
                <span className="gradient-text">trade compliance</span>
              </h1>
            </FadeIn>

            <FadeIn delay={0.2}>
              <ul className="mt-6 space-y-2 text-base sm:text-lg text-slate-600">
                {quickSteps.map((step) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                    {step}
                  </li>
                ))}
              </ul>
            </FadeIn>

            <FadeIn delay={0.3}>
              <div className="mt-10 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                <Button href="/platform/export-auditor" size="lg" className="justify-center">
                  Try Export Auditor
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="secondary" href="/platform/customs" size="lg" className="justify-center">
                  Try Customs Intelligence
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button variant="secondary" href="/platform/freight" size="lg" className="justify-center">
                  Estimate Freight
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </FadeIn>

            <FadeIn delay={0.4}>
              <p className="mt-6 text-sm text-slate-400">
                Export Auditor is Live · {formatMetricPlus(PLATFORM_METRICS.exportDeclarationsAnalysed)} export
                declarations analysed · No signup required
              </p>
            </FadeIn>
          </div>

          <FadeIn delay={0.3} className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-brand-500/15 via-violet-500/10 to-cyan-500/15 blur-2xl" />
            <div className="relative rounded-2xl border border-surface-border bg-white p-6 sm:p-8 shadow-xl shadow-brand-500/5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-6 text-center">
                ExportGateway Platform
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(pillarMeta) as Array<keyof typeof pillarMeta>).map((key) => {
                  const p = pillarMeta[key];
                  return (
                    <div
                      key={key}
                      className={`rounded-xl bg-gradient-to-br ${p.gradient} p-4 text-white`}
                    >
                      <p className="text-xs font-medium opacity-80">{p.title.split(" ")[0]}</p>
                      <p className="text-sm font-semibold mt-0.5 leading-tight">{p.title}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg bg-surface-dark p-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Intrastat AI Auditor</p>
                <p className="text-sm font-medium text-white mt-1">Automated Intrastat reporting prep</p>
                <div className="mt-3 flex gap-2">
                  <ModuleStatusBadge status="coming-soon" />
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
