interface ClassificationInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function ClassificationInput({
  value,
  onChange,
  onSubmit,
  loading,
  disabled = false,
}: ClassificationInputProps) {
  return (
    <section
      className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm sm:p-6"
      data-testid="classification-input"
    >
      <label htmlFor="productDescription" className="block text-sm font-semibold text-slate-800">
        Describe your product
      </label>
      <input
        id="productDescription"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Men's cotton jeans, Hydraulic oil ISO VG46, Steel office cabinet, MAKITA BO5041SET"
        autoComplete="off"
        disabled={disabled || loading}
        className="mt-2 w-full rounded-xl border border-surface-border px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
      />
      <p className="mt-2 text-xs text-slate-500" aria-hidden="true">
        Examples: Men&apos;s cotton jeans · Hydraulic oil ISO VG46 · Steel office cabinet · MAKITA
        BO5041SET
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || loading || value.trim().length < 2}
          className="inline-flex min-w-[160px] items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Classifying…" : "Classify Product"}
        </button>
      </div>
    </section>
  );
}
