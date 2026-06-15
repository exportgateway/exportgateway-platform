interface CustomsDispositionSectionProps {
  disposition: string;
}

export function CustomsDispositionSection({ disposition }: CustomsDispositionSectionProps) {
  return (
    <section className="rounded-xl border border-surface-border bg-slate-900 p-4 text-slate-100">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Customs Disposition
      </h3>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">
        {disposition}
      </pre>
    </section>
  );
}
