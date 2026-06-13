import type { Metadata } from "next";
import {
  DashboardSidebar,
  DashboardHeader,
} from "@/components/layout/DashboardLayout";
import { ModulePlaceholder } from "@/components/dashboard/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Customs Wizard",
};

export default function CustomsWizardPage() {
  return (
    <div className="min-h-screen bg-surface-dark">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader title="Customs Wizard" />
        <main className="p-6 lg:p-8">
          <ModulePlaceholder
            title="Customs Wizard"
            description="Classify your goods with AI-assisted HS/CN code lookup. Get tariff rates, duty calculations, and compliance checks."
            fields={[
              { label: "Product Description", placeholder: "e.g. Laptop computer, 15 inch display" },
              { label: "Country of Origin", placeholder: "e.g. China (CN)" },
              { label: "Destination Country", placeholder: "e.g. Germany (DE)" },
              { label: "Material Composition", placeholder: "e.g. Aluminum, plastic, glass" },
            ]}
          />
        </main>
      </div>
    </div>
  );
}
