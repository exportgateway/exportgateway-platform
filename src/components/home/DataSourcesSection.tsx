"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/ui/AnimatedSection";
import {
  formatMetricPlus,
  PLATFORM_METRICS,
} from "@/lib/platform-metrics";

const dataSources = [
  {
    category: "Customs & Classification",
    sources: [
      { name: "AES Export Declarations", count: formatMetricPlus(PLATFORM_METRICS.exportDeclarationsAnalysed), type: "Analysed for CN ranking" },
      { name: "AES Import Declarations", count: formatMetricPlus(PLATFORM_METRICS.importRecordsIndexed), type: "Indexed import records" },
      { name: "EU CN8 Nomenclature", count: "Full index", type: "Official nomenclature" },
      { name: "Product Taxonomy", count: "40+ families", type: "Classification rules" },
    ],
  },
  {
    category: "Freight & Logistics",
    sources: [
      { name: "Historical Shipments", count: formatMetricPlus(PLATFORM_METRICS.historicalFreightShipmentsDisplay), type: "EU road freight records" },
      { name: "Freight Corridors", count: "23", type: "Lane intelligence" },
      { name: "Mapbox Directions", count: "Live", type: "Route intelligence" },
      { name: "Fuel & Toll Modelling", count: "EU-wide", type: "Dynamic FTL rates" },
    ],
  },
  {
    category: "Compliance & Trade",
    sources: [
      { name: "EU VAT Rates", count: "27 states", type: "Standard rates" },
      { name: "Customs Lexicon", count: "Multilingual", type: "13+ EU languages" },
      { name: "Industrial Lexicon", count: "422+ phrases", type: "Entity recognition" },
      { name: "EU Countries Covered", count: String(PLATFORM_METRICS.euCountriesCovered), type: "Freight & trade data" },
    ],
  },
];

export function DataSourcesSection() {
  const combinedDeclarations =
    PLATFORM_METRICS.exportDeclarationsAnalysed + PLATFORM_METRICS.importRecordsIndexed;

  return (
    <section className="section-padding bg-surface-muted/30">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Data Sources"
            title="Built on verified trade intelligence"
            description={`ExportGateway draws on ${formatMetricPlus(combinedDeclarations)} indexed customs records, EU nomenclature, ${formatMetricPlus(PLATFORM_METRICS.historicalFreightShipmentsDisplay)} historical freight shipments, and live Mapbox routing — not generic AI guesses.`}
          />
        </AnimatedSection>

        <AnimatedSection delay={0.1} className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: formatMetricPlus(PLATFORM_METRICS.exportDeclarationsAnalysed), label: "Export Declarations Analysed" },
              { value: formatMetricPlus(PLATFORM_METRICS.importRecordsIndexed), label: "Import Records Indexed" },
              { value: formatMetricPlus(PLATFORM_METRICS.historicalFreightShipmentsDisplay), label: "Historical Freight Shipments" },
              { value: String(PLATFORM_METRICS.euCountriesCovered), label: "EU Countries Covered" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-white p-5 text-center"
              >
                <p className="text-3xl font-bold tabular-nums text-brand-700">{stat.value}</p>
                <p className="mt-2 text-xs font-semibold text-slate-800">{stat.label}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>

        <StaggerContainer className="mt-10 grid gap-6 lg:grid-cols-3">
          {dataSources.map((group) => (
            <StaggerItem key={group.category}>
              <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-sm h-full">
                <h3 className="text-sm font-bold text-slate-900">{group.category}</h3>
                <ul className="mt-4 space-y-3">
                  {group.sources.map((source) => (
                    <li
                      key={source.name}
                      className="flex items-start justify-between gap-3 border-b border-surface-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{source.name}</p>
                        <p className="text-xs text-slate-400">{source.type}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-brand-600">
                        {source.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
