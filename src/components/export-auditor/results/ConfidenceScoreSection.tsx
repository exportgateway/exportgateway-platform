import type { ConfidenceScores } from "@/lib/export-auditor/types";
import { cn } from "@/lib/utils";

interface ConfidenceScoreSectionProps {
  scores: ConfidenceScores;
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

export function ConfidenceScoreSection({ scores }: ConfidenceScoreSectionProps) {
  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Confidence Score
      </h3>
      <div className="mt-4 space-y-4">
        <ScoreBar label="OCR Quality" value={scores.ocrQuality} />
        <ScoreBar label="Data Completeness" value={scores.dataCompleteness} />
        <ScoreBar label="Overall Confidence" value={scores.overallConfidence} />
      </div>
    </section>
  );
}
