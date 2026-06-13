import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HeroSection } from "@/components/home/HeroSection";
import { WhyExportGateway } from "@/components/home/WhyExportGateway";
import { PlatformLaunchCards } from "@/components/home/PlatformLaunchCards";
import { PlatformTrustMetrics } from "@/components/home/PlatformTrustMetrics";
import { FreightIntelligenceStats } from "@/components/home/FreightIntelligenceStats";
import { DataSourcesSection } from "@/components/home/DataSourcesSection";
import { PlatformOverview } from "@/components/home/PlatformOverview";
import { ProductPillars } from "@/components/home/ProductPillars";
import { ProductWorkflow } from "@/components/home/ProductWorkflow";
import { IntelligenceLayer } from "@/components/home/IntelligenceLayer";
import { RoadmapSection } from "@/components/home/RoadmapSection";
import { CustomsDisclaimerSection } from "@/components/home/CustomsDisclaimerSection";
import { PricingTeaser } from "@/components/home/PricingTeaser";
import { SecurityPreview } from "@/components/home/SecurityPreview";
import { FAQPreview } from "@/components/home/FAQPreview";
import { CTASection } from "@/components/home/CTASection";
import { FAQPageJsonLd } from "@/components/seo/JsonLd";
import { faqItems } from "@/lib/constants";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "The Trade Operating System for Exporters & Customs Professionals",
  description:
    "ExportGateway connects customs intelligence, freight pricing, export documentation, and AI trade assistance — one platform for exporters, forwarders, and customs brokers.",
  path: "/",
});

export default function HomePage() {
  return (
    <MarketingLayout>
      <FAQPageJsonLd items={faqItems.slice(0, 5)} />
      <HeroSection />
      <PlatformTrustMetrics />
      <WhyExportGateway />
      <PlatformLaunchCards />
      <FreightIntelligenceStats />
      <PlatformOverview />
      <DataSourcesSection />
      <ProductPillars />
      <ProductWorkflow />
      <IntelligenceLayer />
      <RoadmapSection />
      <CustomsDisclaimerSection />
      <PricingTeaser />
      <SecurityPreview />
      <FAQPreview />
      <CTASection />
    </MarketingLayout>
  );
}
