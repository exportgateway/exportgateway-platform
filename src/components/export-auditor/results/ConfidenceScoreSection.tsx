import type { ConfidenceScores, CustomsReadinessResult } from "@/lib/export-auditor/types";
import { formatCustomsReadinessStatus } from "@/lib/export-auditor/customs-readiness-engine";
import { cn } from "@/lib/utils";

interface ConfidenceScoreSectionProps {
  scores: ConfidenceScores;
  /** Data extraction completeness 0–100 from OCR observability (field coverage). */
  dataExtractionCompleteness?: number;
  customsReadiness?: CustomsReadinessResult;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 85 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-bold tabular-nums text-slate-900">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function CustomsReadinessBadge({ readiness }: { readiness: CustomsReadinessResult }) {
  const tone =
    readiness.status === "CUSTOMS_READY"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : readiness.status === "CUSTOMS_REVIEW"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={cn("rounded-lg border px-3 py-2", tone)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
        Customs Readiness
      </p>
      <p className="mt-1 text-sm font-bold">{formatCustomsReadinessStatus(readiness.status)}</p>
      {readiness.reasons.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed opacity-90">{readiness.reasons[0]}</p>
      )}
    </div>
  );
}

export function ConfidenceScoreSection({
  scores,
  dataExtractionCompleteness,
  customsReadiness,
}: ConfidenceScoreSectionProps) {
  const completeness = dataExtractionCompleteness ?? scores.dataCompleteness;

  return (
    <section className="rounded-xl border border-surface-border bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Confidence & Readiness Metrics
      </h3>
      <div className="mt-4 space-y-4">
        <ScoreBar label="OCR Confidence" value={scores.ocrQuality} />
        <ScoreBar label="Data Extraction Completeness" value={completeness} />
        {customsReadiness ? (
          <CustomsReadinessBadge readiness={customsReadiness} />
        ) : (
          <ScoreBar label="Overall Confidence" value={scores.overallConfidence} />
        )}
      </div>
    </section>
  );
}
