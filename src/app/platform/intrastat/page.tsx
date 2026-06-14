import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Intrastat AI Auditor",
  description:
    "Intrastat AI Auditor — upload invoices and automatically prepare Intrastat reporting data using OCR, AI tariff classification and validation workflows.",
  path: "/platform/intrastat",
  noIndex: true,
});

export default function PlatformIntrastatRedirectPage() {
  redirect("/intrastat-ai");
}
