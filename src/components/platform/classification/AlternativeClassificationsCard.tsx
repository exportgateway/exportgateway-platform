import type { AlternativeClassification, ConfidenceBand } from "@/lib/wizard-types";
import { formatCnCodeSpaced } from "@/lib/classification-utils";

interface AlternativeClassificationsCardProps {
  alternatives: AlternativeClassification[];
  confidence: ConfidenceBand | string;
}

export function AlternativeClassificationsCard({
  alternatives,
  confidence,
}: AlternativeClassificationsCardProps) {
  const items = (alternatives ?? []).filter((alt) => !alt.recommended).slice(0, 3);

  if (confidence === "HIGH" && items.length === 0) return null;
  if (items.length === 0) return null;

  return (
    <article
      className="rounded-2xl border border-dashed border-surface-border bg-slate-50/50 p-5"
      data-testid="alternatives-card"
    >
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Alternative Classifications
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((alt) => (
          <li key={alt.cn_code} className="text-sm">
            <span className="font-mono text-base font-bold text-slate-900">
              {formatCnCodeSpaced(alt.cn_code)}
            </span>
            {alt.description ? (
              <p className="mt-0.5 text-slate-600">{alt.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
