import { Icon } from "@/components/ui/Icon";
import { ModuleCard } from "@/components/platform/ModuleCard";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import type { PillarId } from "@/lib/platform-modules";
import { modulesByPillar, pillarMeta } from "@/lib/platform-modules";
import { cn } from "@/lib/utils";

interface PillarSectionProps {
  pillar: PillarId;
  id?: string;
  reversed?: boolean;
  featured?: React.ReactNode;
}

export function PillarSection({ pillar, id, reversed = false, featured }: PillarSectionProps) {
  const meta = pillarMeta[pillar];
  const modules = modulesByPillar(pillar);
  const liveCount = modules.filter((m) => m.status === "live").length;
  const betaCount = modules.filter((m) => m.status === "beta").length;

  return (
    <section id={id} className={cn("section-padding", reversed ? "bg-surface-muted/50" : "bg-white")}>
      <div className="container-narrow">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start mb-10">
          <div>
            <div className={cn("mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white", meta.gradient)}>
              <Icon name={meta.icon} className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-brand-600 mb-2">{meta.tagline}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">{meta.title}</h2>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">{meta.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {liveCount > 0 && (
                <span className="text-xs text-slate-500">
                  <ModuleStatusBadge status="live" showDot /> × {liveCount}
                </span>
              )}
              {betaCount > 0 && (
                <span className="text-xs text-slate-500 ml-2">
                  <ModuleStatusBadge status="beta" /> × {betaCount}
                </span>
              )}
            </div>
          </div>
          {featured && <div>{featured}</div>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod) => (
            <ModuleCard key={mod.id} module={mod} />
          ))}
        </div>
      </div>
    </section>
  );
}
