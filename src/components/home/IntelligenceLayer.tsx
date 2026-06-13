"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/ui/AnimatedSection";
import { formatMetricPlus, PLATFORM_METRICS } from "@/lib/platform-metrics";

const dataAssets = [
  { name: "AES Export Declarations", count: formatMetricPlus(PLATFORM_METRICS.exportDeclarationsAnalysed), use: "Customs Intelligence" },
  { name: "AES Import Declarations", count: formatMetricPlus(PLATFORM_METRICS.importRecordsIndexed), use: "Customs Intelligence" },
  { name: "Historical Freight Shipments", count: formatMetricPlus(PLATFORM_METRICS.historicalFreightShipmentsDisplay), use: "Freight Intelligence" },
  { name: "EU Countries Covered", count: String(PLATFORM_METRICS.euCountriesCovered), use: "Freight corridors" },
  { name: "EU CN8 Nomenclature", count: "Full index", use: "CN / HS Classification" },
  { name: "Product Taxonomy", count: "40+ families", use: "Classification rules" },
  { name: "Customs Lexicon", count: "Multilingual", use: "Product Understanding" },
  { name: "EU VAT Rates", count: "27 states", use: "Compliance estimates" },
];

export function IntelligenceLayer() {
  return (
    <section className="section-padding bg-surface-dark relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-[0.04]" />
      <div className="container-narrow relative">
        <AnimatedSection>
          <SectionHeader
            badge="Data Layer"
            title="Built on real trade data — not generic AI"
            description="ExportGateway's intelligence layer combines indexed customs declarations, EU nomenclature, taxonomy rules, and historical freight records."
            dark
          />
        </AnimatedSection>

        <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {dataAssets.map((asset) => (
            <StaggerItem key={asset.name}>
              <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card p-5 card-hover">
                <p className="text-2xl font-bold text-white tabular-nums">{asset.count}</p>
                <p className="mt-1 text-sm font-medium text-slate-300">{asset.name}</p>
                <p className="mt-1 text-xs text-brand-400">{asset.use}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <AnimatedSection delay={0.2}>
          <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card/80 p-6 sm:p-8">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Classification pipeline</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {[
                "Product Description",
                "OpenAI Understanding",
                "Taxonomy + Lexicon",
                "CN Nomenclature FTS",
                "AES Historical FTS",
                "Ranked CN + Confidence",
              ].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="rounded-lg bg-brand-500/10 border border-brand-500/20 px-3 py-1.5 text-brand-300 text-xs font-medium">
                    {step}
                  </span>
                  {i < arr.length - 1 && <span className="text-slate-600">→</span>}
                </span>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-500 leading-relaxed">
              Duty estimates currently use illustrative sample data. Live TARIC integration is In Development.
            </p>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
