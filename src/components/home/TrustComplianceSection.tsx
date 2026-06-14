"use client";

import { Check } from "lucide-react";
import { FadeIn } from "@/components/ui/AnimatedSection";
import { SectionHeader } from "@/components/ui/SectionHeader";

const audiences = [
  "Exporters",
  "Customs Brokers",
  "Freight Forwarders",
  "Trade Compliance Teams",
];

export function TrustComplianceSection() {
  return (
    <section className="section-padding bg-surface-muted/30">
      <div className="container-narrow">
        <FadeIn>
          <SectionHeader
            badge="Trust & Compliance"
            title="Built for trade professionals"
            description="ExportGateway is designed for teams who need accurate customs, freight, and compliance workflows — not generic logistics software."
          />
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-6">
            {audiences.map((audience) => (
              <div
                key={audience}
                className="inline-flex items-center gap-2.5 rounded-full border border-surface-border bg-white px-5 py-2.5 shadow-sm"
              >
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-semibold text-slate-800">{audience}</span>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
