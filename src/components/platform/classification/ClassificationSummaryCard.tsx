import type { ClassifyV2Response } from "@/lib/wizard-types";
import { Check } from "lucide-react";

interface ClassificationSummaryCardProps {
  result: ClassifyV2Response;
}

export function ClassificationSummaryCard({ result }: ClassificationSummaryCardProps) {
  const summary = result.classification_summary;
  const attributes = summary?.detected_attributes ?? [];

  if (attributes.length === 0 && !summary?.product_type && !result.product_type) {
    return null;
  }

  return (
    <article
      className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
      data-testid="classification-summary-card"
    >
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Classification Summary
      </h2>
      {(summary?.product_type || result.product_type) && (
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Product type:</span>{" "}
          {summary?.product_type || result.product_type}
        </p>
      )}
      {attributes.length > 0 ? (
        <>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
            Detected product attributes
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {attributes.map((attr) => (
              <li key={attr} className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                {attr}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}
