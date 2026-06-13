interface ModulePlaceholderProps {
  title: string;
  description: string;
  fields: { label: string; placeholder: string }[];
}

export function ModulePlaceholder({
  title,
  description,
  fields,
}: ModulePlaceholderProps) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm text-slate-400 mb-6">{description}</p>

      <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card p-6 space-y-5">
        {fields.map((field) => (
          <div key={field.label}>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              {field.label}
            </label>
            <input
              type="text"
              placeholder={field.placeholder}
              className="w-full rounded-lg border border-surface-dark-border bg-surface-dark-muted px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 transition-colors"
            />
          </div>
        ))}

        <div className="pt-2 flex gap-3">
          <button className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            Calculate
          </button>
          <button className="rounded-lg border border-surface-dark-border px-5 py-2.5 text-sm font-medium text-slate-400 hover:bg-surface-dark-muted hover:text-slate-200 transition-colors">
            Reset
          </button>
        </div>
      </div>

      {/* Results placeholder */}
      <div className="mt-6 rounded-xl border border-dashed border-surface-dark-border bg-surface-dark-card/50 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-dark-muted">
          <svg
            className="h-6 w-6 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">
          {title} results will appear here
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Fill in the form above and click Calculate to get started
        </p>
      </div>
    </div>
  );
}
