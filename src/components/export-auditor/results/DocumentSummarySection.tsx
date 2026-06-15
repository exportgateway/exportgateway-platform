import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { InvoiceSummarySection } from "@/components/export-auditor/results/InvoiceSummarySection";
import { ShipmentSummarySection } from "@/components/export-auditor/results/ShipmentSummarySection";
import { DeliveryAddressSection } from "@/components/export-auditor/results/DeliveryAddressSection";

interface DocumentSummarySectionProps {
  report: ExportAuditReport;
  compact?: boolean;
}

/** Broker document summary — invoice, shipment, and delivery at a glance. */
export function DocumentSummarySection({ report, compact = true }: DocumentSummarySectionProps) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-0.5">
        Document Summary
      </h3>
      <InvoiceSummarySection summary={report.invoiceSummary} />
      <ShipmentSummarySection summary={report.shipmentSummary} />
      {!compact && <DeliveryAddressSection address={report.deliveryAddress} />}
    </section>
  );
}
