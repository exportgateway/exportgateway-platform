"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Info } from "lucide-react";
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import type { DeclarationLanguage } from "@/lib/export-auditor/types";
import { prepareReportForDeclarationExport } from "@/lib/export-auditor/declaration-description-client";
import {
  DECLARATION_LANGUAGE_LABELS,
  DECLARATION_LANGUAGES,
  getExportLanguage,
  setExportLanguageOverride,
} from "@/lib/export-auditor/declaration-language-prefs";
import {
  downloadMrnCsv,
  downloadMrnExcel,
  isMrnExportReady,
} from "@/lib/export-auditor/mrn-export";
import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";
import { Button } from "@/components/ui/Button";

const EXPORT_DESCRIPTION_TOOLTIP =
  "Product descriptions are exported to assist customs declaration preparation. Always verify the final declaration wording before filing.";

interface DeclarationExportActionsProps {
  auditReport: ExportAuditReport;
  variant?: "toolbar" | "inline";
}

export function DeclarationExportActions({
  auditReport,
  variant = "toolbar",
}: DeclarationExportActionsProps) {
  const { hasFeature } = usePlanAccess();
  const exportReady = isMrnExportReady(auditReport);
  const lineCount = auditReport.hsAggregationReport?.traceabilityLines?.length ?? 0;
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "mrn" | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [exportLanguage, setExportLanguage] = useState<DeclarationLanguage>("en");

  const showExcel = hasFeature("exportDeclarationExcel");
  const showCsv = hasFeature("exportDeclarationCsv");
  const showMrn = hasFeature("exportMrnDraft");
  const hasAnyExport = exportReady && (showExcel || showCsv || showMrn);

  useEffect(() => {
    setExportLanguage(getExportLanguage());
  }, []);

  if (!hasAnyExport) return null;

  const runExport = async (format: "csv" | "xlsx" | "mrn") => {
    setExporting(format);
    setExportProgress("Preparing declaration export...");
    try {
      if (lineCount >= 500) {
        setExportProgress("Preparing declaration export... (large invoice, 500+ lines)");
      } else if (lineCount >= 100) {
        setExportProgress("Preparing declaration export... (100+ lines)");
      } else if (lineCount >= 50) {
        setExportProgress("Preparing declaration export... (50+ lines)");
      }
      const enriched = await prepareReportForDeclarationExport(auditReport, exportLanguage);
      setExportProgress(
        format === "csv"
          ? "Generating CSV export..."
          : format === "mrn"
            ? "Generating MRN draft..."
            : "Generating Excel export..."
      );
      const options = { language: exportLanguage };
      if (format === "csv") {
        await downloadMrnCsv(enriched, options);
      } else {
        await downloadMrnExcel(enriched, options);
      }
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  const handleExportLanguageChange = (language: DeclarationLanguage) => {
    setExportLanguage(language);
    setExportLanguageOverride(language);
  };

  const isToolbar = variant === "toolbar";

  return (
    <section
      className={
        isToolbar
          ? "rounded-xl border border-brand-200 bg-brand-50/50 p-4"
          : "rounded-xl border border-surface-border bg-white p-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Declaration Export
          </h3>
          {isToolbar && (
            <p className="mt-1 text-sm text-slate-600">
              Export declaration data for customs filing preparation.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <span className="font-medium">Language</span>
            <select
              value={exportLanguage}
              onChange={(event) =>
                handleExportLanguageChange(event.target.value as DeclarationLanguage)
              }
              disabled={exporting !== null}
              className="rounded-md border border-surface-border bg-white px-2 py-1 text-xs font-medium text-slate-800"
              aria-label="Export language for declaration descriptions"
            >
              {DECLARATION_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {DECLARATION_LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          {showExcel && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={exporting !== null}
              onClick={() => runExport("xlsx")}
              className="inline-flex items-center gap-2"
              title={EXPORT_DESCRIPTION_TOOLTIP}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              {exporting === "xlsx" ? "Exporting…" : "Export Declaration Excel"}
            </Button>
          )}
          {showCsv && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={exporting !== null}
              onClick={() => runExport("csv")}
              className="inline-flex items-center gap-2"
              title={EXPORT_DESCRIPTION_TOOLTIP}
            >
              <Download className="h-4 w-4" aria-hidden />
              {exporting === "csv" ? "Exporting…" : "Export Declaration CSV"}
            </Button>
          )}
          {showMrn && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={exporting !== null}
              onClick={() => runExport("mrn")}
              className="inline-flex items-center gap-2"
              title="MRN draft includes declaration preparation and line traceability worksheets."
            >
              <FileText className="h-4 w-4" aria-hidden />
              {exporting === "mrn" ? "Exporting…" : "Export MRN Draft"}
            </Button>
          )}
          <span
            className="inline-flex items-center text-slate-400"
            title={EXPORT_DESCRIPTION_TOOLTIP}
          >
            <Info className="h-4 w-4" aria-hidden />
            <span className="sr-only">{EXPORT_DESCRIPTION_TOOLTIP}</span>
          </span>
        </div>
      </div>
      {exportProgress && (
        <p className="mt-3 text-xs font-medium text-slate-600" role="status" aria-live="polite">
          {exportProgress}
        </p>
      )}
    </section>
  );
}
