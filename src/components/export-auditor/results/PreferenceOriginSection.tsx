import type { PreferenceOriginAnalysis } from "@/lib/export-auditor/types";
import { CheckCircle2, Circle, FileText, Globe, Info, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreferenceOriginSectionProps {
  analysis: PreferenceOriginAnalysis;
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-surface-border last:border-0">
      <span className="text-sm text-slate-700">{label}</span>
      {value ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Yes
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
          <Circle className="h-3.5 w-3.5" aria-hidden />
          No
        </span>
      )}
    </div>
  );
}

function evidenceBadge(status: PreferenceOriginAnalysis["evidenceStatus"]) {
  if (status === "DECLARED") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (status === "UNVERIFIED") {
    return "bg-amber-50 text-amber-900 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function preferenceBadge(status: "YES" | "NO" | "UNKNOWN" | "NOT_DECLARED") {
  if (status === "YES") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (status === "NO") {
    return "bg-red-50 text-red-800 border-red-200";
  }
  if (status === "NOT_DECLARED") {
    return "bg-slate-100 text-slate-700 border-slate-300";
  }
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function sourceLabel(source: string): string {
  return source
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PreferenceOriginSection({ analysis }: PreferenceOriginSectionProps) {
  const statusTone =
    analysis.evidenceStatus === "UNVERIFIED"
      ? "border-amber-200 bg-amber-50/40"
      : "border-surface-border bg-white";

  const showPemFields = analysis.preferenceScheme === "PEM";
  const showStatementFields =
    analysis.preferenceScheme === "UK" || analysis.preferenceScheme === "REX";

  return (
    <section className={cn("rounded-xl border p-4", statusTone)}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Preference Origin Analysis
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Country of origin and preferential origin are evaluated separately. EU/non-EU
        country of origin does not automatically imply preferential origin.
      </p>

      <div className="mt-4 rounded-lg border border-surface-border bg-slate-50/80 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Preference scheme (by destination)
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{analysis.schemeLabel}</p>
        {analysis.applicableProofDocuments.length > 0 && (
          <p className="mt-1 text-xs text-slate-600">
            Applicable proof: {analysis.applicableProofDocuments.join(" · ")}
          </p>
        )}
      </div>

      {analysis.preferenceWorkflowActive && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 py-2 border-b border-surface-border">
            <span className="text-sm text-slate-700">Preferential origin evidence</span>
            <span
              className={cn(
                "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                evidenceBadge(analysis.evidenceStatus)
              )}
            >
              {analysis.evidenceStatus.replace(/_/g, " ")}
            </span>
          </div>
          <BoolRow label="Destination outside EU" value={analysis.destinationOutsideEu} />
          {showPemFields && (
            <>
              <BoolRow
                label="Authorised Exporter detected"
                value={analysis.authorisedExporterDetected}
              />
              <BoolRow label="Origin Declaration detected" value={analysis.originDeclarationFound} />
              <BoolRow label="Mixed origin" value={analysis.mixedOrigin} />
            </>
          )}
          {showStatementFields && (
            <>
              <BoolRow
                label="Statement on Origin detected"
                value={analysis.statementOnOriginDetected}
              />
              {analysis.preferenceScheme === "REX" && (
                <BoolRow label="REX registration detected" value={analysis.rexRegistrationDetected} />
              )}
            </>
          )}
        </div>
      )}

      {analysis.invoiceDeclarationSufficient &&
        analysis.preferenceScheme === "PEM" &&
        analysis.preferentialOriginStatus === "CONFIRMED" &&
        !analysis.mixedOrigin && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            Invoice Declaration Sufficient
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800">
            {analysis.recommendation}
          </p>
        </div>
      )}

      {analysis.mixedOrigin &&
        (analysis.mixedOriginTotals ?? analysis.preferentialAllocation) && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            Mixed Origin Totals
          </p>
          {(() => {
            const totals = analysis.mixedOriginTotals ?? analysis.preferentialAllocation;
            if (!totals) return null;
            return (
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-amber-900">
            <div>
              <dt className="font-medium">Preferential quantity</dt>
              <dd className="tabular-nums font-semibold">
                {totals.preferentialQuantity}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Preferential value</dt>
              <dd className="tabular-nums font-semibold">
                {totals.preferentialValue.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Preferential weight</dt>
              <dd className="tabular-nums font-semibold">
                {totals.preferentialWeight != null
                  ? `${totals.preferentialWeight.toLocaleString("de-DE", { maximumFractionDigits: 3 })} kg`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Non-preferential quantity</dt>
              <dd className="tabular-nums font-semibold">
                {totals.nonPreferentialQuantity}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Non-preferential value</dt>
              <dd className="tabular-nums font-semibold">
                {totals.nonPreferentialValue.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Non-preferential weight</dt>
              <dd className="tabular-nums font-semibold">
                {totals.nonPreferentialWeight != null
                  ? `${totals.nonPreferentialWeight.toLocaleString("de-DE", { maximumFractionDigits: 3 })} kg`
                  : "—"}
              </dd>
            </div>
          </dl>
            );
          })()}
        </div>
      )}

      {analysis.preferentialOriginSummary && (
        <p className="mt-4 rounded-lg border border-surface-border bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-600">
          {analysis.preferentialOriginSummary}
        </p>
      )}

      {analysis.declarationsDetected.length > 0 && (
        <div className="mt-4 border-t border-surface-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Detected Declarations
          </p>
          <ul className="mt-2 space-y-1.5">
            {analysis.declarationsDetected.map((decl, i) => (
              <li key={`${decl.kind}-${i}`} className="text-xs text-slate-600">
                <span className="font-medium text-slate-700">{decl.kind.replace(/_/g, " ")}:</span>{" "}
                &ldquo;{decl.text}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.lineItems.length > 0 && (
        <div className="mt-4 border-t border-surface-border pt-4 overflow-x-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Line-Level Preferential Origin
          </p>
          <table className="mt-2 w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-surface-border text-slate-400">
                <th className="py-2 pr-3 font-semibold">Pos.</th>
                <th className="py-2 pr-3 font-semibold">Country of Origin</th>
                <th className="py-2 pr-3 font-semibold">Preferential</th>
                <th className="py-2 pr-3 font-semibold">Source</th>
                <th className="py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {analysis.lineItems.map((line) => (
                <tr key={line.position_number} className="border-b border-surface-border/60 align-top">
                  <td className="py-2 pr-3 font-semibold tabular-nums text-slate-900">
                    {line.position_number}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{line.country_of_origin}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        preferenceBadge(line.preferential_origin)
                      )}
                    >
                      {line.preferential_origin}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                    {sourceLabel(line.preference_source)}
                  </td>
                  <td className="py-2 text-slate-600 leading-relaxed">{line.preference_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Status
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Globe className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            {analysis.status}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Recommendation
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed text-slate-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden />
            {analysis.recommendation}
          </p>
        </div>
      </div>

      {analysis.requiredDocuments.length > 0 && (
        <div className="mt-4 border-t border-surface-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Required Documents
          </p>
          <ul className="mt-2 space-y-1.5">
            {analysis.requiredDocuments.map((doc) => (
              <li key={doc} className="flex items-start gap-2 text-sm text-slate-600">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden />
                {doc}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
