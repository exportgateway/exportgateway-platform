"use client";

import type { ExportAuditReport } from "@/lib/export-auditor/types";
import {
  calculateExtractionAccuracyScore,
  calculateExportReadinessScore,
  getReadinessVerdict,
  getTopCustomsReadinessReasons,
  shouldShowReadinessReasons,
} from "@/lib/export-auditor/readiness-score";
import { AUDITOR_RESULT_BANNER } from "@/components/export-auditor/auditor-ui";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ScanLine } from "lucide-react";

function ScoreRing({
  score,
  label,
  sublabel,
  tone,
}: {
  score: number;
  label: string;
  sublabel: string;
  tone: "emerald" | "amber" | "red" | "blue";
}) {
  const barColor =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "blue"
        ? "bg-blue-500"
        : tone === "amber"
          ? "bg-amber-500"
          : "bg-red-500";

  const borderColor =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/40"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50/40"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50/40"
          : "border-red-200 bg-red-50/40";

  return (
    <div className={cn("rounded-xl border p-4", borderColor)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <p className="text-4xl font-extrabold tabular-nums tracking-tight text-slate-900">
          {score}
          <span className="text-lg font-semibold text-slate-400"> / 100</span>
        </p>
        <div className="h-2.5 flex-1 min-w-[100px] max-w-[180px] overflow-hidden rounded-full bg-slate-200">
          <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${score}%` }} />
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">{sublabel}</p>
    </div>
  );
}

function toneForScore(score: number, kind: "extraction" | "customs"): "emerald" | "amber" | "red" | "blue" {
  if (kind === "extraction") {
    if (score >= 90) return "blue";
    if (score >= 75) return "emerald";
    if (score >= 55) return "amber";
    return "red";
  }
  if (score >= 85) return "emerald";
  if (score >= 70) return "amber";
  return "red";
}

interface DualScoreCardsProps {
  report: ExportAuditReport;
}

/** Side-by-side Extraction Accuracy and Customs Readiness — never combined. */
export function DualScoreCards({ report }: DualScoreCardsProps) {
  const extractionScore = calculateExtractionAccuracyScore(report);
  const customsScore = calculateExportReadinessScore(report);
  const verdict = getReadinessVerdict(report, customsScore);
  const StatusIcon = verdict.isReady ? CheckCircle2 : AlertTriangle;
  const showReasons = shouldShowReadinessReasons(report);
  const topReasons = showReasons ? getTopCustomsReadinessReasons(report, 3) : [];

  const extraction = report.extractionAccuracy;
  const customs = report.customsReadinessScore;

  return (
    <section className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <ScoreRing
          score={extractionScore}
          label="Extraction Accuracy"
          sublabel={extraction?.label ?? "Extraction quality"}
          tone={toneForScore(extractionScore, "extraction")}
        />
        <ScoreRing
          score={customsScore}
          label="Customs Readiness"
          sublabel={customs?.label ?? verdict.statusLabel}
          tone={toneForScore(customsScore, "customs")}
        />
      </div>

      {showReasons && topReasons.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
            Top reasons — {verdict.exportStatus}
          </p>
          <ol className="mt-2 space-y-1.5">
            {topReasons.map((reason, index) => (
              <li key={`${index}-${reason}`} className="flex gap-2 text-sm text-amber-950">
                <span className="font-bold tabular-nums text-amber-700">{index + 1}.</span>
                <span>{reason}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className={cn(AUDITOR_RESULT_BANNER, "border-surface-border bg-white flex items-start gap-3")}>
        <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">Extraction Accuracy ({extractionScore}/100)</span>
          {" — "}
          {extraction?.message ?? "Measures OCR, line, HS, COO, value, and preferential origin extraction."}
        </p>
      </div>

      <div
        className={cn(
          AUDITOR_RESULT_BANNER,
          "flex items-start gap-3",
          verdict.isReady ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"
        )}
      >
        <StatusIcon
          className={cn("mt-0.5 h-5 w-5 shrink-0", verdict.isReady ? "text-emerald-600" : "text-amber-600")}
          aria-hidden
        />
        <div>
          <p className="text-sm text-slate-700 leading-relaxed">
            <span className="font-semibold text-slate-900">Customs Readiness ({customsScore}/100)</span>
            {" — "}
            {customs?.message ?? verdict.statusMessage}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Export status: {verdict.exportStatus}
          </p>
        </div>
      </div>
    </section>
  );
}

/** @deprecated Use DualScoreCards — kept as alias for existing imports. */
export function ExportReadinessScoreCard({ report }: DualScoreCardsProps) {
  return <DualScoreCards report={report} />;
}
