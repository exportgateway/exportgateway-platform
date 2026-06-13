import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { PlatformSubNav } from "@/components/platform/PlatformSubNav";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingLayout>
      <PlatformSubNav />
      {children}
    </MarketingLayout>
  );
}
