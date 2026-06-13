import type { Metadata } from "next";
import Link from "next/link";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center text-sm text-amber-900">
        <ModuleStatusBadge status="in-development" className="mr-2 align-middle" />
        ExportGateway Dashboard is In Development —{" "}
        <Link href="/early-access" className="font-semibold underline underline-offset-2">
          Join Early Access
        </Link>{" "}
        ·{" "}
        <Link href="https://export-compliance-wizard.onrender.com" className="font-semibold underline underline-offset-2">
          Try Live Compliance Wizard
        </Link>
      </div>
      {children}
    </>
  );
}
