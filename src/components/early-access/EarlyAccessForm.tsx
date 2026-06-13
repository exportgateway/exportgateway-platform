"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface EarlyAccessFormProps {
  defaultPlan?: string;
}

export function EarlyAccessForm({ defaultPlan }: EarlyAccessFormProps) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-surface-border bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900">You&apos;re on the list</h3>
        <p className="mt-2 text-sm text-slate-500">
          Thank you for joining ExportGateway early access. We&apos;ll notify you when new modules launch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-surface-border bg-white p-8 space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="ea-firstName" className="label-text">First name</label>
          <input id="ea-firstName" type="text" className="input-field" required />
        </div>
        <div>
          <label htmlFor="ea-lastName" className="label-text">Last name</label>
          <input id="ea-lastName" type="text" className="input-field" required />
        </div>
      </div>
      <div>
        <label htmlFor="ea-email" className="label-text">Work email</label>
        <input id="ea-email" type="email" className="input-field" placeholder="you@company.com" required />
      </div>
      <div>
        <label htmlFor="ea-company" className="label-text">Company</label>
        <input id="ea-company" type="text" className="input-field" placeholder="Your company name" required />
      </div>
      <div>
        <label htmlFor="ea-role" className="label-text">Your role</label>
        <select id="ea-role" className="input-field" required defaultValue="">
          <option value="" disabled>Select your role</option>
          <option value="exporter">Exporter / Manufacturer</option>
          <option value="forwarder">Freight Forwarder</option>
          <option value="broker">Customs Broker</option>
          <option value="logistics">Logistics Manager</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="ea-plan" className="label-text">Interested plan</label>
        <select id="ea-plan" className="input-field" defaultValue={defaultPlan ?? "pro"}>
          <option value="free">Free — Compliance Wizard updates</option>
          <option value="pro">Pro — Full platform at launch</option>
          <option value="enterprise">Enterprise — API & teams</option>
        </select>
      </div>
      <div>
        <label htmlFor="ea-interest" className="label-text">Primary interest (optional)</label>
        <textarea
          id="ea-interest"
          rows={3}
          className="input-field resize-none"
          placeholder="e.g. CN classification, freight pricing, export documents..."
        />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" className="mt-1 h-4 w-4 rounded border-surface-border text-brand-600" required />
        <span>
          I agree to receive ExportGateway launch updates and accept the{" "}
          <a href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</a>.
        </span>
      </label>
      <Button type="submit" className="w-full" size="lg">
        Join Early Access
      </Button>
    </form>
  );
}
