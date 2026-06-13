"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  Shield,
  FileText,
  FolderOpen,
  Settings,
  LayoutDashboard,
  Bell,
  Search,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { useState } from "react";

const sidebarLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Freight Calculator", href: "/dashboard/freight-calculator", icon: Calculator },
  { label: "Customs Wizard", href: "/dashboard/customs-wizard", icon: Shield },
  { label: "Export Documents", href: "/dashboard/export-documents", icon: FileText },
  { label: "Saved Projects", href: "/dashboard/saved-projects", icon: FolderOpen },
  { label: "Account Settings", href: "/dashboard/account-settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center px-6 border-b border-surface-dark-border">
        <Logo variant="dark" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {sidebarLinks.map((link) => {
          const isActive =
            link.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-600/10 text-brand-400"
                  : "text-slate-400 hover:bg-surface-dark-muted hover:text-slate-200"
              )}
            >
              <link.icon className="h-5 w-5 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-surface-dark-border p-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-surface-dark-muted hover:text-slate-200 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Back to Website
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 rounded-lg bg-surface-dark-card border border-surface-dark-border p-2 text-slate-400"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-surface-dark border-r border-surface-dark-border transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

export function DashboardHeader({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-surface-dark-border bg-surface-dark/80 backdrop-blur-xl px-6 lg:px-8">
      <div className="flex items-center gap-4 pl-10 lg:pl-0">
        {title && (
          <h1 className="text-lg font-semibold text-white">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="rounded-lg p-2 text-slate-400 hover:bg-surface-dark-muted hover:text-slate-200 transition-colors">
          <Search className="h-5 w-5" />
        </button>
        <button className="relative rounded-lg p-2 text-slate-400 hover:bg-surface-dark-muted hover:text-slate-200 transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/20 border border-brand-500/30 text-xs font-bold text-brand-400">
          SC
        </div>
      </div>
    </header>
  );
}
