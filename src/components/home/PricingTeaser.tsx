"use client";

import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { pricingPlans } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function PricingTeaser() {
  return (
    <section className="section-padding bg-white">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Pricing"
            title="Simple pricing for every stage of your export operation"
            description="Automate customs preparation and export compliance — from occasional shipments to high-volume logistics."
          />
        </AnimatedSection>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {pricingPlans.map((plan, i) => (
            <AnimatedSection key={plan.id} delay={i * 0.1}>
              <div
                className={cn(
                  "relative rounded-2xl border p-6 h-full flex flex-col card-hover",
                  plan.highlighted
                    ? "border-brand-500 bg-brand-50/30 shadow-lg shadow-brand-500/10"
                    : "border-surface-border bg-white"
                )}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-white">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                  {plan.period && <span className="text-sm text-slate-500">{plan.period}</span>}
                </div>
                <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.highlighted ? "primary" : "secondary"}
                  href={plan.href}
                  className="mt-6 w-full"
                >
                  {plan.cta}
                </Button>
              </div>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection className="mt-10 text-center" delay={0.3}>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            View full pricing details
            <ArrowRight className="h-4 w-4" />
          </Link>
        </AnimatedSection>
      </div>
    </section>
  );
}
