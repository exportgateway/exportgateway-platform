"use client";

import Link from "next/link";
import { Shield, Lock, Globe, FileCheck, ClipboardList } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { legalEntity } from "@/lib/legal";

const items = [
  { icon: Lock, title: "Encrypted data storage", description: "Trade and platform data stored with encryption appropriate to the hosting environment." },
  { icon: Shield, title: "Encrypted connections", description: "HTTPS for all web and API traffic between clients and ExportGateway." },
  { icon: Globe, title: "GDPR-aligned processing", description: "GDPR-compliant processing with EU-focused data handling." },
  { icon: ClipboardList, title: "Audit logging", description: "Classification runs logged with engine, confidence, and evidence metadata." },
  { icon: FileCheck, title: "Transparent estimates", description: "All compliance and freight outputs labelled indicative with source attribution." },
];

export function SecurityPreview() {
  return (
    <section className="section-padding bg-surface-muted/30">
      <div className="container-narrow">
        <AnimatedSection>
          <SectionHeader
            badge="Security & Compliance"
            title="Enterprise-grade trust for trade data"
            description={`ExportGateway is operated by ${legalEntity.companyName}, ${legalEntity.city}, ${legalEntity.country}. Security and compliance are foundational — not afterthoughts.`}
          />
        </AnimatedSection>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {items.map((item) => (
            <AnimatedSection key={item.title}>
              <div className="rounded-xl border border-surface-border bg-white p-5 h-full card-hover">
                <item.icon className="h-5 w-5 text-brand-600 mb-3" />
                <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{item.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection className="text-center">
          <Link href="/security" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            View Security & Compliance details →
          </Link>
        </AnimatedSection>
      </div>
    </section>
  );
}
