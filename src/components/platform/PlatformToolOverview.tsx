import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { Icon } from "@/components/ui/Icon";
import type { PlatformTool } from "@/lib/platform-tools";

interface PlatformToolOverviewProps {
  tool: PlatformTool;
}

export function PlatformToolOverview({ tool }: PlatformToolOverviewProps) {
  const hasLimitations = tool.limitations && tool.limitations.length > 0;

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} text-white shadow-md`}
        >
          <Icon name={tool.icon} className="h-6 w-6" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{tool.name}</h2>
            <ModuleStatusBadge status={tool.status} showDot={tool.status === "live"} />
          </div>
          <p className="mt-1 text-sm font-medium text-brand-600">{tool.tagline}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">{tool.description}</p>

      <div
        className={
          hasLimitations
            ? "mt-6 grid gap-6 md:grid-cols-2 md:gap-8"
            : "mt-6"
        }
      >
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Features
          </h3>
          <ul className="mt-3 space-y-2">
            {tool.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {hasLimitations && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Important notes
            </h3>
            <ul className="mt-2 space-y-1.5">
              {tool.limitations!.map((note) => (
                <li key={note} className="text-xs leading-relaxed text-amber-900/80">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
