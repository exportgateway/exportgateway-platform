import type { ClassifyV2Response } from "@/lib/wizard-types";
import { formatCnCodeSpaced } from "@/lib/classification-utils";

interface ClassificationHeroProps {
  result: ClassifyV2Response;
}

/** Primary result: recommended HS/CN code — highest visual priority. */
export function ClassificationHero({ result }: ClassificationHeroProps) {
  const code = formatCnCodeSpaced(result.recommended_cn_code);

  return (
    <article
      className="rounded-2xl border-2 border-brand-600 bg-gradient-to-br from-brand-50/80 to-white p-5 sm:p-6"
      data-testid="classification-hero"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700/80">
        Recommended Classification
      </p>
      <p className="mt-2 font-mono text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        {code}
      </p>
    </article>
  );
}
