"use client";

import { useState } from "react";
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { countIssuesBySeverity, getReadinessVerdict } from "@/lib/export-auditor/readiness-score";
import {
  ExecutiveSummaryCard,
  ExportReadinessScoreCard,
} from "@/components/export-auditor/ExecutiveSummaryCard";
import { ExportAuditorQuickActions } from "@/components/export-auditor/ExportAuditorQuickActions";
import {
  ExportAuditorTabs,
  type AuditorResultTab,
} from "@/components/export-auditor/ExportAuditorTabs";
import { ProcessingTimeline, buildProcessingTimeline } from "@/components/export-auditor/ProcessingTimeline";
import { InvoiceSummarySection } from "@/components/export-auditor/results/InvoiceSummarySection";
import { ShipmentSummarySection } from "@/components/export-auditor/results/ShipmentSummarySection";
import { DeliveryAddressSection } from "@/components/export-auditor/results/DeliveryAddressSection";
import { AuditStatusSection } from "@/components/export-auditor/results/AuditStatusSection";
import { ConfidenceScoreSection } from "@/components/export-auditor/results/ConfidenceScoreSection";
import { PreferenceOriginSection } from "@/components/export-auditor/results/PreferenceOriginSection";
import { IssuesDetectedSection } from "@/components/export-auditor/results/IssuesDetectedSection";
import { SupportingDocumentsSection } from "@/components/export-auditor/results/SupportingDocumentsSection";
import { RecommendedActionsSection } from "@/components/export-auditor/results/RecommendedActionsSection";
import { CustomsDispositionSection } from "@/components/export-auditor/results/CustomsDispositionSection";
import { HsCodesSection, ExportReportSection } from "@/components/export-auditor/results/HsCodesSection";
import { EnterpriseAggregationSections } from "@/components/export-auditor/results/EnterpriseAggregationSections";
import { HsAggregationReportSections } from "@/components/export-auditor/results/HsAggregationTraceabilityTable";
import {
  OcrObservabilitySection,
  OcrObservabilitySummary,
} from "@/components/export-auditor/results/OcrObservabilitySection";
import {
  DataRecoveryDiagnosticsSection,
  DataRecoverySummary,
} from "@/components/export-auditor/results/DataRecoveryDiagnosticsSection";
import { DeclarationReadinessSection } from "@/components/export-auditor/results/DeclarationReadinessSection";
import { CustomsReadinessSection } from "@/components/export-auditor/results/CustomsReadinessSection";
import { HsVerificationSection } from "@/components/export-auditor/results/HsVerificationSection";
import { ExportValidationPdfButton } from "@/components/export-auditor/ExportValidationPdfButton";
import { AdminOnly } from "@/components/admin/AdminOnly";
import { FEATURE_FLAGS } from "@/config/feature-flags";

interface ExportAuditorResultsDashboardProps {
  report: ExportAuditReport;
}

export function ExportAuditorResultsDashboard({ report }: ExportAuditorResultsDashboardProps) {
  const [tab, setTab] = useState<AuditorResultTab>("overview");
  const issueCounts = countIssuesBySeverity(report.issues);
  const verdict = getReadinessVerdict(report);
  const totalIssues =
    issueCounts.critical + issueCounts.warning + issueCounts.information;

  const showExtractionDiagnostics = FEATURE_FLAGS.extractionTraceLogs;

  return (
    <div className="space-y-5" data-screenshot="export-auditor-result">
      <AdminOnly flag="validationPdfExport">
        <div className="flex justify-end">
          <ExportValidationPdfButton report={report} />
        </div>
      </AdminOnly>
      <ExecutiveSummaryCard report={report} />
      <ExportReadinessScoreCard report={report} />
      <ExportAuditorQuickActions />
      <ProcessingTimeline steps={buildProcessingTimeline("complete")} compact />

      <div className="rounded-2xl border border-surface-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-2 sm:px-5">
          <ExportAuditorTabs
            active={tab}
            onChange={setTab}
            issueCount={totalIssues + report.missingFields.length}
          />
        </div>

        <div className="p-4 sm:p-5 space-y-6">
          {tab === "overview" && (
            <>
              <InvoiceSummarySection summary={report.invoiceSummary} />
              <ShipmentSummarySection
                summary={report.shipmentSummary}
                extractionDiagnostics={
                  showExtractionDiagnostics ? report.shipmentExtractionDiagnostics : undefined
                }
              />
              <DeliveryAddressSection address={report.deliveryAddress} />
              <AuditStatusSection
                auditStatus={verdict.auditStatus}
                exportStatus={verdict.exportStatus}
              />
              <AdminOnly flag="ocrDebugPanels">
                <ConfidenceScoreSection
                  scores={report.confidence}
                  dataExtractionCompleteness={
                    report.ocrObservability?.dataExtractionCompleteness ??
                    report.ocrObservability?.ocrQualityScore
                  }
                  customsReadiness={report.customsReadiness}
                />
              </AdminOnly>
              {!FEATURE_FLAGS.ocrDebugPanels && (
                <CustomsReadinessSection readiness={report.customsReadiness} />
              )}
              <DeclarationReadinessSection readiness={report.declarationReadiness} />
              <AdminOnly flag="ocrDebugPanels">
                <OcrObservabilitySummary observability={report.ocrObservability} />
              </AdminOnly>
              <AdminOnly flag="forensicDiagnostics">
                <DataRecoverySummary auditReport={report} />
              </AdminOnly>
              <PreferenceOriginSection analysis={report.preferenceOrigin} />
              <SupportingDocumentsSection documents={report.supportingDocumentsDetected} />
              <HsCodesSection codes={report.hsCodesDetected} />
              <CustomsDispositionSection disposition={report.customsDisposition} />
            </>
          )}

          {tab === "issues" && (
            <>
              <SupportingDocumentsSection documents={report.supportingDocumentsDetected} />
              <IssuesDetectedSection
                issues={report.issues}
                missingFields={report.missingFields}
              />
              <RecommendedActionsSection actions={report.recommendedActions} />
            </>
          )}

          {tab === "classification" && (
            <>
              <HsCodesSection codes={report.hsCodesDetected} />
              <HsVerificationSection summary={report.hsVerificationSummary} />
              <PreferenceOriginSection analysis={report.preferenceOrigin} />
            </>
          )}

          {tab === "enterprise" && (
            <>
              <DeclarationReadinessSection readiness={report.declarationReadiness} />
              <HsVerificationSection summary={report.hsVerificationSummary} />
              <AdminOnly flag="ocrDebugPanels">
                <OcrObservabilitySection auditReport={report} />
              </AdminOnly>
              <AdminOnly flag="forensicDiagnostics">
                <DataRecoveryDiagnosticsSection auditReport={report} />
              </AdminOnly>
              <HsAggregationReportSections
                report={report.hsAggregationReport}
                currency={report.invoiceSummary.currency}
              />
              <EnterpriseAggregationSections auditReport={report} />
            </>
          )}

          {tab === "report" && (
            <>
              <ShipmentSummarySection
                summary={report.shipmentSummary}
                extractionDiagnostics={
                  showExtractionDiagnostics ? report.shipmentExtractionDiagnostics : undefined
                }
              />
              <DeliveryAddressSection address={report.deliveryAddress} />
              <CustomsDispositionSection disposition={report.customsDisposition} />
              <ExportReportSection report={report} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
