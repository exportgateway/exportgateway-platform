"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeclarationDescriptionEngineHealth, DescriptionSourceCounts } from "@/lib/export-auditor/declaration-description-health";
import {
  countDescriptionSources,
  emptyDescriptionSourceCounts,
} from "@/lib/export-auditor/declaration-description-health";
import { fetchDeclarationDescriptions } from "@/lib/export-auditor/declaration-description-client";
import type { DeclarationLanguage, ExportAuditReport } from "@/lib/export-auditor/types";
import { cn } from "@/lib/utils";

interface AiDescriptionHealthSectionProps {
  auditReport: ExportAuditReport;
  exportLanguage: DeclarationLanguage;
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "fallback" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tone === "active" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "fallback" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {label}
    </span>
  );
}

function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function AiDescriptionHealthSection({
  auditReport,
  exportLanguage,
}: AiDescriptionHealthSectionProps) {
  const [health, setHealth] = useState<DeclarationDescriptionEngineHealth | null>(null);
  const [sourceCounts, setSourceCounts] = useState<DescriptionSourceCounts>(
    emptyDescriptionSourceCounts()
  );
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const traceabilityLines = auditReport.hsAggregationReport?.traceabilityLines ?? [];
  const traceabilityLineCount = traceabilityLines.length;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/export-auditor/declaration-description-health")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Health check failed (${response.status})`);
        }
        return response.json() as Promise<DeclarationDescriptionEngineHealth>;
      })
      .then((payload) => {
        if (!cancelled) setHealth(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setHealth({
            provider: "Rule Based",
            status: "Fallback",
            cacheEnabled: false,
            openaiConfigured: false,
            model: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (traceabilityLines.length === 0) {
      setSourceCounts(emptyDescriptionSourceCounts());
      setSourceError(null);
      return;
    }

    let cancelled = false;
    setLoadingSources(true);
    setSourceError(null);

    const items = traceabilityLines.map((line) => ({
      original: line.description,
      hsCode: line.hsCode,
    }));

    fetchDeclarationDescriptions(items, [exportLanguage])
      .then((results) => {
        if (cancelled) return;
        setSourceCounts(countDescriptionSources(results.map((result) => result.source)));
      })
      .catch((error) => {
        if (cancelled) return;
        setSourceCounts(emptyDescriptionSourceCounts());
        setSourceError(error instanceof Error ? error.message : "Could not load description sources");
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auditReport.documentId, exportLanguage, traceabilityLineCount]);

  const configuredButRuleBased = useMemo(() => {
    if (!health?.openaiConfigured || loadingSources || sourceCounts.total === 0) {
      return false;
    }
    return (
      sourceCounts.aiGenerated === 0 &&
      sourceCounts.ruleBased > 0 &&
      sourceCounts.hsLibrary === 0 &&
      sourceCounts.userApproved === 0
    );
  }, [health?.openaiConfigured, loadingSources, sourceCounts]);

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        AI Description Engine
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Server-side diagnostics for declaration description generation — no Vercel dashboard required.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Provider
          </dt>
          <dd className="mt-1">
            {health ? (
              <StatusBadge
                label={health.provider}
                tone={health.provider === "OpenAI" ? "active" : "fallback"}
              />
            ) : (
              <span className="text-sm font-semibold text-slate-900">…</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Status
          </dt>
          <dd className="mt-1">
            {health ? (
              <StatusBadge
                label={health.status}
                tone={health.status === "Active" ? "active" : "fallback"}
              />
            ) : (
              <span className="text-sm font-semibold text-slate-900">…</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Cache
          </dt>
          <dd className="mt-1">
            {health ? (
              <StatusBadge
                label={health.cacheEnabled ? "Enabled" : "Disabled"}
                tone={health.cacheEnabled ? "active" : "fallback"}
              />
            ) : (
              <span className="text-sm font-semibold text-slate-900">…</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            OpenAI Configured
          </dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">
            {health ? formatYesNo(health.openaiConfigured) : "…"}
          </dd>
        </div>
      </dl>

      {health?.model && (
        <p className="mt-3 text-xs text-slate-500">Model: {health.model}</p>
      )}

      <div className="mt-4 border-t border-surface-border/60 pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Description Sources
          {loadingSources && (
            <span className="ml-2 font-normal normal-case text-slate-400">(loading…)</span>
          )}
        </h4>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "AI Generated", value: sourceCounts.aiGenerated },
            { label: "HS Library", value: sourceCounts.hsLibrary },
            { label: "User Approved", value: sourceCounts.userApproved },
            { label: "Rule Based", value: sourceCounts.ruleBased },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                {traceabilityLineCount === 0 ? "—" : row.value}
              </dd>
            </div>
          ))}
        </dl>
        {sourceError && (
          <p className="mt-2 text-xs text-red-600">{sourceError}</p>
        )}
        {configuredButRuleBased && (
          <p className="mt-2 text-xs text-amber-700">
            OpenAI is configured but all lines resolved as rule-based — verify API key, quota, or
            network access on the server.
          </p>
        )}
      </div>
    </section>
  );
}
