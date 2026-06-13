"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
export function CTASection() {
  return (
    <section className="section-padding">
      <div className="container-narrow">
        <AnimatedSection>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 px-8 py-16 sm:px-12 sm:py-20 text-center">
            <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-10" />
            <div className="relative">
              <p className="text-sm font-semibold text-brand-200 uppercase tracking-wider mb-4">Pre-launch</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white text-balance max-w-2xl mx-auto">
                Ready to move trade intelligence into one platform?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">
                Start with the Compliance Wizard today — free, no signup. Join early access for the full
                ExportGateway launch.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  href="/platform"
                  size="lg"
                  className="bg-white text-brand-700 hover:bg-brand-50 shadow-lg"
                >
                  Open Platform
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline-dark"
                  href="/platform/customs"
                  size="lg"
                  className="border-white/25 text-white hover:bg-white/10"
                >
                  Try Compliance Wizard
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
