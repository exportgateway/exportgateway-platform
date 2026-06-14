import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import type { PlatformTool } from "@/lib/platform-tools";
import { cn } from "@/lib/utils";

interface PlatformToolCardProps {
  tool: PlatformTool;
  variant?: "default" | "compact";
}

export function PlatformToolCard({ tool, variant = "default" }: PlatformToolCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col rounded-2xl border border-surface-border bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-brand-500/5 hover:-translate-y-0.5",
        variant === "compact" && "p-5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
            tool.gradient
          )}
        >
          <Icon name={tool.icon} className="h-5 w-5" />
        </div>
        <ModuleStatusBadge status={tool.status} showDot={tool.status === "live"} />
      </div>

      <h3 className="mt-4 text-lg font-bold text-slate-900">{tool.shortName}</h3>
      <p className="mt-1 text-sm font-medium text-brand-600">{tool.name}</p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{tool.description}</p>

      {variant === "default" && tool.status !== "coming-soon" && (
        <ul className="mt-4 space-y-1.5">
          {tool.features.slice(0, 3).map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs text-slate-500">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
              {feature}
            </li>
          ))}
        </ul>
      )}

      {tool.status === "coming-soon" ? (
        <Link
          href={tool.href}
          className="btn-secondary mt-6 w-full justify-center group-hover:shadow-md"
        >
          Coming Soon — Learn more
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <Link
          href={tool.href}
          className="btn-primary mt-6 w-full justify-center group-hover:shadow-md"
        >
          Launch Tool
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
