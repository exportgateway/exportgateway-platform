import type { Metadata } from "next";
import {
  DashboardSidebar,
  DashboardHeader,
} from "@/components/layout/DashboardLayout";
import { ModulePlaceholder } from "@/components/dashboard/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Freight Calculator",
};

export default function FreightCalculatorPage() {
  return (
    <div className="min-h-screen bg-surface-dark">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader title="Freight Calculator" />
        <main className="p-6 lg:p-8">
          <ModulePlaceholder
            title="Freight Calculator"
            description="Compare freight rates across carriers, modes, and lanes. Enter shipment details to get instant rate comparisons."
            fields={[
              { label: "Origin", placeholder: "e.g. Rotterdam, NL" },
              { label: "Destination", placeholder: "e.g. Shanghai, CN" },
              { label: "Mode", placeholder: "Ocean FCL / LCL / Air / Road" },
              { label: "Weight (kg)", placeholder: "e.g. 15000" },
              { label: "Volume (CBM)", placeholder: "e.g. 33.2" },
            ]}
          />
        </main>
      </div>
    </div>
  );
}
