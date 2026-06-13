import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TrendingUp, Clock, FileCheck } from "lucide-react";
import {
  DashboardSidebar,
  DashboardHeader,
} from "@/components/layout/DashboardLayout";
import { Icon } from "@/components/ui/Icon";
import { dashboardModules } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "ExportGateway dashboard — manage freight, customs, and export documentation.",
};

const stats = [
  { label: "Active Shipments", value: "24", change: "+3 this week", icon: TrendingUp },
  { label: "Pending Documents", value: "7", change: "2 due today", icon: FileCheck },
  { label: "Avg. Clearance Time", value: "48h", change: "-12h vs last month", icon: Clock },
];

const recentActivity = [
  { action: "Commercial invoice generated", project: "DE → US Shipment #1042", time: "2 hours ago" },
  { action: "CN code classified: 8471.30", project: "Electronics Export Q2", time: "5 hours ago" },
  { action: "Freight quote saved", project: "Rotterdam → Shanghai FCL", time: "Yesterday" },
  { action: "Packing list updated", project: "NL → UK Shipment #1038", time: "Yesterday" },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-surface-dark">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader />
        <main className="p-6 lg:p-8">
          {/* Welcome */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Welcome back, Sarah</h2>
            <p className="mt-1 text-sm text-slate-400">
              Here&apos;s an overview of your trade operations
            </p>
          </div>

          {/* Stats */}
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-surface-dark-border bg-surface-dark-card p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <stat.icon className="h-4 w-4 text-slate-500" />
                </div>
                <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
                <p className="mt-1 text-xs text-brand-400">{stat.change}</p>
              </div>
            ))}
          </div>

          {/* Modules Grid */}
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Modules
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {dashboardModules.map((mod) => (
              <Link
                key={mod.id}
                href={mod.href}
                className="group rounded-xl border border-surface-dark-border bg-surface-dark-card p-5 transition-all duration-200 hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5"
              >
                <div
                  className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${mod.color}`}
                >
                  <Icon name={mod.icon} className="h-5 w-5 text-white" />
                </div>
                <h4 className="text-sm font-semibold text-white group-hover:text-brand-400 transition-colors">
                  {mod.title}
                </h4>
                <p className="mt-1 text-xs text-slate-500">{mod.description}</p>
                <ArrowRight className="mt-3 h-4 w-4 text-slate-600 group-hover:text-brand-400 transition-colors" />
              </Link>
            ))}
          </div>

          {/* Recent Activity */}
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Recent Activity
          </h3>
          <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card divide-y divide-surface-dark-border">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-200">{item.action}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.project}</p>
                </div>
                <span className="text-xs text-slate-500 shrink-0 ml-4">{item.time}</span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
