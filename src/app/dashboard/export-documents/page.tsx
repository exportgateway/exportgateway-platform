import type { Metadata } from "next";
import {
  DashboardSidebar,
  DashboardHeader,
} from "@/components/layout/DashboardLayout";
import { ModulePlaceholder } from "@/components/dashboard/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Export Documents",
};

export default function ExportDocumentsPage() {
  return (
    <div className="min-h-screen bg-surface-dark">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader title="Export Documents" />
        <main className="p-6 lg:p-8">
          <ModulePlaceholder
            title="Export Documents"
            description="Create and manage export documentation. Generate commercial invoices, packing lists, certificates of origin, and more."
            fields={[
              { label: "Document Type", placeholder: "Commercial Invoice / Packing List / CoO" },
              { label: "Exporter", placeholder: "Your company name" },
              { label: "Consignee", placeholder: "Buyer company name" },
              { label: "Shipment Reference", placeholder: "e.g. EXP-2026-1042" },
            ]}
          />
        </main>
      </div>
    </div>
  );
}
