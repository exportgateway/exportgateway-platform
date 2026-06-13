"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Trash2, Truck, Globe } from "lucide-react";
import {
  clearPlatformHistory,
  getPlatformHistory,
  type PlatformHistoryEntry,
} from "@/lib/platform-history";
import { cn } from "@/lib/utils";

const toolIcons = {
  freight: Truck,
  intrastat: Globe,
};

const toolColors = {
  freight: "text-brand-600 bg-brand-50",
  intrastat: "text-emerald-600 bg-emerald-50",
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function RecentActivityPanel({ limit = 5 }: { limit?: number }) {
  const [entries, setEntries] = useState<PlatformHistoryEntry[]>([]);

  useEffect(() => {
    function refresh() {
      setEntries(getPlatformHistory().slice(0, limit));
    }
    refresh();
    window.addEventListener("platform-history-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("platform-history-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [limit]);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-border bg-white p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Clock className="h-4 w-4 text-slate-400" />
          Recent Activity
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Your freight and Intrastat calculations will appear here. No login required — stored locally in your browser.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            clearPlatformHistory();
            setEntries([]);
            window.dispatchEvent(new Event("platform-history-updated"));
          }}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
      <ul className="divide-y divide-surface-border">
        {entries.map((entry) => {
          const Icon = toolIcons[entry.tool];
          return (
            <li key={entry.id}>
              <Link
                href={entry.href}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-muted/40"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    toolColors[entry.tool]
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{entry.route}</p>
                  <p className="text-xs text-slate-500">{entry.summary}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-surface-border px-5 py-3">
        <Link
          href="/platform/freight"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          Run another calculation
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
