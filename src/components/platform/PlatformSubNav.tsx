"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { platformTools } from "@/lib/platform-tools";

export function PlatformSubNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-surface-border bg-white/80 backdrop-blur-sm">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 overflow-x-auto py-3 -mx-1">
          <Link
            href="/platform"
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              pathname === "/platform"
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-surface-muted hover:text-slate-900"
            )}
          >
            Dashboard
          </Link>
          {platformTools.map((tool) => (
            <Link
              key={tool.id}
              href={tool.href}
              className={cn(
                "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                pathname === tool.href
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-surface-muted hover:text-slate-900"
              )}
            >
              {tool.shortName}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
