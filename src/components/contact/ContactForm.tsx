"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ContactForm() {
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
        <h3 className="text-lg font-semibold text-slate-900">Message sent</h3>
        <p className="mt-2 text-sm text-slate-500">
          Thank you for reaching out. Our team will get back to you within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-surface-border bg-white p-8 space-y-5"
    >
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="firstName" className="label-text">
            First name
          </label>
          <input id="firstName" type="text" className="input-field" placeholder="Sarah" required />
        </div>
        <div>
          <label htmlFor="lastName" className="label-text">
            Last name
          </label>
          <input id="lastName" type="text" className="input-field" placeholder="Chen" required />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="label-text">
          Work email
        </label>
        <input id="email" type="email" className="input-field" placeholder="sarah@company.com" required />
      </div>
      <div>
        <label htmlFor="company" className="label-text">
          Company
        </label>
        <input id="company" type="text" className="input-field" placeholder="Your company name" />
      </div>
      <div>
        <label htmlFor="subject" className="label-text">
          Subject
        </label>
        <select id="subject" className="input-field" required>
          <option value="">Select a topic</option>
          <option value="sales">Sales inquiry</option>
          <option value="support">Technical support</option>
          <option value="enterprise">Enterprise plan</option>
          <option value="partnership">Partnership</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="message" className="label-text">
          Message
        </label>
        <textarea
          id="message"
          rows={4}
          className="input-field resize-none"
          placeholder="Tell us about your trade operations and how we can help..."
          required
        />
      </div>
      <Button type="submit" className="w-full" size="lg">
        Send Message
      </Button>
    </form>
  );
}
