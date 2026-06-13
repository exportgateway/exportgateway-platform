import { CheckCircle2 } from "lucide-react";

const BENEFITS = [
  "Slovenia company importing from Germany",
  "Allocate transport cost for Intrastat reporting",
  "Split reporting country vs non-reporting country transport cost",
  "Support accounting and customs reporting",
] as const;

export function IntrastatWhySection() {
  return (
    <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white to-slate-50/50 p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">Why use Intrastat Allocation?</h3>
      <ul className="mt-3 space-y-2">
        {BENEFITS.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
