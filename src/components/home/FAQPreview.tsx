"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FAQAccordion } from "@/components/ui/FAQAccordion";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { faqItems } from "@/lib/constants";

export function FAQPreview() {
  const preview = faqItems.slice(0, 5);

  return (
    <section className="section-padding bg-white">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="FAQ"
            title="Common questions"
            description="Everything you need to know about ExportGateway during pre-launch."
          />
        </AnimatedSection>

        <AnimatedSection className="max-w-3xl mx-auto">
          <FAQAccordion items={preview} />
        </AnimatedSection>

        <AnimatedSection className="mt-8 text-center">
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            View all questions
            <ArrowRight className="h-4 w-4" />
          </Link>
        </AnimatedSection>
      </div>
    </section>
  );
}
