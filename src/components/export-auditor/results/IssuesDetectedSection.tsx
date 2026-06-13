import type { AuditIssue } from "@/lib/export-auditor/types";
import { countIssuesBySeverity } from "@/lib/export-auditor/readiness-score";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

interface IssuesDetectedSectionProps {
  issues: AuditIssue[];
  missingFields?: string[];
  showMissingFields?: boolean;
}

const severityConfig = {
  error: {
    icon: AlertCircle,
    label: "Critical",
    badgeClass: "bg-red-100 text-red-800",
    panelClass: "border-red-200 bg-red-50 text-red-900",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    badgeClass: "bg-amber-100 text-amber-800",
    panelClass: "border-amber-200 bg-amber-50 text-amber-900",
  },
  info: {
    icon: Info,
    label: "Information",
    badgeClass: "bg-blue-100 text-blue-800",
    panelClass: "border-blue-200 bg-blue-50 text-blue-900",
  },
} as const;

export function IssuesDetectedSection({
  issues,
  missingFields = [],
  showMissingFields = true,
}: IssuesDetectedSectionProps) {
  const counts = countIssuesBySeverity(issues);

  const grouped = {
    error: issues.filter((i) => i.type === "error"),
    warning: issues.filter((i) => i.type === "warning"),
    info: issues.filter((i) => i.type === "info"),
  };

  const order = ["error", "warning", "info"] as const;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {counts.critical > 0 && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${severityConfig.error.badgeClass}`}>
            Critical ({counts.critical})
          </span>
        )}
        {counts.warning > 0 && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${severityConfig.warning.badgeClass}`}>
            Warnings ({counts.warning})
          </span>
        )}
        {counts.information > 0 && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${severityConfig.info.badgeClass}`}>
            Information ({counts.information})
          </span>
        )}
        {missingFields.length > 0 && showMissingFields && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            Missing fields ({missingFields.length})
          </span>
        )}
      </div>

      {order.map((type) => {
        const items = grouped[type];
        if (items.length === 0) return null;
        const cfg = severityConfig[type];
        const Icon = cfg.icon;
        return (
          <div key={type} className={`rounded-xl border p-4 ${cfg.panelClass}`}>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <Icon className="h-4 w-4" aria-hidden />
              {cfg.label} ({items.length})
            </p>
            <ul className="mt-3 space-y-2">
              {items.map((issue) => (
                <li key={issue.id} className="text-sm leading-relaxed">
                  {issue.message}
                  {issue.field && (
                    <span className="mt-0.5 block text-xs opacity-70">Field: {issue.field}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {showMissingFields && missingFields.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Missing fields ({missingFields.length})
          </p>
          <ul className="mt-3 space-y-1.5">
            {missingFields.map((field) => (
              <li key={field} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
                {field}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
