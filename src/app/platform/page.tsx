import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { PlatformToolCard } from "@/components/platform/PlatformToolCard";
import { PlatformTradeDashboard } from "@/components/platform/PlatformTradeDashboard";
import { ModuleStatusBadge } from "@/components/platform/ModuleStatusBadge";
import { Icon } from "@/components/ui/Icon";
import { platformTools } from "@/lib/platform-tools";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Platform — Trade Intelligence Tools",
  description:
    "Launch ExportGateway tools: Export Auditor, Compliance Wizard, Freight Calculator, and Intrastat Allocation — live EU trade intelligence.",
  path: "/platform",
});

export default function PlatformHubPage() {
  const liveCount = platformTools.filter((t) => t.status === "live").length;
  const featuredTool = platformTools.find((t) => t.featured) ?? platformTools[0];

  return (
    <div className="pt-8 pb-20 sm:pb-28">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50/80 px-4 py-1.5 text-sm font-medium text-brand-700">
              <Zap className="h-3.5 w-3.5" />
              Trade Intelligence Platform
            </span>
            <ModuleStatusBadge status="live" showDot />
            <span className="text-sm text-slate-500">{liveCount} tools live</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Trade operations dashboard
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Audit export invoices, classify goods, price EU road freight, and allocate Intrastat
            costs — professional tools for forwarders, coordinators, and exporters. No login required.
          </p>
        </div>

        {/* Flagship — Export Auditor */}
        <Link
          href={featuredTool.href}
          className="mt-10 group block overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-6 sm:p-8 shadow-sm transition-all hover:shadow-lg hover:shadow-violet-500/10"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${featuredTool.gradient} text-white shadow-md`}
              >
                <Icon name={featuredTool.icon} className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-violet-600">
                  Flagship tool
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900 group-hover:text-violet-700 transition-colors">
                  {featuredTool.name}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                  {featuredTool.tagline}
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {featuredTool.features.slice(0, 4).map((f) => (
                    <li
                      key={f}
                      className="rounded-full border border-violet-100 bg-white/80 px-3 py-1 text-xs text-slate-600"
                    >
                      {f.split(" — ")[0].split(" (")[0]}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <span className="btn-primary shrink-0 self-start sm:self-center">
              Launch Export Auditor
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>

        <div className="mt-10">
          <PlatformTradeDashboard />
        </div>

        <div className="mt-16">
          <h2 className="text-lg font-bold text-slate-900 mb-6">All platform tools</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
            {platformTools.map((tool) => (
              <PlatformToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </div>

        <div className="mt-16 rounded-2xl border border-surface-border bg-surface-muted/30 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">How the tools connect</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Upload an invoice to the Export Auditor for readiness and disposition. Use the Compliance
            Wizard to classify products and estimate landed cost. Price EU road freight with the Freight
            Calculator. Allocate costs by country with Intrastat Allocation.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/platform/export-auditor" className="btn-primary">
              Start with Export Auditor
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/platform/customs" className="btn-secondary">
              Customs Wizard
            </Link>
            <Link href="/#roadmap" className="btn-secondary">
              View Roadmap
            </Link>
          </div>
        </div>

        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-slate-400">
          Export Auditor uses the dedicated Export Auditor API (
          <code className="text-[11px]">export-auditor.onrender.com</code>) for OCR, readiness,
          disposition, preference-origin, and audit-report. Other tools connect to the ExportGateway
          production API. All outputs are indicative — verify before customs or commercial use. See
          our{" "}
          <Link href="/disclaimer" className="text-brand-600 hover:underline">
            Customs &amp; Trade Disclaimer
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
