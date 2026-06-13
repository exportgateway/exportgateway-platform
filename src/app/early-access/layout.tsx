import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Early Access",
  description: "Join ExportGateway early access for Pro features, platform launch updates, and priority onboarding.",
  path: "/early-access",
});

export default function EarlyAccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
