"use client";

import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/ui/AnimatedSection";
import { whyExportGateway } from "@/lib/platform-modules";

export function WhyExportGateway() {
  return (
    <section className="section-padding bg-white border-b border-surface-border">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Why ExportGateway"
            title="Built different from tariff lookup tools and generic logistics software"
            description="ExportGateway is the trade operating system that connects classification, freight, documents, and AI — with historical customs evidence no competitor offers at this level."
          />
        </AnimatedSection>

        <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {whyExportGateway.map((item) => (
            <StaggerItem key={item.title}>
              <div className="rounded-2xl border border-surface-border bg-surface-muted/30 p-6 h-full card-hover">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon name={item.icon} className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
