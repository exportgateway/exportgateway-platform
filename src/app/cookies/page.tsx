import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { legalEntity } from "@/lib/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Cookie Policy",
  description: `How ExportGateway uses cookies and similar technologies, operated by ${legalEntity.companyName}.`,
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <MarketingLayout>
      <article className="pt-32 pb-16 sm:pt-40">
        <div className="container-text section-padding !pt-0 px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Cookie Policy</h1>
          <p className="mt-4 text-sm text-slate-500">Last updated: June 10, 2026</p>

          <div className="mt-10 space-y-8 text-slate-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Who we are</h2>
              <p>
                This Cookie Policy applies to ExportGateway, operated by {legalEntity.companyName},{" "}
                {legalEntity.address}, {legalEntity.postalCode} {legalEntity.city}, {legalEntity.country}.
                Contact:{" "}
                <a href={`mailto:${legalEntity.privacyEmail}`} className="text-brand-600 hover:underline">
                  {legalEntity.privacyEmail}
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. What are cookies?</h2>
              <p>
                Cookies are small text files stored on your device when you visit a website. We also use
                similar local storage for cookie consent preferences.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Cookie categories</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Necessary</strong> — Required for core site functionality, security, and remembering
                  your cookie choices. These cannot be disabled.
                </li>
                <li>
                  <strong>Analytics</strong> — Optional. Help us understand how visitors use ExportGateway so we
                  can improve tools and content. Only activated with your consent.
                </li>
                <li>
                  <strong>Marketing</strong> — Reserved for future campaign and attribution cookies. Not active
                  at launch; you may opt in or out in advance via Manage Preferences.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Managing your preferences</h2>
              <p>
                When you first visit ExportGateway, a cookie banner lets you Reject All, Accept All, or Manage
                Preferences by category. Your choice is stored locally and the banner will not reappear unless
                you clear site data or we update this policy materially.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Related policies</h2>
              <p>
                See our{" "}
                <a href="/privacy" className="text-brand-600 hover:underline">
                  Privacy Policy
                </a>{" "}
                for how we process personal data, and our{" "}
                <a href="/security" className="text-brand-600 hover:underline">
                  Security & Compliance
                </a>{" "}
                page for data protection practices.
              </p>
            </section>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
