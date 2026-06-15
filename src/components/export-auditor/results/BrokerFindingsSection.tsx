import type { AuditIssue } from "@/lib/export-auditor/types";
import { filterBusinessFindings } from "@/lib/export-auditor/broker-findings-filter";
import { IssuesDetectedSection } from "@/components/export-auditor/results/IssuesDetectedSection";

interface BrokerFindingsSectionProps {
  issues: AuditIssue[];
  missingFields?: string[];
  /** When true, show all issues including technical (Forensic tab). */
  showTechnical?: boolean;
}

/** Business findings panel — filters pipeline/forensic noise from broker view. */
export function BrokerFindingsSection({
  issues,
  missingFields = [],
  showTechnical = false,
}: BrokerFindingsSectionProps) {
  const visibleIssues = showTechnical ? issues : filterBusinessFindings(issues);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Findings
      </h3>
      <IssuesDetectedSection issues={visibleIssues} missingFields={missingFields} />
    </section>
  );
}
