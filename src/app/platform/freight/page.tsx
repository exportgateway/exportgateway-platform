import type { Metadata } from "next";
import { PlatformToolOverview } from "@/components/platform/PlatformToolOverview";
import { FreightCalculatorForm } from "@/components/platform/FreightCalculatorForm";
import { FreightIntelligenceStrip } from "@/components/platform/FreightIntelligenceStrip";
import { getPlatformTool } from "@/lib/platform-tools";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Freight Intelligence — Freight Calculator",
  description:
    "Estimate EU road freight for FTL and LTL shipments using Mapbox routing, historical lane data, and machine learning.",
  path: "/platform/freight",
});

export default function PlatformFreightPage() {
  const tool = getPlatformTool("freight");

  return (
    <div className="pt-8 pb-20 sm:pb-28">
      <div className="container-narrow px-4 sm:px-6 lg:px-8 space-y-10">
        <PlatformToolOverview tool={tool} />
        <div className="platform-panel p-6 sm:p-8">
          <h2 className="platform-section-title mb-1">Freight Calculator</h2>
          <p className="mb-4 text-sm text-slate-500">
            Search pickup and delivery locations — coordinates are resolved automatically.
          </p>
          <FreightIntelligenceStrip />
          <div className="mt-6">
            <FreightCalculatorForm />
          </div>
        </div>
      </div>
    </div>
  );
}
