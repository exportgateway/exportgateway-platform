import Link from "next/link";
import { Calculator, ClipboardList, Globe, Shield } from "lucide-react";

export function ExportAuditorQuickActions() {
  const actions = [
    {
      label: "Open Customs Intelligence",
      href: "/platform/customs",
      icon: Shield,
    },
    {
      label: "Estimate Freight",
      href: "/platform/freight",
      icon: Calculator,
    },
    {
      label: "Create Export Checklist",
      href: "/platform/customs",
      icon: ClipboardList,
    },
    {
      label: "Review EUR.1 Eligibility",
      href: "/platform/export-auditor",
      icon: Globe,
    },
  ];

  return (
    <section className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-700">
        Next Actions
      </h3>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="btn-secondary justify-start text-left text-sm py-2.5"
          >
            <action.icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
