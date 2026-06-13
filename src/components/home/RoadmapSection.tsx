"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { roadmap, type RoadmapCategory } from "@/lib/platform-modules";
import { pillarMeta } from "@/lib/platform-modules";
import { cn } from "@/lib/utils";

const categoryStyles: Record<RoadmapCategory, string> = {
  "available-today": "border-emerald-200 bg-emerald-50/30",
  "in-development": "border-amber-200 bg-amber-50/30",
  planned: "border-slate-200 bg-slate-50/50",
};

const categoryBadge: Record<RoadmapCategory, "live" | "in-development" | "coming-soon"> = {
  "available-today": "live",
  "in-development": "in-development",
  planned: "coming-soon",
};

export function RoadmapSection() {
  const categories = Object.entries(roadmap) as [RoadmapCategory, (typeof roadmap)[RoadmapCategory]][];

  return (
    <section id="roadmap" className="section-padding bg-surface-muted/40">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Roadmap"
            title="The platform is growing"
            description="ExportGateway launches in phases. Here's what's available today, what's in active development, and what's planned."
          />
        </AnimatedSection>

        <div className="grid lg:grid-cols-3 gap-6">
          {categories.map(([key, category], i) => (
            <AnimatedSection key={key} delay={i * 0.1}>
              <div className={cn("rounded-2xl border p-6 h-full", categoryStyles[key])}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-slate-900">{category.label}</h3>
                  <ModuleStatusBadge status={categoryBadge[key]} />
                </div>
                <p className="text-sm text-slate-500 mb-5">{category.description}</p>
                <ul className="space-y-3">
                  {category.items.map((item) => (
                    <li key={item.name} className="rounded-lg bg-white/80 border border-surface-border px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {pillarMeta[item.pillar].title.split(" ")[0]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection className="mt-10 text-center" delay={0.3}>
          <Link
            href="/early-access"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Join early access for launch updates
            <ArrowRight className="h-4 w-4" />
          </Link>
        </AnimatedSection>
      </div>
    </section>
  );
}
