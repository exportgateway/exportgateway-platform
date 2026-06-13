"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { customsDisclaimer } from "@/lib/legal";

export function CustomsDisclaimerSection() {
  return (
    <section id="disclaimer" className="section-padding bg-amber-50/50 border-y border-amber-100">
      <div className="container-narrow">
        <AnimatedSection>
          <div className="flex items-start gap-4 mb-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{customsDisclaimer.title}</h2>
              <p className="mt-2 text-slate-600 leading-relaxed">{customsDisclaimer.summary}</p>
            </div>
          </div>

          <ul className="grid sm:grid-cols-2 gap-4">
            {customsDisclaimer.points.map((point, i) => (
              <li
                key={i}
                className="rounded-xl border border-amber-100 bg-white/80 px-5 py-4 text-sm leading-relaxed text-slate-600"
              >
                {point}
              </li>
            ))}
          </ul>

          <p className="mt-8 text-center">
            <Link
              href="/disclaimer"
              className="text-sm font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2"
            >
              Read full Customs & Trade Disclaimer →
            </Link>
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
