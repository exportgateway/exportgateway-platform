import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FAQAccordion } from "@/components/ui/FAQAccordion";
import { CTASection } from "@/components/home/CTASection";
import { FAQPageJsonLd } from "@/components/seo/JsonLd";
import { faqItems } from "@/lib/constants";
import { buildPageMetadata } from "@/lib/seo";
import { IS_PRELAUNCH } from "@/config/prelaunch";

export const metadata: Metadata = buildPageMetadata({
  title: "FAQ",
  description:
    "Frequently asked questions about ExportGateway — classification, freight pricing, security, and early access.",
  path: "/faq",
});

export default function FAQPage() {
  return (
    <MarketingLayout>
      {!IS_PRELAUNCH && <FAQPageJsonLd items={faqItems} />}
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0">
          <SectionHeader
            badge="FAQ"
            title="Frequently asked questions"
            description="Everything you need to know about ExportGateway. Can't find what you're looking for? Contact our team."
          />

          <div className="max-w-3xl mx-auto">
            <FAQAccordion items={faqItems} />
          </div>
        </div>
      </section>

      <CTASection />
    </MarketingLayout>
  );
}
