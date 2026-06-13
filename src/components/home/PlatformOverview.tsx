"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/ui/AnimatedSection";
import { verifiedMetrics, pillarMeta } from "@/lib/platform-modules";
import type { PillarId } from "@/lib/platform-modules";

export function PlatformOverview() {
  const pillars = Object.entries(pillarMeta) as [PillarId, (typeof pillarMeta)[PillarId]][];

  return (
    <section id="platform" className="section-padding bg-surface-muted/40">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Platform"
            title="Everything trade professionals need — one connected platform"
            description="ExportGateway replaces fragmented spreadsheets, tariff lookup tools, freight calculators, and document templates with a single intelligence layer shared across every module."
          />
        </AnimatedSection>

        <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {pillars.map(([id, meta]) => (
            <StaggerItem key={id}>
              <Link
                href={`#pillar-${id}`}
                className="group block rounded-2xl border border-surface-border bg-white p-5 card-hover h-full"
              >
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${meta.gradient} text-white`}>
                  <Icon name={meta.icon} className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">
                  {meta.title}
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{meta.tagline}</p>
                <ArrowRight className="mt-3 h-4 w-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <AnimatedSection delay={0.2}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {verifiedMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-surface-border bg-white px-4 py-5 text-center"
              >
                <p className="text-2xl font-bold text-brand-600 tabular-nums">{metric.value}</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">{metric.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{metric.detail}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
