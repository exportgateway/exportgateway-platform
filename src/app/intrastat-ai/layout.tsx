import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { PlatformPlanShell } from "@/components/plan-simulator/PlatformPlanShell";

export default function IntrastatAiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingLayout>
      <PlatformPlanShell>{children}</PlatformPlanShell>
    </MarketingLayout>
  );
}
