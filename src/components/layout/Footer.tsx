import Link from "next/link";

import { Logo } from "@/components/ui/Logo";

import { footerLinks } from "@/lib/constants";

import { legalEntity } from "@/lib/legal";



export function Footer() {

  return (

    <footer className="border-t border-surface-border bg-white">

      <div className="container-narrow section-padding !pb-8">

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">

          <div className="col-span-2 md:col-span-1">

            <Logo />

            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">

              AI-powered trade compliance — customs intelligence, export auditing, freight pricing,

              and Intrastat preparation for exporters and customs professionals.

            </p>

            <p className="mt-4 text-sm text-slate-500">

              <a

                href={legalEntity.website}

                className="font-medium text-brand-600 hover:text-brand-700"

              >

                exportgateway.eu

              </a>

            </p>

            <p className="mt-3 text-xs text-slate-400 leading-relaxed">

              {legalEntity.companyName}

              <br />

              {legalEntity.address}, {legalEntity.postalCode} {legalEntity.city}, {legalEntity.country}

              <br />

              MŠ: {legalEntity.registrationNumber} · VAT: {legalEntity.vatId}

            </p>

          </div>



          <div>

            <h3 className="text-sm font-semibold text-slate-900">Product</h3>

            <ul className="mt-4 space-y-3">

              {footerLinks.product.map((link) => (

                <li key={link.href}>

                  <Link href={link.href} className="text-sm text-slate-500 transition-colors hover:text-brand-600">

                    {link.label}

                  </Link>

                </li>

              ))}

            </ul>

          </div>



          <div>

            <h3 className="text-sm font-semibold text-slate-900">Company</h3>

            <ul className="mt-4 space-y-3">

              {footerLinks.company.map((link) => (

                <li key={link.href}>

                  <Link href={link.href} className="text-sm text-slate-500 transition-colors hover:text-brand-600">

                    {link.label}

                  </Link>

                </li>

              ))}

            </ul>

          </div>



          <div>

            <h3 className="text-sm font-semibold text-slate-900">Legal</h3>

            <ul className="mt-4 space-y-3">

              {footerLinks.legal.map((link) => (

                <li key={link.href}>

                  <Link href={link.href} className="text-sm text-slate-500 transition-colors hover:text-brand-600">

                    {link.label}

                  </Link>

                </li>

              ))}

            </ul>

          </div>

        </div>



        <div className="mt-12 border-t border-surface-border pt-8 text-center sm:text-left">

          <p className="text-sm text-slate-500">

            &copy; {new Date().getFullYear()}{" "}

            <a href={legalEntity.website} className="font-medium text-slate-700 hover:text-brand-600">

              ExportGateway.eu

            </a>

            . All rights reserved. ·{" "}

            <a href={`mailto:${legalEntity.email}`} className="hover:text-brand-600">

              {legalEntity.email}

            </a>

          </p>

        </div>

      </div>

    </footer>

  );

}

