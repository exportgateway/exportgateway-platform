import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Lock, Globe, Eye, FileCheck, Server, ClipboardList, FileScan } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { legalEntity } from "@/lib/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Security & Compliance",
  description: `Security and compliance practices for ExportGateway, operated by ${legalEntity.companyName}.`,
  path: "/security",
});

const securityFeatures = [
  {
    icon: Lock,
    title: "Encrypted data storage",
    description: "Trade and platform data stored with encryption appropriate to the hosting environment.",
  },
  {
    icon: Shield,
    title: "Encrypted connections",
    description: "HTTPS used for all web and API traffic between clients and ExportGateway services.",
  },
  {
    icon: Globe,
    title: "GDPR-aligned processing",
    description: "Data processing aligned with GDPR. Data subject rights supported. EU-focused data handling.",
  },
  {
    icon: Eye,
    title: "Access controls",
    description: "Role-based access design for team accounts (planned). Authentication and session management at launch.",
  },
  {
    icon: ClipboardList,
    title: "Audit logging",
    description: "Classification runs logged with engine type, confidence, disambiguation, and evidence metadata.",
  },
  {
    icon: Server,
    title: "Infrastructure",
    description: "Cloud infrastructure with redundant backups, health monitoring, and startup diagnostics.",
  },
  {
    icon: FileCheck,
    title: "Transparent outputs",
    description: "All compliance and freight estimates labelled indicative with source attribution and disclaimer requirements.",
  },
];

export default function SecurityPage() {
  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0">
          <div className="max-w-3xl mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Security &amp; Compliance</h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              ExportGateway is operated by {legalEntity.companyName}. Security, data protection, and regulatory
              transparency are foundational to a platform handling customs and trade data.
            </p>
            <div className="mt-4 text-sm text-slate-500 bg-surface-muted/50 rounded-xl p-4 border border-surface-border">
              <p><strong>{legalEntity.companyName}</strong></p>
              <p>{legalEntity.address}, {legalEntity.postalCode} {legalEntity.city}, {legalEntity.country}</p>
              <p>MŠ: {legalEntity.registrationNumber} · VAT: {legalEntity.vatId}</p>
              <p>Contact: <a href={`mailto:${legalEntity.securityEmail}`} className="text-brand-600 hover:underline">{legalEntity.securityEmail}</a></p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-surface-border bg-white p-6 card-hover">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                  <feature.icon className="h-5 w-5 text-brand-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-surface-border bg-white p-6 sm:p-8">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
              <FileScan className="h-5 w-5 text-brand-600" aria-hidden />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Document Processing Security</h2>
            <p className="mt-2 text-sm text-slate-500">
              Export Auditor — invoice upload, OCR, and compliance analysis
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              <li className="rounded-xl border border-surface-border bg-surface-muted/30 p-4">
                <p className="text-sm font-semibold text-slate-900">No permanent document storage</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  ExportGateway does not permanently store uploaded source documents. Processing occurs in
                  memory for the duration of the audit session.
                </p>
              </li>
              <li className="rounded-xl border border-surface-border bg-surface-muted/30 p-4">
                <p className="text-sm font-semibold text-slate-900">Temporary OCR processing</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Documents are processed temporarily for OCR extraction and structured export compliance
                  analysis. Only extracted results are displayed in the dashboard.
                </p>
              </li>
              <li className="rounded-xl border border-surface-border bg-surface-muted/30 p-4">
                <p className="text-sm font-semibold text-slate-900">EU-focused infrastructure</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  OCR is performed via Mistral AI, which serves its API from EU data centers by default.
                  ExportGateway is operated from Slovenia within the European Union.
                </p>
              </li>
              <li className="rounded-xl border border-surface-border bg-surface-muted/30 p-4">
                <p className="text-sm font-semibold text-slate-900">GDPR-aligned processing</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Document processing follows GDPR-aligned practices. Users must confirm they are authorized
                  to process uploaded document contents.
                </p>
              </li>
              <li className="rounded-xl border border-surface-border bg-surface-muted/30 p-4 sm:col-span-2">
                <p className="text-sm font-semibold text-slate-900">
                  Commercial AI providers with no training on customer documents
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  OCR uses Mistral AI under commercial API terms. Customer documents are not used for model
                  training. Mistral may retain request data for up to 30 days for abuse prevention unless
                  Zero Data Retention is enabled. See our{" "}
                  <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  for sub-processor details.
                </p>
              </li>
            </ul>
          </div>

          <div className="mt-8 rounded-2xl border border-surface-border bg-surface-muted/50 p-8">
            <h3 className="text-xl font-bold text-slate-900">Customs &amp; Trade Compliance</h3>
            <p className="mt-3 text-slate-600 leading-relaxed">
              ExportGateway implements P0 compliance transparency requirements: global disclaimer banners, confidence
              display on classifications, source labelling on all estimates, and legal notices in PDF reports. Platform
              outputs are indicative and must be verified before customs or commercial use.
            </p>
            <Link href="/disclaimer" className="mt-4 inline-flex text-sm font-semibold text-brand-600 hover:text-brand-700">
              Read Customs &amp; Trade Disclaimer →
            </Link>
          </div>

          <div className="mt-8 rounded-2xl border border-surface-border bg-white p-8 text-center">
            <h3 className="text-lg font-bold text-slate-900">Security inquiries</h3>
            <p className="mt-2 text-slate-600">
              For security reviews, compliance documentation, or data processing agreements:
            </p>
            <a
              href={`mailto:${legalEntity.securityEmail}`}
              className="mt-4 inline-flex text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              {legalEntity.securityEmail}
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
