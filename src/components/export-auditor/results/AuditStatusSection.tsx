import type { AuditStatusLevel } from "@/lib/export-auditor/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface AuditStatusSectionProps {
  auditStatus: AuditStatusLevel;
  exportStatus: string;
}

const statusConfig: Record<
  AuditStatusLevel,
  { label: string; description: string; icon: typeof CheckCircle2; className: string }
> = {
  READY: {
    label: "Ready",
    description: "Document meets export readiness requirements.",
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  WARNING: {
    label: "Ready With Review",
    description: "Review recommended before export declaration.",
    icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  ERROR: {
    label: "Needs Review",
    description: "Blocking issues must be resolved before export.",
    icon: XCircle,
    className: "border-red-200 bg-red-50 text-red-900",
  },
};

export function AuditStatusSection({ auditStatus, exportStatus }: AuditStatusSectionProps) {
  const config = statusConfig[auditStatus];
  const Icon = config.icon;

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        Audit Status
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["READY", "WARNING", "ERROR"] as AuditStatusLevel[]).map((level) => {
          const cfg = statusConfig[level];
          const CfgIcon = cfg.icon;
          const isActive = level === auditStatus;
          return (
            <div
              key={level}
              className={cn(
                "rounded-xl border p-4 transition-opacity",
                cfg.className,
                isActive ? "opacity-100 ring-2 ring-offset-1 ring-current" : "opacity-40"
              )}
            >
              <div className="flex items-center gap-2">
                <CfgIcon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-sm font-bold tracking-wide">{cfg.label}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed opacity-90">{cfg.description}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon
          className={cn(
            "h-4 w-4",
            auditStatus === "READY" && "text-emerald-600",
            auditStatus === "WARNING" && "text-amber-600",
            auditStatus === "ERROR" && "text-red-600"
          )}
        />
        Current result: {exportStatus}
      </p>
    </section>
  );
}
