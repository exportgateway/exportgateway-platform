"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "@/components/ui/AnimatedSection";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { platformTools } from "@/lib/platform-tools";

export function PlatformLaunchCards() {
  return (
    <section className="section-padding bg-white border-y border-surface-border">
      <div className="container-narrow">
        <FadeIn>
          <SectionHeader
            badge="Live Tools"
            title="Launch trade intelligence tools"
            description="Four working products on one platform — audit invoices, classify exports, price EU road freight, and allocate Intrastat costs."
          />
        </FadeIn>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {platformTools.map((tool, i) => (
            <FadeIn key={tool.id} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-6 shadow-sm card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} text-white shadow-md`}
                  >
                    <Icon name={tool.icon} className="h-5 w-5" />
                  </div>
                  <ModuleStatusBadge status={tool.status} showDot={tool.status === "live"} />
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
        </div>

        <FadeIn delay={0.3}>
          <div className="mt-10 text-center">
            <Link
              href="/platform"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              View all platform tools
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
