import type { Metadata } from "next";
import { PlatformWizardTool } from "@/components/platform/PlatformWizardTool";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Customs Intelligence — Export Classification Wizard",
  description:
    "Determine the most likely CN/HS tariff from a product description — AES historical evidence, knowledge base, AI, and cached web research.",
  path: "/platform/customs",
});

export default function PlatformCustomsPage() {
  return (
    <div className="pt-4 pb-16 sm:pb-24">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <PlatformWizardTool />
      </div>
    </div>
  );
}
