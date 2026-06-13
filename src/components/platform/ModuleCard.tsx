import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import type { PlatformModule } from "@/lib/platform-modules";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  module: PlatformModule;
  className?: string;
}

export function ModuleCard({ module, className }: ModuleCardProps) {
  const isComingSoon = module.status === "coming-soon";
  const Wrapper = module.href && !isComingSoon ? "a" : "div";
  const wrapperProps =
    module.href && !isComingSoon
      ? { href: module.href, target: "_blank" as const, rel: "noopener noreferrer" }
      : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "rounded-xl border border-surface-border bg-white p-5 transition-all duration-200 h-full flex flex-col",
        !isComingSoon && "card-hover",
        isComingSoon && "opacity-85",
        module.href && !isComingSoon && "hover:border-brand-300 cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <ModuleStatusBadge status={module.status} showDot={module.status === "live"} />
      </div>
      <h4 className="text-sm font-semibold text-slate-900">{module.name}</h4>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500 flex-1">{module.description}</p>
      {module.limitation && (
        <p className="mt-3 text-[11px] leading-relaxed text-amber-700/80 bg-amber-50/50 rounded-lg px-2.5 py-2 border border-amber-100">
          {module.limitation}
        </p>
      )}
    </Wrapper>
  );
}
