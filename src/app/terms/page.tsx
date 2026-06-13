import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { legalEntity } from "@/lib/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms & Conditions",
  description: `Terms and Conditions for ExportGateway, operated by ${legalEntity.companyName}.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <MarketingLayout>
      <article className="pt-32 pb-16 sm:pt-40">
        <div className="container-text section-padding !pt-0 px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Terms &amp; Conditions</h1>
          <p className="mt-4 text-sm text-slate-500">Last updated: June 9, 2026</p>

          <div className="mt-10 space-y-8 text-slate-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Agreement</h2>
              <p>
                These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of ExportGateway, operated by{" "}
                <strong>{legalEntity.companyName}</strong>, {legalEntity.address},{" "}
                {legalEntity.postalCode} {legalEntity.city}, {legalEntity.country} (MŠ: {legalEntity.registrationNumber},
                VAT: {legalEntity.vatId}). By accessing ExportGateway you agree to these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Service Description</h2>
              <p>
                ExportGateway provides a software platform for international trade automation including customs
                classification, compliance estimation, freight intelligence, export documentation, and AI-assisted
                product understanding. Module availability varies by plan and development status (Live, Beta,
                In Development, Coming Soon) as indicated on the platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Indicative Estimates Disclaimer</h2>
              <p>
                All outputs from ExportGateway — including CN/HS code suggestions, duty estimates, VAT calculations,
                freight prices, and document checklists — are indicative planning tools only. They do not constitute
                legal, customs, tax, or freight advice. See our{" "}
                <Link href="/disclaimer" className="text-brand-600 hover:underline">
                  Customs &amp; Trade Disclaimer
                </Link>{" "}
                for full details. You must independently verify all outputs before commercial or customs use.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Early Access &amp; Pre-Launch</h2>
              <p>
                During pre-launch, certain modules may be labelled Beta, In Development, or Coming Soon. Early access
                registration does not guarantee feature availability timelines. We may modify, suspend, or discontinue
                features during pre-launch without prior notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Use the platform for unlawful purposes</li>
                <li>Attempt unauthorised access to our systems or data</li>
                <li>Reverse engineer or decompile platform components</li>
                <li>Submit false or misleading trade data</li>
                <li>Rely on indicative outputs as official customs or freight declarations without verification</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Intellectual Property</h2>
              <p>
                ExportGateway, including its classification engine, taxonomy, AES knowledge integration, and platform
                design, is owned by {legalEntity.companyName}. You retain ownership of data you submit to the platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by applicable law, {legalEntity.companyName} shall not be liable for
                any indirect, incidental, special, or consequential damages arising from reliance on platform outputs,
                including customs penalties, freight cost discrepancies, or document rejections.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the {legalEntity.governingLaw}. Disputes shall be resolved before
                the {legalEntity.courts}.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Contact</h2>
              <p>
                {legalEntity.companyName} · {legalEntity.email} · {legalEntity.address},{" "}
                {legalEntity.postalCode} {legalEntity.city}
              </p>
            </section>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
