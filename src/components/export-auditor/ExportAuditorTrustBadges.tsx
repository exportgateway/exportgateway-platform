const badges = [
  { emoji: "🔒", label: "Temporary Processing", short: "Temporary Processing" },
  { emoji: "🇪🇺", label: "EU Infrastructure", short: "EU Infrastructure" },
  { emoji: "🚫", label: "No Permanent Document Storage", short: "No Permanent Storage" },
  { emoji: "🤖", label: "No Model Training On Customer Documents", short: "No Model Training" },
] as const;

export function ExportAuditorTrustBadges() {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      aria-label="Document processing trust indicators"
    >
      {badges.map(({ emoji, label, short }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-medium text-slate-600 sm:text-xs"
          title={label}
        >
          <span className="leading-none" aria-hidden>
            {emoji}
          </span>
          <span className="whitespace-nowrap">{short}</span>
        </span>
      ))}
    </div>
  );
}
