import type { ClassifyV2Response } from "@/lib/wizard-types";
import { formatCnCode, formatCnCodeSpaced } from "@/lib/classification-utils";

interface CommodityDescriptionCardProps {
  result: ClassifyV2Response;
}

function hierarchyLabel(step: { level: string; code: string; label: string }): string {
  if (step.level === "chapter" && step.code) {
    const chapter = step.code.replace(/^0+/, "") || step.code;
    return `Chapter ${chapter}`;
  }
  return step.label;
}

/** Commodity description + compact nomenclature hierarchy. */
export function CommodityDescriptionCard({ result }: CommodityDescriptionCardProps) {
  const description = result.commodity_description || result.product_type || "—";
  const hierarchy = result.hierarchy_path ?? [];
  const code = formatCnCode(result.recommended_cn_code);
  const codeSpaced = formatCnCodeSpaced(result.recommended_cn_code);

  return (
    <article
      className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm sm:p-6"
      data-testid="commodity-description-card"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Commodity Description</p>
      {code !== "—" ? (
        <p className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
          {codeSpaced}
        </p>
      ) : null}
      <p className="mt-2 text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">{description}</p>
      {hierarchy.length > 0 ? (
        <nav className="mt-5 border-t border-surface-border pt-4" aria-label="CN hierarchy">
          <ol className="space-y-1.5 text-sm text-slate-700">
            {hierarchy.map((step, index) => (
              <li key={`${step.level}-${step.code}-${index}`} className="flex items-start gap-2">
                <span className="w-4 shrink-0 text-slate-300" aria-hidden="true">
                  {index === 0 ? " " : "→"}
                </span>
                <span>{hierarchyLabel(step)}</span>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </article>
  );
}
