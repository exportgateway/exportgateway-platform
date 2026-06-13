import type { DeliveryAddress } from "@/lib/export-auditor/types";

interface DeliveryAddressSectionProps {
  address: DeliveryAddress;
}

function displayValue(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  return value.trim();
}

export function DeliveryAddressSection({ address }: DeliveryAddressSectionProps) {
  const countryDisplay =
    address.country && address.countryCode
      ? `${address.country} (${address.countryCode})`
      : address.country || address.countryCode || "—";

  const rows: { label: string; value: string }[] = [
    { label: "Company", value: displayValue(address.company) },
    { label: "Address", value: displayValue(address.address) },
    { label: "City", value: displayValue(address.city) },
    { label: "Postal Code", value: displayValue(address.postalCode) },
    { label: "Country", value: countryDisplay },
  ];

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Delivery Address
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
