/** Extract plain text from a PDF buffer for footer / shipment pattern matching. */
import {
  diagnosePdfTextRepair,
  repairPdfExtractedText,
  type PdfFontRepairContext,
} from "@/lib/export-auditor/balkan-pdf-text-repair";

export {
  diagnosePdfTextRepair,
  diagnoseTextEncoding,
  repairPdfExtractedText,
  repairPdfFontText,
  type PdfFontRepairContext,
} from "@/lib/export-auditor/balkan-pdf-text-repair";

export async function extractPdfText(
  buffer: Buffer,
  context?: PdfFontRepairContext
): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const raw = result.text?.trim() ?? "";
    const repairDiag = diagnosePdfTextRepair(raw, context);
    const text = repairDiag.normalized.text;

    console.log("[EXPORT-AUDITOR-RUNTIME] extractPdfText ok", {
      length: text.length,
      preview: text.slice(0, 500),
      pdfFontRepair: repairDiag.changed
        ? {
            profileId: repairDiag.registryDiagnostics.profileId,
            supplier: repairDiag.registryDiagnostics.supplier,
            pdfSource: repairDiag.registryDiagnostics.pdfSource,
            controlCharsBefore: repairDiag.raw.controlCharCount,
            controlCharsAfter: repairDiag.normalized.controlCharCount,
            unknownControlBytes: repairDiag.registryDiagnostics.unknownControlBytes,
          }
        : undefined,
    });
    return text;
  } catch (err) {
    console.error("[EXPORT-AUDITOR-RUNTIME] extractPdfText failed", err);
    return "";
  }
}

export function mergeDocumentText(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n");
}

function isPdfBuffer(buffer: Buffer, fileName?: string): boolean {
  if (fileName?.toLowerCase().endsWith(".pdf")) return true;
  return buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50;
}

/** Page count from PDF structure via pdf-parse; 1 for images or parse failures. */
export async function extractPdfPageCount(
  buffer: Buffer,
  fileName?: string
): Promise<number> {
  if (!isPdfBuffer(buffer, fileName)) return 1;

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo();
    await parser.destroy();
    const total = info.total;
    return total > 0 ? total : 1;
  } catch (err) {
    console.error("[EXPORT-AUDITOR-RUNTIME] extractPdfPageCount failed", err);
    return 1;
  }
}
