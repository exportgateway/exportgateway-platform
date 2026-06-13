"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/ui/AnimatedSection";
import { homepageTrustStats } from "@/lib/platform-metrics";

export function PlatformTrustMetrics() {
  return (
    <section className="section-padding bg-brand-50/40 border-y border-brand-100/60">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Platform Intelligence"
            title="Built on real EU trade data"
            description="ExportGateway draws on indexed customs declarations, import records, and historical freight shipments — not generic AI guesses."
          />
        </AnimatedSection>

        <StaggerContainer className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {homepageTrustStats.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className="rounded-2xl border border-brand-200/60 bg-white px-5 py-6 text-center shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-brand-700 sm:text-4xl">{stat.value}</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{stat.label}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
