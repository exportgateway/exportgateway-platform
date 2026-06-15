import type { ClassifyV2Response } from "@/lib/wizard-types";
import { formatConfidenceSource, isLowConfidenceResult } from "@/lib/classification-utils";
import { cn } from "@/lib/utils";

interface ConfidenceCardProps {
  result: ClassifyV2Response;
}

function confidenceStyles(band: string): { badge: string; ring: string } {
  if (band === "HIGH") {
    return { badge: "bg-emerald-100 text-emerald-800", ring: "ring-emerald-200" };
  }
  if (band === "MEDIUM") {
    return { badge: "bg-amber-100 text-amber-900", ring: "ring-amber-200" };
  }
  return { badge: "bg-rose-100 text-rose-800", ring: "ring-rose-200" };
}

export function ConfidenceCard({ result }: ConfidenceCardProps) {
  const source = formatConfidenceSource(result.confidence_source || result.research_source || "—");
  const styles = confidenceStyles(result.confidence);
  const isLow = isLowConfidenceResult(result.confidence, result.manual_classification_recommended);

  return (
    <article
      className={cn(
        "rounded-2xl border border-surface-border bg-white p-5 shadow-sm ring-1 ring-inset",
        styles.ring
      )}
      data-testid="confidence-card"
    >
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Confidence</h2>
      <p
        className={cn(
          "mt-3 inline-flex rounded-lg px-3 py-1.5 text-base font-bold tracking-wide",
          styles.badge
        )}
      >
        {result.confidence}
      </p>
      {isLow ? (
        <p className="mt-2 text-sm font-medium text-rose-800">
          Additional product information required for a reliable classification.
        </p>
      ) : null}
      <div className="mt-4 border-t border-surface-border pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Confidence source</p>
        <p className="mt-1.5 text-sm font-semibold text-slate-900">{source}</p>
        {result.from_cache && result.research_source === "Knowledge Base" ? (
          <p className="mt-1 text-xs text-emerald-700">Matched cached knowledge base entry</p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Indicates which evidence path drove this suggestion.
          </p>
        )}
      </div>
    </article>
  );
}
