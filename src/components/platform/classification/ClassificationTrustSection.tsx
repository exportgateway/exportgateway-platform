interface ClassificationTrustSectionProps {
  aesRecordCount?: number | null;
}

/** Landing trust block — AES evidence positioning. */
export function ClassificationTrustSection({ aesRecordCount = null }: ClassificationTrustSectionProps) {
  const statLabel =
    aesRecordCount != null && aesRecordCount >= 1000
      ? `${Math.floor(aesRecordCount / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "+"
      : "70,000+";

  return (
    <section
      className="rounded-2xl border border-surface-border bg-gradient-to-br from-slate-50 to-white p-5 sm:p-6"
      aria-label="Why ExportGateway classification"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-bold tracking-tight text-brand-700">{statLabel}</span>
        <span className="text-sm font-medium text-slate-600">historical AES declarations</span>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
        CN / HS classification ranked by real customs declaration history — AES historical evidence
        first, then validated knowledge, AI nomenclature analysis, and product research only when
        required.
      </p>
      <ol className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <li>
          <strong className="text-slate-900">AES history</strong> — search similar declared products
        </li>
        <li>
          <strong className="text-slate-900">Knowledge base</strong> — reuse cached validated research
        </li>
        <li>
          <strong className="text-slate-900">AI analysis</strong> — nomenclature matching when evidence
          is limited
        </li>
        <li>
          <strong className="text-slate-900">Product research</strong> — last resort when AES, KB, and
          AI are insufficient
        </li>
      </ol>
    </section>
  );
}
