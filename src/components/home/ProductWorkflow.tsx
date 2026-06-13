"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { workflowSteps, pillarMeta } from "@/lib/platform-modules";
import { cn } from "@/lib/utils";

const pillarLabelClass: Record<string, string> = {
  blue: "text-blue-600",
  cyan: "text-cyan-600",
  emerald: "text-emerald-600",
  violet: "text-violet-600",
};

export function ProductWorkflow() {
  return (
    <section className="section-padding bg-white">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Workflow"
            title="From product description to export-ready shipment"
            description="Seven connected steps across all four platform pillars — solid steps are available today, dashed steps are on the roadmap."
          />
        </AnimatedSection>

        <div className="relative max-w-3xl mx-auto">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-surface-border hidden sm:block" />
          <div className="space-y-6">
            {workflowSteps.map((step) => {
              const isFuture = step.status === "in-development" || step.status === "coming-soon";
              const pillar = pillarMeta[step.pillar];
              return (
                <AnimatedSection key={step.step} delay={step.step * 0.05}>
                  <div
                    className={cn(
                      "relative flex gap-4 sm:gap-6 sm:pl-12",
                      isFuture && "opacity-80"
                    )}
                  >
                    <div
                      className={cn(
                        "hidden sm:flex absolute left-0 h-12 w-12 items-center justify-center rounded-full border-2 bg-white text-sm font-bold z-10",
                        isFuture ? "border-dashed border-slate-300 text-slate-400" : "border-brand-500 text-brand-600"
                      )}
                    >
                      {step.step}
                    </div>
                    <div
                      className={cn(
                        "flex-1 rounded-xl border p-5",
                        isFuture ? "border-dashed border-slate-200 bg-slate-50/50" : "border-surface-border bg-white card-hover"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="sm:hidden text-xs font-bold text-brand-600">Step {step.step}</span>
                        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", pillarLabelClass[pillar.accent])}>
                          {pillar.title}
                        </span>
                        <ModuleStatusBadge status={step.status} />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">{step.description}</p>
                    </div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
