import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ContactForm } from "@/components/contact/ContactForm";
import { siteConfig } from "@/lib/constants";
import { legalEntity } from "@/lib/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact",
  description:
    "Get in touch with the ExportGateway team. Sales inquiries, support, and partnership opportunities.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <MarketingLayout>
      <section className="pt-32 pb-16 sm:pt-40">
        <div className="container-narrow section-padding !pt-0">
          <SectionHeader
            badge="Contact"
            title="Let's talk trade"
            description="Whether you're exploring ExportGateway for your team or need help with an existing account, we're here to help."
          />

          <div className="grid lg:grid-cols-5 gap-12 max-w-5xl mx-auto">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Get in touch
                </h3>
                <div className="space-y-4">
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="flex items-center gap-3 text-sm text-slate-600 hover:text-brand-600 transition-colors"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                      <Mail className="h-5 w-5 text-brand-600" />
                    </div>
                    {siteConfig.email}
                  </a>
                  <a
                    href={`mailto:${siteConfig.supportEmail}`}
                    className="flex items-center gap-3 text-sm text-slate-600 hover:text-brand-600 transition-colors"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                      <Phone className="h-5 w-5 text-brand-600" />
                    </div>
                    {siteConfig.supportEmail}
                  </a>
                  <div className="flex items-start gap-3 text-sm text-slate-600">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <MapPin className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        {legalEntity.city}, {legalEntity.country}
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        {legalEntity.address}, {legalEntity.postalCode}
                      </p>
                      <p className="mt-1 text-slate-500">
                        Serving exporters across the European Union
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-surface-border bg-surface-muted/50 p-6 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">{legalEntity.companyName}</p>
                <p className="mt-1">MŠ: {legalEntity.registrationNumber}</p>
                <p>VAT: {legalEntity.vatId}</p>
              </div>

              <div className="rounded-2xl border border-surface-border bg-surface-muted/50 p-6">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">
                  Enterprise sales
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Need API access, team accounts, or custom integrations? Our
                  enterprise team will design a solution for your organization.
                </p>
              </div>
            </div>

            <div className="lg:col-span-3">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
