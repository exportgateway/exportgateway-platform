import type { Metadata } from "next";
import { PlatformToolOverview } from "@/components/platform/PlatformToolOverview";
import { WizardEmbed } from "@/components/platform/WizardEmbed";
import { getPlatformTool } from "@/lib/platform-tools";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Customs Intelligence — Export Compliance Wizard",
  description:
    "AI-powered CN/HS classification, document checklists, duty and VAT estimates, and compliance PDF reports.",
  path: "/platform/customs",
});

export default function PlatformCustomsPage() {
  const tool = getPlatformTool("customs");

  return (
    <div className="pt-8 pb-20 sm:pb-28">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1 order-2 lg:order-1">
            <PlatformToolOverview tool={tool} />
          </div>
          <div className="lg:col-span-2 order-1 lg:order-2">
            <WizardEmbed />
          </div>
        </div>
      </div>
    </div>
  );
}
