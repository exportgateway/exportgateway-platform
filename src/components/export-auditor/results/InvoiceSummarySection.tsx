import type { InvoiceSummary } from "@/lib/export-auditor/types";
import { formatInvoiceValueDisplay } from "@/lib/export-auditor/parse-locale-number";
import { formatOriginCountriesList } from "@/lib/export-auditor/origin-countries-summary";

interface InvoiceSummarySectionProps {
  summary: InvoiceSummary;
}

export function InvoiceSummarySection({ summary }: InvoiceSummarySectionProps) {
  const rows: { label: string; value: string }[] = [
    { label: "Invoice Number", value: summary.invoiceNumber },
    { label: "Invoice Date", value: summary.invoiceDate },
    { label: "Exporter", value: summary.exporter },
    { label: "Consignee", value: summary.consignee },
    { label: "Destination Country", value: summary.destinationCountry },
    { label: "Incoterms", value: summary.incoterms },
    { label: "Currency", value: summary.currency },
    {
      label: "Invoice Value",
      value: formatInvoiceValueDisplay(summary.invoiceValue, summary.currency),
    },
    {
      label: "Total Line Items",
      value: String(summary.lineItemCount),
    },
    {
      label: "Unique HS Codes",
      value: String(summary.uniqueHsCodeCount),
    },
    {
      label: "Countries of Origin",
      value: formatOriginCountriesList(summary.countriesOfOrigin),
    },
  ];

  return (
    <section className="rounded-xl border border-surface-border bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Invoice Summary
      </h3>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {row.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
