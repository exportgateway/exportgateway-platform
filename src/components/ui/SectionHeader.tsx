import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  badge?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  dark?: boolean;
}

export function SectionHeader({
  badge,
  title,
  description,
  align = "center",
  className,
  dark = false,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-12 sm:mb-16",
        align === "center" && "text-center mx-auto max-w-3xl",
        className
      )}
    >
      {badge && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold mb-4",
            dark
              ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
              : "bg-brand-50 text-brand-700 border border-brand-100"
          )}
        >
          {badge}
        </span>
      )}
      <h2
        className={cn(
          "text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-balance leading-tight",
          dark ? "text-white" : "text-slate-900"
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-4 text-lg leading-relaxed text-balance",
            dark ? "text-slate-400" : "text-slate-600"
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
