import type { Metadata } from "next";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { legalEntity } from "@/lib/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description: `Privacy Policy for ExportGateway, operated by ${legalEntity.companyName}.`,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <MarketingLayout>
      <article className="pt-32 pb-16 sm:pt-40">
        <div className="container-text section-padding !pt-0 px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="mt-4 text-sm text-slate-500">Last updated: June 10, 2026</p>

          <div className="mt-10 space-y-8 text-slate-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Data Controller</h2>
              <p>
                The data controller for ExportGateway is:
              </p>
              <ul className="mt-3 list-none space-y-1 text-sm bg-surface-muted/50 rounded-xl p-5 border border-surface-border">
                <li><strong>{legalEntity.companyName}</strong> (trading as ExportGateway)</li>
                <li>{legalEntity.address}</li>
                <li>{legalEntity.postalCode} {legalEntity.city}, {legalEntity.country}</li>
                <li>Registration number (MŠ): {legalEntity.registrationNumber}</li>
                <li>VAT ID: {legalEntity.vatId}</li>
                <li>Email: <a href={`mailto:${legalEntity.privacyEmail}`} className="text-brand-600 hover:underline">{legalEntity.privacyEmail}</a></li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Information We Collect</h2>
              <p>We collect information you provide directly, including:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Account and early access registration details (name, email, company, role)</li>
                <li>Product descriptions and trade data entered into classification and compliance tools</li>
                <li>Shipment details (origin, destination, values, weights, incoterms)</li>
                <li>Export invoice and customs documents uploaded to Export Auditor for OCR and compliance analysis</li>
                <li>Communications with our support team</li>
                <li>Early access and contact form submissions</li>
              </ul>
              <p className="mt-3">
                We also automatically collect usage data, device information, and log data when you interact with our platform and website.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Provide, maintain, and improve ExportGateway services</li>
                <li>Process classification, compliance, and freight estimation requests</li>
                <li>Send platform updates, early access notifications, and support messages</li>
                <li>Respond to inquiries and assistance requests</li>
                <li>Monitor platform usage and improve classification accuracy</li>
                <li>Comply with legal obligations under Slovenian and EU law</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Legal Basis (GDPR)</h2>
              <p>
                We process personal data under the following legal bases: contract performance (providing requested services),
                legitimate interests (platform improvement and security), consent (marketing communications and early access),
                and legal obligation where applicable under the General Data Protection Regulation (GDPR).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Data Sharing</h2>
              <p>
                We do not sell your personal information. We may share data with trusted service providers (hosting,
                email delivery, AI processing) subject to data processing agreements. We may disclose information if
                required by law or to protect our rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Data Security</h2>
              <p>
                We implement appropriate technical and organisational measures including encrypted data storage,
                encrypted connections, access controls, and audit logging. See our{" "}
                <a href="/security" className="text-brand-600 hover:underline">Security & Compliance</a> page.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Your Rights</h2>
              <p>
                Under GDPR, you have the right to access, rectify, erase, restrict processing, data portability, and
                object to processing. Contact{" "}
                <a href={`mailto:${legalEntity.privacyEmail}`} className="text-brand-600 hover:underline">
                  {legalEntity.privacyEmail}
                </a>{" "}
                to exercise these rights. You may lodge a complaint with the Information Commissioner of the Republic of Slovenia.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Data Retention</h2>
              <p>
                We retain data for as long as necessary to provide services or as required by law. Classification audit
                records may be retained for platform improvement. You may request deletion of your account data at any time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">9. AI Processing Sub-processors</h2>
              <p className="mb-4">
                When you use Export Auditor, we engage the following sub-processor to perform OCR and
                structured data extraction on uploaded documents:
              </p>
              <div className="rounded-xl border border-surface-border bg-surface-muted/50 p-5 text-sm space-y-4">
                <div>
                  <p className="font-semibold text-slate-900">Provider</p>
                  <p className="mt-1">Mistral AI (France)</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Purpose</p>
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    <li>OCR extraction</li>
                    <li>Invoice data extraction</li>
                    <li>Export compliance analysis</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Retention</p>
                  <p className="mt-1">
                    Up to 30 days by provider unless Zero Data Retention is enabled. ExportGateway does not
                    permanently store uploaded source documents.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm">
                Customer documents processed via Mistral AI commercial API terms are not used for model
                training. For document processing security practices, see our{" "}
                <a href="/security" className="text-brand-600 hover:underline">Security &amp; Compliance</a> page.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Contact</h2>
              <p>
                {legalEntity.companyName} · {legalEntity.address}, {legalEntity.postalCode} {legalEntity.city} ·{" "}
                <a href={`mailto:${legalEntity.privacyEmail}`} className="text-brand-600 hover:underline">
                  {legalEntity.privacyEmail}
                </a>
              </p>
            </section>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
