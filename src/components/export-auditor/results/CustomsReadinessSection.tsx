import type { CustomsReadinessResult } from "@/lib/export-auditor/types";
import { formatCustomsReadinessStatus } from "@/lib/export-auditor/customs-readiness-engine";
import { cn } from "@/lib/utils";

export function CustomsReadinessSection({
  readiness,
}: {
  readiness?: CustomsReadinessResult;
}) {
  if (!readiness) return null;

  const tone =
    readiness.status === "CUSTOMS_READY"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : readiness.status === "CUSTOMS_REVIEW"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-800";

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Customs Readiness
      </h3>
      <div className={cn("mt-4 rounded-lg border px-4 py-3", tone)}>
        <p className="text-sm font-bold">{formatCustomsReadinessStatus(readiness.status)}</p>
        {readiness.reasons.length > 0 && (
          <ul className="mt-2 space-y-1">
            {readiness.reasons.slice(0, 4).map((reason) => (
              <li key={reason} className="text-xs leading-relaxed opacity-90">
                {reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
