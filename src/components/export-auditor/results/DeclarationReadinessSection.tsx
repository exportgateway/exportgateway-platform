"use client";

import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, ClipboardList } from "lucide-react";

interface DeclarationReadinessSectionProps {
  readiness: ExportAuditReport["declarationReadiness"];
}

export function DeclarationReadinessSection({ readiness }: DeclarationReadinessSectionProps) {
  if (!readiness) {
    return null;
  }

  const ready = readiness.ready;
  const StatusIcon = ready ? CheckCircle2 : ClipboardList;

  return (
    <section
      className={cn(
        "rounded-xl border p-5",
        ready ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"
      )}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Declaration Readiness Check
      </h3>
      <div className="mt-3 flex items-start gap-3">
        <StatusIcon
          className={cn("mt-0.5 h-5 w-5 shrink-0", ready ? "text-emerald-600" : "text-amber-600")}
          aria-hidden
        />
        <div>
          <p className="text-sm font-bold text-slate-900">{readiness.status}</p>
          {!ready && readiness.missingFields.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {readiness.missingFields.map((field) => (
                <li key={`${field.box}-${field.fieldKey}`}>
                  Box {field.box}: {field.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
