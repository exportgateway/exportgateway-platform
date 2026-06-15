"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { filterBusinessFindings } from "@/lib/export-auditor/broker-findings-filter";
import { countIssuesBySeverity } from "@/lib/export-auditor/readiness-score";
import {
  ExecutiveSummaryCard,
} from "@/components/export-auditor/ExecutiveSummaryCard";
import { DualScoreCards } from "@/components/export-auditor/DualScoreCards";
import {
  ExportAuditorTabs,
  getVisibleAuditorTabs,
  isAuditorTabVisible,
  type AuditorResultTab,
} from "@/components/export-auditor/ExportAuditorTabs";
import { AUDITOR_TAB_CONTENT } from "@/components/export-auditor/auditor-ui";
import { ShipmentSummarySection } from "@/components/export-auditor/results/ShipmentSummarySection";
import { DeliveryAddressSection } from "@/components/export-auditor/results/DeliveryAddressSection";
import { PreferenceOriginSection } from "@/components/export-auditor/results/PreferenceOriginSection";
import { SupportingDocumentsSection } from "@/components/export-auditor/results/SupportingDocumentsSection";
import { RecommendedActionsSection } from "@/components/export-auditor/results/RecommendedActionsSection";
import { CustomsDispositionSection } from "@/components/export-auditor/results/CustomsDispositionSection";
import { HsCodesSection, ExportReportSection } from "@/components/export-auditor/results/HsCodesSection";
import { EnterpriseAggregationSections } from "@/components/export-auditor/results/EnterpriseAggregationSections";
import { HsAggregationReportSections } from "@/components/export-auditor/results/HsAggregationTraceabilityTable";
import {
  OcrObservabilitySection,
} from "@/components/export-auditor/results/OcrObservabilitySection";
import { DataRecoveryDiagnosticsSection } from "@/components/export-auditor/results/DataRecoveryDiagnosticsSection";
import { DeclarationReadinessSection } from "@/components/export-auditor/results/DeclarationReadinessSection";
import { CustomsReadinessSection } from "@/components/export-auditor/results/CustomsReadinessSection";
import { HsVerificationSection } from "@/components/export-auditor/results/HsVerificationSection";
import { ConfidenceScoreSection } from "@/components/export-auditor/results/ConfidenceScoreSection";
import { ExportValidationPdfButton } from "@/components/export-auditor/ExportValidationPdfButton";
import { ExportAuditorQuickActions } from "@/components/export-auditor/ExportAuditorQuickActions";
import { DeclarationExportActions } from "@/components/export-auditor/results/DeclarationExportActions";
import { HsOriginSummarySection } from "@/components/export-auditor/results/HsOriginSummarySection";
import { DocumentSummarySection } from "@/components/export-auditor/results/DocumentSummarySection";
import { BrokerFindingsSection } from "@/components/export-auditor/results/BrokerFindingsSection";
import { PlanFeatureGate, usePlanAccess } from "@/components/plan-simulator/PlanProvider";
import { FEATURE_FLAGS } from "@/config/feature-flags";

interface ExportAuditorResultsDashboardProps {
  report: ExportAuditReport;
}

export function ExportAuditorResultsDashboard({ report }: ExportAuditorResultsDashboardProps) {
  const { hasFeature, effectivePlan } = usePlanAccess();
  const visibleTabs = useMemo(() => getVisibleAuditorTabs(hasFeature), [hasFeature]);
  const [tab, setTab] = useState<AuditorResultTab>(() => visibleTabs[0] ?? "summary");

  useEffect(() => {
    if (!isAuditorTabVisible(tab, hasFeature)) {
      setTab(visibleTabs[0] ?? "summary");
    }
  }, [tab, hasFeature, visibleTabs]);

  const businessIssues = useMemo(() => filterBusinessFindings(report.issues), [report.issues]);
  const issueCounts = countIssuesBySeverity(businessIssues);
  const totalIssues =
    issueCounts.critical + issueCounts.warning + issueCounts.information;

  const showExportToolbar =
    hasFeature("exportDeclarationExcel") ||
    hasFeature("exportDeclarationCsv") ||
    hasFeature("exportMrnDraft");

  const exportFirst = effectivePlan === "ENTERPRISE" || effectivePlan === "ADMIN";

  const showExtractionDiagnostics =
    FEATURE_FLAGS.extractionTraceLogs && hasFeature("extractionSources");

  const exportToolbar = showExportToolbar ? (
    <DeclarationExportActions auditReport={report} variant="toolbar" />
  ) : null;

  return (
    <div className="space-y-4" data-screenshot="export-auditor-result">
      <PlanFeatureGate feature="validationPdf">
        <div className="flex justify-end">
          <ExportValidationPdfButton report={report} />
        </div>
      </PlanFeatureGate>

      {exportFirst && exportToolbar}

      <PlanFeatureGate feature="executiveSummary">
        <ExecutiveSummaryCard report={report} />
        <DualScoreCards report={report} />
      </PlanFeatureGate>

      {!exportFirst && exportToolbar}

      <div className="rounded-2xl border border-surface-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-2 sm:px-4">
          <ExportAuditorTabs
            active={tab}
            onChange={setTab}
            issueCount={totalIssues + report.missingFields.length}
          />
        </div>

        <div className={AUDITOR_TAB_CONTENT}>
          {tab === "summary" && isAuditorTabVisible("summary", hasFeature) && (
            <>
              <PlanFeatureGate feature="customsReadiness">
                <CustomsReadinessSection
                  readiness={report.customsReadiness}
                  score={report.customsReadinessScore}
                />
              </PlanFeatureGate>

              <PlanFeatureGate feature="declarationPreparation">
                <EnterpriseAggregationSections auditReport={report} hideExportActions />
              </PlanFeatureGate>

              <PlanFeatureGate feature="hsOriginSummary">
                <HsOriginSummarySection report={report} />
              </PlanFeatureGate>

              <PlanFeatureGate feature="findings">
                <BrokerFindingsSection
                  issues={report.issues}
                  missingFields={report.missingFields}
                />
                <RecommendedActionsSection actions={report.recommendedActions} />
              </PlanFeatureGate>

              <PlanFeatureGate feature="documentSummary">
                <DocumentSummarySection report={report} compact />
              </PlanFeatureGate>
            </>
          )}

          {tab === "declaration" && isAuditorTabVisible("declaration", hasFeature) && (
            <>
              <PlanFeatureGate feature="declarationReadiness">
                <DeclarationReadinessSection readiness={report.declarationReadiness} />
              </PlanFeatureGate>
              <PlanFeatureGate feature="declarationPreparation">
                <EnterpriseAggregationSections auditReport={report} hideExportActions />
              </PlanFeatureGate>
              <PlanFeatureGate feature="exportDeclarationExcel">
                <DeclarationExportActions auditReport={report} variant="inline" />
              </PlanFeatureGate>
            </>
          )}

          {tab === "origin" && isAuditorTabVisible("origin", hasFeature) && (
            <>
              <PlanFeatureGate feature="originAnalysis">
                <PreferenceOriginSection analysis={report.preferenceOrigin} />
                <HsCodesSection codes={report.hsCodesDetected} />
              </PlanFeatureGate>
              <PlanFeatureGate feature="hsVerification">
                <HsVerificationSection summary={report.hsVerificationSummary} />
              </PlanFeatureGate>
            </>
          )}

          {tab === "document" && isAuditorTabVisible("document", hasFeature) && (
            <>
              <PlanFeatureGate feature="documentSummary">
                <DocumentSummarySection report={report} compact={false} />
                <DeliveryAddressSection address={report.deliveryAddress} />
                <SupportingDocumentsSection documents={report.supportingDocumentsDetected} />
                <CustomsDispositionSection disposition={report.customsDisposition} />
              </PlanFeatureGate>
              <PlanFeatureGate feature="auditReportPdf">
                <ExportReportSection report={report} />
              </PlanFeatureGate>
            </>
          )}

          {tab === "forensic" && isAuditorTabVisible("forensic", hasFeature) && (
            <>
              <PlanFeatureGate feature="confidenceEngine">
                <ConfidenceScoreSection
                  scores={report.confidence}
                  dataExtractionCompleteness={
                    report.ocrObservability?.dataExtractionCompleteness ??
                    report.ocrObservability?.ocrQualityScore
                  }
                  customsReadiness={report.customsReadiness}
                />
              </PlanFeatureGate>
              <PlanFeatureGate feature="hsVerification">
                <HsVerificationSection summary={report.hsVerificationSummary} />
              </PlanFeatureGate>
              <PlanFeatureGate feature="ocrDiagnostics">
                <OcrObservabilitySection auditReport={report} />
              </PlanFeatureGate>
              <PlanFeatureGate feature="recoveryDiagnostics">
                <DataRecoveryDiagnosticsSection auditReport={report} />
              </PlanFeatureGate>
              <PlanFeatureGate feature="hsAggregationTraceability">
                <HsAggregationReportSections
                  report={report.hsAggregationReport}
                  currency={report.invoiceSummary.currency}
                />
              </PlanFeatureGate>
              <PlanFeatureGate feature="integrityValidation">
                <BrokerFindingsSection
                  issues={report.issues}
                  missingFields={report.missingFields}
                  showTechnical
                />
              </PlanFeatureGate>
              <ShipmentSummarySection
                summary={report.shipmentSummary}
                extractionDiagnostics={
                  showExtractionDiagnostics ? report.shipmentExtractionDiagnostics : undefined
                }
              />
            </>
          )}
        </div>
      </div>

      <PlanFeatureGate feature="quickActions">
        <ExportAuditorQuickActions />
      </PlanFeatureGate>
    </div>
  );
}
