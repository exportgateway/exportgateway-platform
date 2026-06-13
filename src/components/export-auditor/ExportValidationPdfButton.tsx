"use client";

import { FileDown } from "lucide-react";
import type { ExportAuditReport } from "@/lib/export-auditor/types";
import { exportValidationPdf } from "@/lib/export-auditor/validation-pdf-export";
import { Button } from "@/components/ui/Button";

interface ExportValidationPdfButtonProps {
  report: ExportAuditReport;
}

export function ExportValidationPdfButton({ report }: ExportValidationPdfButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="shrink-0"
      onClick={() => exportValidationPdf(report)}
    >
      <FileDown className="h-4 w-4 shrink-0" aria-hidden />
      Export Validation PDF
    </Button>
  );
}
