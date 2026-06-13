"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Layers,
  Sparkles,
} from "lucide-react";
import { platformTools } from "@/lib/platform-tools";
import { platformModules } from "@/lib/platform-modules";
import { getPlatformStats } from "@/lib/platform-history";
import { RecentActivityPanel } from "@/components/platform/RecentActivityPanel";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { Icon } from "@/components/ui/Icon";

export function PlatformTradeDashboard() {
  const [stats, setStats] = useState({
    total: 0,
    freightCount: 0,
    intrastatCount: 0,
    thisWeek: 0,
  });

  useEffect(() => {
    function refresh() {
      setStats(getPlatformStats());
    }
    refresh();
    window.addEventListener("platform-history-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("platform-history-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const liveTools = platformTools.filter((t) => t.status === "live").length;
  const liveModules = platformModules.filter((m) => m.status === "live").length;
  const totalModules = platformModules.length;
  const roadmapPercent = Math.round((liveModules / totalModules) * 100);

  const statCards = [
    {
      label: "Tools available",
      value: String(liveTools),
      sub: "Live on platform",
      icon: Layers,
      color: "text-brand-600 bg-brand-50",
    },
    {
      label: "Calculations",
      value: String(stats.total),
      sub: stats.thisWeek > 0 ? `${stats.thisWeek} this week` : "Run your first",
      icon: Activity,
      color: "text-violet-600 bg-violet-50",
    },
    {
      label: "Freight quotes",
      value: String(stats.freightCount),
      sub: "Saved locally",
      icon: BarChart3,
      color: "text-cyan-600 bg-cyan-50",
    },
    {
      label: "Roadmap progress",
      value: `${roadmapPercent}%`,
      sub: `${liveModules} of ${totalModules} modules live`,
      icon: Sparkles,
      color: "text-emerald-600 bg-emerald-50",
    },
  ];

  return (
    <div className="space-y-8" data-screenshot="platform-dashboard">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{card.value}</p>
                <p className="mt-0.5 text-xs text-slate-400">{card.sub}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border border-surface-border bg-white shadow-sm">
            <div className="border-b border-surface-border px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Launch a tool</h2>
              <p className="mt-0.5 text-xs text-slate-500">Working EU trade intelligence — no login required</p>
            </div>
            <div className="divide-y divide-surface-border">
              {platformTools.map((tool) => (
                <Link
                  key={tool.id}
                  href={tool.href}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-muted/30"
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} text-white shadow-sm`}
                  >
                    <Icon name={tool.icon} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{tool.shortName}</p>
                      <ModuleStatusBadge status={tool.status} showDot={tool.status === "live"} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">{tool.tagline}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">Roadmap progress</h2>
              <span className="text-xs font-semibold text-emerald-600">{roadmapPercent}% live</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-emerald-500 transition-all duration-700"
                style={{ width: `${roadmapPercent}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(["live", "beta", "in-development", "coming-soon"] as const).map((status) => {
                const count = platformModules.filter((m) => m.status === status).length;
                if (count === 0) return null;
                return (
                  <div key={status} className="flex items-center justify-between rounded-lg bg-surface-muted/40 px-3 py-2">
                    <ModuleStatusBadge status={status} />
                    <span className="text-xs font-semibold tabular-nums text-slate-600">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <RecentActivityPanel limit={6} />

          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-white p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Platform intelligence</p>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Calculations run against the live ExportGateway API. History is stored in your browser — 
                  pick up where you left off without creating an account.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
