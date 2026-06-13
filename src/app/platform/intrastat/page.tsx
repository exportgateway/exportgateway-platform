import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformToolOverview } from "@/components/platform/PlatformToolOverview";
import { IntrastatAllocationForm } from "@/components/platform/IntrastatAllocationForm";
import { IntrastatWhySection } from "@/components/platform/IntrastatWhySection";
import { getPlatformTool } from "@/lib/platform-tools";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Intrastat Intelligence — Freight Allocation",
  description:
    "Split freight cost between reporting country and other countries for Intrastat reporting using Mapbox routing.",
  path: "/platform/intrastat",
});

export default function PlatformIntrastatPage() {
  const tool = getPlatformTool("intrastat");

  return (
    <div className="pt-8 pb-20 sm:pb-28">
      <div className="container-narrow px-4 sm:px-6 lg:px-8 space-y-10">
        <PlatformToolOverview tool={tool} />
        <div className="platform-panel p-6 sm:p-8">
          <h2 className="platform-section-title mb-1">Intrastat Allocation</h2>
          <p className="mb-4 text-sm text-slate-500">
            Split freight cost between reporting country and other countries for Intrastat reporting.
          </p>
          <div className="mb-6">
            <IntrastatWhySection />
          </div>
          <Suspense fallback={<div className="text-sm text-slate-500">Loading calculator…</div>}>
            <IntrastatAllocationForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
