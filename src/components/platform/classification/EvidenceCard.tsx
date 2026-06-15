import { Database } from "lucide-react";
import type { HistoricalEvidenceSummary } from "@/lib/wizard-types";
import { capitalizeEvidenceStrength, formatCnCodeSpaced } from "@/lib/classification-utils";

interface EvidenceCardProps {
  evidence: HistoricalEvidenceSummary;
}

/** AES historical evidence — key differentiator, highly visible. */
export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const isEmpty = !evidence || evidence.level === "none";
  const count = evidence?.declaration_count ?? 0;
  const strength = capitalizeEvidenceStrength(
    evidence?.evidence_strength || evidence?.level || "None"
  );
  const isStrong = strength.toLowerCase() === "strong" || evidence?.level === "strong";

  return (
    <article
      className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
      data-testid="evidence-card"
    >
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-brand-600" aria-hidden />
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Historical Evidence
        </h2>
      </div>

      {isEmpty ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-2xl font-bold text-slate-400">0</p>
          <p className="font-medium text-slate-700">similar AES declarations found</p>
          <p className="text-slate-500">No similar AES declarations matched this description.</p>
          <p className="pt-2 text-sm">
            <span className="font-semibold text-slate-700">Evidence strength:</span>{" "}
            <span className="text-slate-600">None</span>
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p>
            <span className={isStrong ? "text-4xl font-bold text-brand-700" : "text-3xl font-bold text-slate-900"}>
              {count}
            </span>
            <span className="ml-2 text-sm font-medium text-slate-600">
              similar AES declaration{count === 1 ? "" : "s"} found
            </span>
          </p>
          {evidence.most_common_tariff ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Most common tariff
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                {formatCnCodeSpaced(evidence.most_common_tariff)}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Evidence strength
            </p>
            <p
              className={
                isStrong
                  ? "mt-1 text-base font-bold text-emerald-700"
                  : "mt-1 text-base font-semibold text-slate-800"
              }
            >
              {strength}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
