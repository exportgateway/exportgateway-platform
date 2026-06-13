import { cn } from "@/lib/utils";
import type { ModuleStatus } from "@/lib/platform-modules";

const statusConfig: Record<
  ModuleStatus,
  { label: string; className: string; dotClass?: string }
> = {
  live: {
    label: "Live",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  beta: {
    label: "Beta",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  "in-development": {
    label: "In Development",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "coming-soon": {
    label: "Coming Soon",
    className: "bg-slate-100 text-slate-500 border-slate-200",
  },
};

interface ModuleStatusBadgeProps {
  status: ModuleStatus;
  showDot?: boolean;
  className?: string;
}

export function ModuleStatusBadge({ status, showDot = false, className }: ModuleStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        config.className,
        className
      )}
    >
      {showDot && config.dotClass && (
        <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
      )}
      {config.label}
    </span>
  );
}

export function getStatusLabel(status: ModuleStatus): string {
  return statusConfig[status].label;
}
