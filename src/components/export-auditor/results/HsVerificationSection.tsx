"use client";

import type { HsVerificationSummary } from "@/lib/export-auditor/types";
import { formatHsVerificationStatusLabel } from "@/lib/export-auditor/hs-verification-engine";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, HelpCircle, Sparkles } from "lucide-react";

interface HsVerificationSectionProps {
  summary: HsVerificationSummary | undefined;
}

function statusStyles(status: string): string {
  switch (status) {
    case "VERIFIED":
      return "border-emerald-200 bg-emerald-50/50 text-emerald-800";
    case "REVIEW_REQUIRED":
      return "border-amber-300 bg-amber-50/60 text-amber-900";
    case "REVIEW_REQUIRED_LOW_CONFIDENCE":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "GENERATED":
      return "border-blue-200 bg-blue-50/50 text-blue-800";
    case "MISSING":
      return "border-slate-200 bg-slate-50 text-slate-600";
    default:
      return "border-surface-border bg-white text-slate-700";
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "VERIFIED":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
    case "REVIEW_REQUIRED":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />;
    case "GENERATED":
      return <Sparkles className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />;
    default:
      return <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />;
  }
}

function formatHs(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

function formatConfidence(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export function HsVerificationSection({ summary }: HsVerificationSectionProps) {
  if (!summary || summary.lineResults.length === 0) {
    return (
      <section className="rounded-xl border border-surface-border bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          HS Verification
        </h3>
        <p className="mt-3 text-sm text-slate-500">
          No goods lines available for HS verification.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          HS Verification
        </h3>
        <p className="text-xs text-slate-500">
          Compares invoice HS against Export Compliance Wizard — never auto-replaces invoice codes.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left">
              {[
                "Position",
                "Invoice HS",
                "Wizard HS",
                "Status",
                "Confidence",
                "Reason",
              ].map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.lineResults.map((line) => (
              <tr key={line.positionNumber} className="border-b border-surface-border/60 last:border-0">
                <td className="px-3 py-2.5 font-semibold tabular-nums">{line.positionNumber}</td>
                <td className="px-3 py-2.5 tabular-nums">{formatHs(line.invoiceHsCode)}</td>
                <td className="px-3 py-2.5 tabular-nums">{formatHs(line.wizardHsCode)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                      statusStyles(line.verificationStatus)
                    )}
                  >
                    <StatusIcon status={line.verificationStatus} />
                    {formatHsVerificationStatusLabel(line.verificationStatus)}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{formatConfidence(line.wizardConfidence)}</td>
                <td className="px-3 py-2.5 text-slate-600">{line.verificationReason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
