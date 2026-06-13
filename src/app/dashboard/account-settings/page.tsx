import type { Metadata } from "next";
import {
  DashboardSidebar,
  DashboardHeader,
} from "@/components/layout/DashboardLayout";
import { DeclarationLanguageSettings } from "@/components/dashboard/DeclarationLanguageSettings";

export const metadata: Metadata = {
  title: "Account Settings",
};

export default function AccountSettingsPage() {
  return (
    <div className="min-h-screen bg-surface-dark">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader title="Account Settings" />
        <main className="p-6 lg:p-8 max-w-3xl">
          {/* Profile */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Profile
            </h3>
            <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-600/20 border border-brand-500/30 text-lg font-bold text-brand-400">
                  SC
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Sarah Chen</p>
                  <p className="text-xs text-slate-500">sarah@nordic-mfg.com</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    First name
                  </label>
                  <input
                    type="text"
                    defaultValue="Sarah"
                    className="w-full rounded-lg border border-surface-dark-border bg-surface-dark-muted px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Last name
                  </label>
                  <input
                    type="text"
                    defaultValue="Chen"
                    className="w-full rounded-lg border border-surface-dark-border bg-surface-dark-muted px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Company
                </label>
                <input
                  type="text"
                  defaultValue="Nordic Manufacturing GmbH"
                  className="w-full rounded-lg border border-surface-dark-border bg-surface-dark-muted px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
                />
              </div>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                Save Changes
              </button>
            </div>
          </section>

          {/* Plan */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Subscription
            </h3>
            <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Pro Plan</p>
                  <p className="text-xs text-slate-500 mt-0.5">€49/month · Renews Jul 9, 2026</p>
                </div>
                <span className="rounded-full bg-brand-500/10 border border-brand-500/20 px-3 py-1 text-xs font-semibold text-brand-400">
                  Active
                </span>
              </div>
              <div className="mt-4 flex gap-3">
                <button className="rounded-lg border border-surface-dark-border px-4 py-2 text-sm font-medium text-slate-300 hover:bg-surface-dark-muted transition-colors">
                  Manage Billing
                </button>
                <button className="rounded-lg border border-surface-dark-border px-4 py-2 text-sm font-medium text-slate-300 hover:bg-surface-dark-muted transition-colors">
                  Upgrade Plan
                </button>
              </div>
            </div>
          </section>

          <DeclarationLanguageSettings />

          {/* Security */}
          <section>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Security
            </h3>
            <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">Password</p>
                  <p className="text-xs text-slate-500">Last changed 30 days ago</p>
                </div>
                <button className="rounded-lg border border-surface-dark-border px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-surface-dark-muted transition-colors">
                  Change
                </button>
              </div>
              <div className="border-t border-surface-dark-border" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Two-factor authentication
                  </p>
                  <p className="text-xs text-slate-500">Add an extra layer of security</p>
                </div>
                <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
                  Enable
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
