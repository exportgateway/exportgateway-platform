"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { navLinks } from "@/lib/constants";
import { platformTools } from "@/lib/platform-tools";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const pathname = usePathname();
  const isPlatformActive = pathname.startsWith("/platform");

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mt-4 flex h-14 items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-4 shadow-sm backdrop-blur-xl sm:px-6">
          <Logo />

          <div className="hidden md:flex items-center gap-1">
            <div className="relative">
              <Link
                href="/platform"
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  isPlatformActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-surface-muted hover:text-slate-900"
                )}
                onMouseEnter={() => setPlatformOpen(true)}
              >
                Platform
                <ChevronDown className={cn("h-4 w-4 transition-transform", platformOpen && "rotate-180")} />
              </Link>
              {platformOpen && (
                <div
                  className="absolute top-full left-0 mt-1 w-60 rounded-xl border border-surface-border bg-white p-2 shadow-lg"
                  onMouseLeave={() => setPlatformOpen(false)}
                >
                  <Link
                    href="/platform"
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-900 hover:bg-surface-muted"
                    onClick={() => setPlatformOpen(false)}
                  >
                    Platform Hub
                  </Link>
                  <div className="my-1 border-t border-surface-border" />
                  {platformTools.map((tool) => (
                    <Link
                      key={tool.id}
                      href={tool.href}
                      className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-surface-muted"
                      onClick={() => setPlatformOpen(false)}
                    >
                      {tool.shortName}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {navLinks.filter((l) => l.label !== "Platform").map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-surface-muted hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" href="/early-access" size="sm">
              Early Access
            </Button>
            <Button href="/platform" size="sm">
              Open Platform
            </Button>
          </div>

          <button
            className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-surface-muted"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-300 ease-in-out",
            mobileOpen ? "max-h-[32rem] opacity-100 mt-2" : "max-h-0 opacity-0"
          )}
        >
          <div className="rounded-2xl border border-surface-border bg-white p-4 shadow-lg">
            <p className="px-4 py-1 text-xs font-semibold text-slate-400 uppercase">Platform</p>
            <Link href="/platform" className="block rounded-lg px-4 py-2 text-sm font-medium text-slate-900 hover:bg-surface-muted" onClick={() => setMobileOpen(false)}>
              Platform Hub
            </Link>
            {platformTools.map((tool) => (
              <Link key={tool.id} href={tool.href} className="block rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-surface-muted" onClick={() => setMobileOpen(false)}>
                {tool.shortName}
              </Link>
            ))}
            <div className="my-2 border-t border-surface-border" />
            {navLinks.filter((l) => l.label !== "Platform").map((link) => (
              <Link key={link.href} href={link.href} className="block rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-surface-muted" onClick={() => setMobileOpen(false)}>
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-surface-border pt-3">
              <Button variant="secondary" href="/early-access" className="w-full">
                Early Access
              </Button>
              <Button href="/platform" className="w-full">
                Open Platform
              </Button>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
