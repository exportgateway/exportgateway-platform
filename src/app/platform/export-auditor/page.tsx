import type { Metadata } from "next";
import { PlatformToolOverview } from "@/components/platform/PlatformToolOverview";
import { ExportAuditorWorkspace } from "@/components/export-auditor/ExportAuditorWorkspace";
import { getPlatformTool } from "@/lib/platform-tools";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Export Auditor — Invoice Compliance Audit",
  description:
    "Upload an export invoice and receive a complete export compliance audit within seconds — OCR, HS codes, readiness, EUR.1 analysis, and customs disposition.",
  path: "/platform/export-auditor",
});

export default function PlatformExportAuditorPage() {
  const tool = getPlatformTool("export-auditor");

  return (
    <div className="pt-8 pb-20 sm:pb-28">
      <div className="container-narrow px-4 sm:px-6 lg:px-8 space-y-10">
        <PlatformToolOverview tool={tool} />
        <div className="platform-panel p-6 sm:p-8">
          <ExportAuditorWorkspace />
        </div>
      </div>
    </div>
  );
}
