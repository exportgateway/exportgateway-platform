import type { CustomsReadinessResult } from "@/lib/export-auditor/types";
import { formatCustomsReadinessStatus } from "@/lib/export-auditor/customs-readiness-engine";
import { cn } from "@/lib/utils";

export function CustomsReadinessSection({
  readiness,
  score,
}: {
  readiness?: import("@/lib/export-auditor/types").CustomsReadinessResult;
  score?: import("@/lib/export-auditor/types").CustomsReadinessScore;
}) {
  if (!readiness && !score) return null;

  const status = score?.status ?? readiness?.status ?? "CUSTOMS_REVIEW";
  const numericScore = score?.score;

  const tone =
    status === "CUSTOMS_READY"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "CUSTOMS_REVIEW"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-800";

  return (
    <section className="rounded-xl border border-surface-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Customs Readiness
        </h3>
        {numericScore != null && (
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">
            {numericScore}
            <span className="text-sm font-semibold text-slate-400"> / 100</span>
          </p>
        )}
      </div>
      <div className={cn("mt-4 rounded-lg border px-4 py-3", tone)}>
        <p className="text-sm font-bold">
          {formatCustomsReadinessStatus(status)}
          {score?.label ? ` — ${score.label}` : ""}
        </p>
        {(score?.message || readiness?.reasons.length) ? (
          <ul className="mt-2 space-y-1">
            {(score?.message
              ? [score.message]
              : readiness?.reasons ?? []
            )
              .slice(0, 4)
              .map((reason) => (
                <li key={reason} className="text-xs leading-relaxed opacity-90">
                  {reason}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
