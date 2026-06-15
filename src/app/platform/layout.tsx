import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { PlatformSubNav } from "@/components/platform/PlatformSubNav";
import { PlatformPlanShell } from "@/components/plan-simulator/PlatformPlanShell";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingLayout>
      <PlatformPlanShell>
        <PlatformSubNav />
        {children}
      </PlatformPlanShell>
    </MarketingLayout>
  );
}
