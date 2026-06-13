"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/ui/AnimatedSection";
import {
  FREIGHT_INTELLIGENCE_STATS,
  formatFreightStatCount,
} from "@/lib/freight-intelligence-config";
import { Route, Truck, Gauge, BarChart3 } from "lucide-react";

const { historicalShipments, freightCorridors, countries } = FREIGHT_INTELLIGENCE_STATS;

const freightStats = [
  {
    icon: Route,
    value: formatFreightStatCount(historicalShipments),
    label: "Historical shipments",
    detail: "Verified EU road freight records",
  },
  {
    icon: Truck,
    value: String(freightCorridors),
    label: "Freight corridors",
    detail: "Lane intelligence across the EU",
  },
  {
    icon: Gauge,
    value: String(countries),
    label: "EU countries",
    detail: "Corridor and routing coverage",
  },
  {
    icon: BarChart3,
    value: "Mapbox",
    label: "Route intelligence",
    detail: "Live driving distance & geometry",
  },
];

export function FreightIntelligenceStats() {
  return (
    <section className="section-padding bg-white border-y border-surface-border">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Freight Intelligence"
            title="EU road freight priced with data, not guesswork"
            description="The Freight Calculator combines Mapbox route intelligence, fuel and toll modelling, and historical lane data from 7,849 verified shipments across 23 corridors in 11 EU countries."
          />
        </AnimatedSection>

        <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {freightStats.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className="rounded-2xl border border-surface-border bg-gradient-to-br from-white to-slate-50/80 p-6 card-hover">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                  <stat.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-2xl font-bold tabular-nums text-slate-900">{stat.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{stat.label}</p>
                <p className="mt-1 text-xs text-slate-500">{stat.detail}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
