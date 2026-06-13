import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { buildPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = buildPageMetadata({
  title: "Launch Readiness Checklist",
  description: "Internal pre-launch checklist for ExportGateway production readiness.",
  path: "/launch-readiness",
  noIndex: true,
});

type CheckStatus = "pass" | "fail";

interface ChecklistItem {
  area: string;
  status: CheckStatus;
  notes: string;
  href?: string;
}

const checklist: ChecklistItem[] = [
  {
    area: "Homepage",
    status: "pass",
    notes: "Real platform intelligence metrics, trust sections, and data source attribution.",
    href: "/",
  },
  {
    area: "Pricing",
    status: "pass",
    notes: "Pro plan dominant with MOST POPULAR badge and ROI value anchor.",
    href: "/pricing",
  },
  {
    area: "FAQ",
    status: "pass",
    notes: "Reduced to five high-value questions with FAQPage structured data.",
    href: "/faq",
  },
  {
    area: "Contact",
    status: "pass",
    notes: "Ljubljana address and consistent legal entity details.",
    href: "/contact",
  },
  {
    area: "Freight",
    status: "pass",
    notes: "Post-calculation trust badge with verified freight intelligence numbers.",
    href: "/platform/freight",
  },
  {
    area: "Intrastat",
    status: "pass",
    notes: "Reporting country transport value hero is visually dominant.",
    href: "/platform/intrastat",
  },
  {
    area: "Terms",
    status: "pass",
    notes: "Legal entity, VAT, and registration consistent with legal.ts.",
    href: "/terms",
  },
  {
    area: "Privacy",
    status: "pass",
    notes: "Data controller details match contact and footer.",
    href: "/privacy",
  },
  {
    area: "Security",
    status: "pass",
    notes: "Verifiable security claims only — no unverified AES-256 or TLS 1.3 statements.",
    href: "/security",
  },
  {
    area: "Cookies",
    status: "pass",
    notes: "Production cookie banner with Reject / Accept / Manage and Cookie Policy page.",
    href: "/cookies",
  },
  {
    area: "SEO",
    status: "pass",
    notes: "Per-page metadata, OpenGraph, Twitter cards, canonical URLs, JSON-LD, sitemap, robots.",
    href: "/sitemap.xml",
  },
  {
    area: "Analytics",
    status: "fail",
    notes: "Analytics provider integration pending — consent framework ready, tags not deployed.",
  },
  {
    area: "Sitemap",
    status: "pass",
    notes: "Auto-generated sitemap.xml with exportgateway.eu URLs.",
    href: "/sitemap.xml",
  },
  {
    area: "Robots",
    status: "pass",
    notes: "robots.txt allows marketing pages, disallows dashboard and internal checklist.",
    href: "/robots.txt",
  },
];

export default function LaunchReadinessPage() {
  const passCount = checklist.filter((i) => i.status === "pass").length;
  const failCount = checklist.filter((i) => i.status === "fail").length;

  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0 max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Internal</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Launch Readiness Checklist</h1>
          <p className="mt-3 text-slate-600">
            Pre-launch audit for ExportGateway production readiness. {passCount} PASS · {failCount} FAIL
          </p>

          <ul className="mt-10 space-y-3">
            {checklist.map((item) => (
              <li
                key={item.area}
                className={cn(
                  "flex gap-4 rounded-xl border p-4",
                  item.status === "pass"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-amber-200 bg-amber-50/40"
                )}
              >
                {item.status === "pass" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.href ? (
                      <Link href={item.href} className="font-semibold text-slate-900 hover:text-brand-600">
                        {item.area}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-900">{item.area}</span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        item.status === "pass"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.notes}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingLayout>
  );
}
