import type { ClassifyV2Response } from "@/lib/wizard-types";
import { formatCnCodeSpaced } from "@/lib/classification-utils";

interface WhyClassificationCardProps {
  result: ClassifyV2Response;
}

/** Concise rationale — max ~5 lines, structured when reasoning data exists. */
export function WhyClassificationCard({ result }: WhyClassificationCardProps) {
  const detected = result.reasoning?.detected?.filter(Boolean) ?? [];
  const headingHint = result.reasoning?.matches?.[0];
  const code = formatCnCodeSpaced(result.recommended_cn_code);
  const hasStructured = detected.length > 0 || headingHint;

  return (
    <article
      className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
      data-testid="why-classification-card"
    >
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Why This Classification
      </h2>

      {hasStructured ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-800">
          {detected.length > 0 ? (
            <div>
              <p className="font-medium text-slate-900">The description contains:</p>
              <ul className="mt-1.5 space-y-0.5 pl-1">
                {detected.slice(0, 4).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-slate-400" aria-hidden="true">
                      •
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {headingHint ? (
            <p>
              These attributes match CN heading context:{" "}
              <span className="font-medium text-slate-900">{headingHint.slice(0, 80)}</span>
            </p>
          ) : null}
          {code !== "—" ? (
            <p>
              <span className="font-medium text-slate-900">Recommended classification:</span>{" "}
              <span className="font-mono font-bold">{code}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-slate-800">
          {result.why_explanation || "—"}
        </p>
      )}
    </article>
  );
}
