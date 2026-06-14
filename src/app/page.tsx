import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HeroSection } from "@/components/home/HeroSection";
import { PlatformTrustMetrics } from "@/components/home/PlatformTrustMetrics";
import { ExportAuditorSection } from "@/components/home/ExportAuditorSection";
import { WhyExportGateway } from "@/components/home/WhyExportGateway";
import { PlatformLaunchCards } from "@/components/home/PlatformLaunchCards";
import { TrustComplianceSection } from "@/components/home/TrustComplianceSection";
import { IntrastatAiSection } from "@/components/home/IntrastatAiSection";
import { RoadmapSection } from "@/components/home/RoadmapSection";
import { PricingTeaser } from "@/components/home/PricingTeaser";
import { FAQPreview } from "@/components/home/FAQPreview";
import { CTASection } from "@/components/home/CTASection";
import { FAQPageJsonLd } from "@/components/seo/JsonLd";
import { faqItems } from "@/lib/constants";
import { buildPageMetadata } from "@/lib/seo";
import { IS_PRELAUNCH } from "@/config/prelaunch";

export const metadata: Metadata = buildPageMetadata({
  title: "AI-Powered Trade Compliance Platform",
  description:
    "One platform for customs, freight and trade compliance. Upload invoices, classify goods, validate exports, estimate freight, and prepare Intrastat — built for exporters and customs professionals.",
  path: "/",
});

export default function HomePage() {
  return (
    <MarketingLayout>
      {!IS_PRELAUNCH && <FAQPageJsonLd items={faqItems.slice(0, 5)} />}
      <HeroSection />
      <PlatformTrustMetrics />
      <ExportAuditorSection />
      <WhyExportGateway />
      <PlatformLaunchCards />
      <TrustComplianceSection />
      <IntrastatAiSection />
      <RoadmapSection />
      <PricingTeaser />
      <FAQPreview />
      <CTASection />
    </MarketingLayout>
  );
}
