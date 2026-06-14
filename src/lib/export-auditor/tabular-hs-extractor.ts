import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  extractGenericHsCodes,
  extractHsByPosition,
} from "@/lib/export-auditor/hs-code-extraction-engine";
import { runMultiPassCustomsExtraction } from "@/lib/export-auditor/multi-pass-extraction";

/** Extract unique HS/TARIC codes from OCR/PDF corpus (tabular + labeled + regex). */
export function extractTabularHsCodes(corpus: string): string[] {
  return extractGenericHsCodes(corpus);
}

/** Map line position numbers to HS codes from corpus. */
export function extractTabularHsByPosition(corpus: string): Map<number, string> {
  return extractHsByPosition(corpus);
}

/** Backfill missing line-item hs_code via multi-pass customs extraction. */
export function enrichItemHsCodesFromOcr(invoice: NormalizedInvoice): NormalizedInvoice {
  return runMultiPassCustomsExtraction(invoice);
}
