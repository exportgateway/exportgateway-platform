/**
 * Backward-compatible facade for Balkan PDF text repair.
 * Implementation lives in pdf-font-repair-registry.ts.
 */
import {
  findControlCharacters,
  repairPdfFontText,
  type PdfFontRepairContext,
  type PdfFontRepairDiagnostics,
} from "@/lib/export-auditor/pdf-font-repair-registry";

export {
  findControlCharacters,
  UNKNOWN_PDF_ENCODING_CHARACTER,
  BALKAN_PLACE_DICTIONARY,
  BALKAN_DIACRITICS,
  SUPPLIER_ENCODING_PROFILES,
  corruptTextForTest,
  inferSupplierLabel,
  logRepairDiagnostics,
  repairPdfFontText,
  resolveSupplierProfile,
  type PdfFontRepairContext,
  type PdfFontRepairDiagnostics,
  type PdfFontRepairResult,
  type SupplierEncodingProfile,
  type UnknownEncodingRecord,
} from "@/lib/export-auditor/pdf-font-repair-registry";

export interface TextEncodingDiagnostic {
  label: string;
  text: string;
  length: number;
  controlCharCount: number;
  controlCodepoints: string[];
  codepointSample: string[];
}

/** Build forensic diagnostic for a text sample. */
export function diagnoseTextEncoding(label: string, text: string): TextEncodingDiagnostic {
  const controls = findControlCharacters(text);
  const unique = [...new Set(controls.map((c) => c.codepoint))].sort((a, b) => a - b);
  const sample = [...text.slice(0, 120)].map((ch) => {
    const cp = ch.codePointAt(0)!;
    const hex = cp.toString(16).toUpperCase().padStart(4, "0");
    if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) {
      return `\\u${hex}(CTRL)`;
    }
    if (ch === "\n") return "\\n";
    return `${ch}(U+${hex})`;
  });

  return {
    label,
    text,
    length: text.length,
    controlCharCount: controls.length,
    controlCodepoints: unique.map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`),
    codepointSample: sample,
  };
}

/** Repair pdf-parse Balkan diacritic control-byte mappings (registry-based). */
export function repairPdfExtractedText(
  text: string,
  context?: PdfFontRepairContext
): string {
  return repairPdfFontText(text, context).text;
}

/** Run before/after repair diagnostics for a PDF text blob. */
export function diagnosePdfTextRepair(
  raw: string,
  context?: PdfFontRepairContext
): {
  raw: TextEncodingDiagnostic;
  normalized: TextEncodingDiagnostic;
  changed: boolean;
  registryDiagnostics: PdfFontRepairDiagnostics;
} {
  const result = repairPdfFontText(raw, context);
  return {
    raw: diagnoseTextEncoding("raw PDF text", raw),
    normalized: diagnoseTextEncoding("repaired PDF text", result.text),
    changed: result.repaired,
    registryDiagnostics: result.diagnostics,
  };
}
