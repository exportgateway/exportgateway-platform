"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "@/components/ui/AnimatedSection";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { platformTools } from "@/lib/platform-tools";
import { cn } from "@/lib/utils";

export function PlatformLaunchCards() {
  const liveTools = platformTools.filter((t) => t.status === "live");
  const comingSoonTools = platformTools.filter((t) => t.status === "coming-soon");

  return (
    <section className="section-padding bg-white border-y border-surface-border">
      <div className="container-narrow">
        <FadeIn>
          <SectionHeader
            badge="Platform Tools"
            title="Live trade compliance tools"
            description="Audit invoices, classify exports, and price EU road freight — plus Intrastat AI Auditor coming soon."
          />
        </FadeIn>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {liveTools.map((tool, i) => (
            <FadeIn key={tool.id} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-6 shadow-sm card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} text-white shadow-md`}
                  >
                    <Icon name={tool.icon} className="h-5 w-5" />
                  </div>
                  <ModuleStatusBadge status={tool.status} showDot />
                </div>

                <h3 className="mt-4 text-lg font-bold text-slate-900">{tool.shortName}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  {tool.tagline}
                </p>

                <Link href={tool.href} className="btn-primary mt-6 w-full justify-center">
                  Launch
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </FadeIn>
          ))}

          {comingSoonTools.map((tool, i) => (
            <FadeIn key={tool.id} delay={(liveTools.length + i) * 0.1}>
              <div
                className={cn(
                  "flex h-full flex-col rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} text-white shadow-md opacity-80`}
                  >
                    <Icon name={tool.icon} className="h-5 w-5" />
                  </div>
                  <ModuleStatusBadge status="coming-soon" />
                </div>

                <h3 className="mt-4 text-lg font-bold text-slate-900">{tool.shortName}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  {tool.tagline}
                </p>

                <Link href={tool.href} className="btn-secondary mt-6 w-full justify-center">
                  Learn more
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.3}>
          <div className="mt-10 text-center">
            <Link
              href="/platform"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              View Platform Hub
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
