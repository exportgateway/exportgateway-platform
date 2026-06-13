import type { Metadata } from "next";
import {
  DashboardSidebar,
  DashboardHeader,
} from "@/components/layout/DashboardLayout";

export const metadata: Metadata = {
  title: "Saved Projects",
};

const projects = [
  {
    name: "DE → US Electronics Export Q2",
    ref: "EXP-2026-1042",
    status: "In Progress",
    docs: 4,
    updated: "2 hours ago",
  },
  {
    name: "Rotterdam → Shanghai FCL",
    ref: "FRT-2026-0891",
    status: "Quoted",
    docs: 2,
    updated: "Yesterday",
  },
  {
    name: "NL → UK Shipment #1038",
    ref: "EXP-2026-1038",
    status: "Completed",
    docs: 6,
    updated: "3 days ago",
  },
  {
    name: "FR → AE Machinery Export",
    ref: "EXP-2026-1025",
    status: "Draft",
    docs: 1,
    updated: "1 week ago",
  },
];

const statusColors: Record<string, string> = {
  "In Progress": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Quoted: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Draft: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function SavedProjectsPage() {
  return (
    <div className="min-h-screen bg-surface-dark">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader title="Saved Projects" />
        <main className="p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-slate-400">
              {projects.length} saved projects
            </p>
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
              New Project
            </button>
          </div>

          <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-dark-border">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    Reference
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    Docs
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.ref}
                    className="border-b border-surface-dark-border last:border-0 hover:bg-surface-dark-muted/50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4 font-medium text-slate-200">
                      {project.name}
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs hidden sm:table-cell">
                      {project.ref}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 hidden md:table-cell">
                      {project.docs}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-500">
                      {project.updated}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
