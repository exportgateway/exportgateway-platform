/**
 * Temporary forensic trace for AS2026-1069 — enable via AS2026_FORENSIC_TRACE=1
 * or when invoice_number contains AS2026-1069.
 */

import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import {
  extractEnglishConsignee,
  extractEnglishInvoiceTotal,
  extractEnglishLineItems,
  TOTAL_AMOUNT_PATTERNS,
} from "@/lib/export-auditor/english-invoice-field-extractor";
import { findLargestMonetaryAmount } from "@/lib/export-auditor/invoice-total-validation";
import { countLineItems } from "@/lib/export-auditor/invoice-fields";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";

export interface ForensicTraceEntry {
  stage: string;
  ts: string;
  data: Record<string, unknown>;
}

const entries: ForensicTraceEntry[] = [];
let traceEnabled = false;

export function resetForensicTrace(): void {
  entries.length = 0;
}

export function setForensicTraceEnabled(enabled: boolean): void {
  traceEnabled = enabled;
}

export function isForensicTraceTarget(invoice: NormalizedInvoice): boolean {
  if (process.env.AS2026_FORENSIC_TRACE === "1") return true;
  const num = invoice.invoice_number?.trim() ?? "";
  return num.includes("AS2026-1069");
}

export function shouldForensicTrace(invoice: NormalizedInvoice): boolean {
  return traceEnabled || isForensicTraceTarget(invoice);
}

export function forensicLog(stage: string, data: Record<string, unknown>): void {
  if (!traceEnabled) return;
  const entry: ForensicTraceEntry = {
    stage,
    ts: new Date().toISOString(),
    data,
  };
  entries.push(entry);
  console.log(`[AS2026-FORENSIC] ${stage}`, JSON.stringify(data, null, 0));
}

export function getForensicTraceEntries(): readonly ForensicTraceEntry[] {
  return entries;
}

export function enableForensicTraceForInvoice(invoice: NormalizedInvoice): boolean {
  if (shouldForensicTrace(invoice)) {
    traceEnabled = true;
    return true;
  }
  return false;
}

function snippetAroundMatch(corpus: string, match: RegExpMatchArray): string {
  const start = Math.max(0, (match.index ?? 0) - 40);
  const end = Math.min(corpus.length, (match.index ?? 0) + match[0].length + 80);
  return corpus.slice(start, end).replace(/\r/g, "");
}

export function dumpOcrSnippets(corpus: string): Record<string, unknown> {
  const snippets: Record<string, unknown> = {
    corpus_length: corpus.length,
    invoice_total: null as unknown,
    consignee: null as unknown,
    line_items: null as unknown,
  };

  for (const re of TOTAL_AMOUNT_PATTERNS) {
    const match = corpus.match(re);
    if (match) {
      snippets.invoice_total = {
        pattern: re.source,
        matched_text: match[0],
        captured_amount: match[1],
        snippet: snippetAroundMatch(corpus, match),
      };
      break;
    }
  }

  if (!snippets.invoice_total) {
    const largest = findLargestMonetaryAmount(corpus);
    snippets.invoice_total = {
      pattern: "findLargestMonetaryAmount (fallback)",
      largest_amount: largest,
    };
  }

  for (const label of ["Recipient", "Buyer", "Consignee"] as const) {
    const re = new RegExp(`${label}\\s*:?\\s*`, "i");
    const match = corpus.match(re);
    if (match) {
      const blockStart = match.index ?? 0;
      snippets.consignee = {
        label,
        block_start: blockStart,
        block_text: corpus.slice(blockStart, blockStart + 400).replace(/\r/g, ""),
        extractEnglishConsignee_result: extractEnglishConsignee(corpus),
      };
      break;
    }
  }

  const headerMatch = corpus.match(/\bPos(?:ition)?\s+Description\b/i);
  if (headerMatch?.index != null) {
    snippets.line_items = {
      table_header_at: headerMatch.index,
      table_snippet: corpus.slice(headerMatch.index, headerMatch.index + 600).replace(/\r/g, ""),
      extractEnglishLineItems_count: extractEnglishLineItems(corpus).length,
      extractEnglishLineItems_sample: extractEnglishLineItems(corpus).slice(0, 3),
    };
  } else {
    snippets.line_items = {
      table_header_at: null,
      extractEnglishLineItems_count: extractEnglishLineItems(corpus).length,
      numbered_row_sample: corpus
        .split(/\n/)
        .filter((l) => /^\d{1,3}\s+/.test(l.trim()))
        .slice(0, 5),
    };
  }

  snippets.labeled_total_extract = extractEnglishInvoiceTotal(corpus);

  return snippets;
}

export function logBeforeEnrich(invoice: NormalizedInvoice, pdfTextLen?: number): void {
  forensicLog("1.before_enrichInvoiceDocument", {
    invoice_number: invoice.invoice_number ?? null,
    total_value: invoice.total_value ?? null,
    total_value_numeric: invoice.total_value_numeric ?? null,
    resolveInvoiceValue: resolveInvoiceValue(invoice),
    consignee: invoice.consignee ?? null,
    items_length: invoice.items?.length ?? 0,
    ocr_text_len: invoice.ocr_text?.length ?? 0,
    pdfTextLen: pdfTextLen ?? null,
  });
}

export function logAfterEnglishRecovery(
  before: NormalizedInvoice,
  after: NormalizedInvoice,
  corpus: string
): void {
  forensicLog("2.after_englishInvoiceFieldRecovery", {
    recovered_consignee: after.consignee ?? null,
    consignee_changed: (before.consignee ?? "") !== (after.consignee ?? ""),
    recovered_invoice_total_from_english:
      before.total_value_numeric === after.total_value_numeric &&
      before.total_value === after.total_value
        ? null
        : resolveInvoiceValue(after),
    recovered_line_count: after.items?.length ?? 0,
    line_count_delta: (after.items?.length ?? 0) - (before.items?.length ?? 0),
    extractEnglishConsignee: extractEnglishConsignee(corpus),
    extractEnglishInvoiceTotal: extractEnglishInvoiceTotal(corpus),
    extractEnglishLineItems_count: extractEnglishLineItems(corpus).length,
    ocr_snippets: dumpOcrSnippets(corpus),
  });
}

export function logAfterTotalValidation(
  before: NormalizedInvoice,
  result: { invoice: NormalizedInvoice; corrected: boolean; hasError: boolean },
  corpus: string
): void {
  forensicLog("3.after_validateAndCorrectInvoiceTotal", {
    original_total: resolveInvoiceValue(before),
    ocr_detected_total: extractEnglishInvoiceTotal(corpus),
    largest_monetary: findLargestMonetaryAmount(corpus),
    corrected_total: resolveInvoiceValue(result.invoice),
    corrected_flag: result.corrected,
    has_error: result.hasError,
    total_value_numeric_after: result.invoice.total_value_numeric ?? null,
    total_value_after: result.invoice.total_value ?? null,
  });
}

export function logBeforeMap(invoice: NormalizedInvoice): void {
  forensicLog("4.before_mapAuditReportToExportReport", {
    final_invoice_value: resolveInvoiceValue(invoice),
    final_consignee: invoice.consignee ?? null,
    final_line_count: countLineItems(invoice),
    items_length: invoice.items?.length ?? 0,
    parser_recovery: invoice.parser_recovery_provenance ?? [],
  });
}

export interface ForensicClassification {
  code: "A" | "B" | "C" | "D";
  label: string;
  evidence: string;
}

export function classifyForensicFailure(
  raw: NormalizedInvoice,
  enriched: NormalizedInvoice,
  mappedInvoiceValue: number
): ForensicClassification {
  const englishEntry = entries.find((e) => e.stage === "2.after_englishInvoiceFieldRecovery");
  const totalEntry = entries.find((e) => e.stage === "3.after_validateAndCorrectInvoiceTotal");
  const snippets = englishEntry?.data.ocr_snippets as Record<string, unknown> | undefined;

  const rawValue = resolveInvoiceValue(raw);
  const enrichedValue = resolveInvoiceValue(enriched);
  const englishRan = Boolean(englishEntry);
  const totalRan = Boolean(totalEntry);
  const corrected = totalEntry?.data.corrected_flag === true;
  const englishConsignee = englishEntry?.data.extractEnglishConsignee;
  const englishTotal = englishEntry?.data.extractEnglishInvoiceTotal;
  const englishLines = englishEntry?.data.extractEnglishLineItems_count;

  if (!englishRan && !totalRan) {
    return {
      code: "A",
      label: "OCR recovery not executed",
      evidence: "No forensic checkpoints logged after enrichInvoiceDocument entry",
    };
  }

  if (
    (englishConsignee == null || englishConsignee === "") &&
    (englishTotal == null || englishTotal === 0) &&
    (typeof englishLines !== "number" || englishLines === 0)
  ) {
    const totalEntry = entries.find((e) => e.stage === "3.after_validateAndCorrectInvoiceTotal");
    const corrected = totalEntry?.data.corrected_flag === true;
    if (corrected) {
      return {
        code: "B",
        label: "Consignee recovery failed; total recovery succeeded",
        evidence: `extractEnglishConsignee=null (Recipient block broken by Date: line after QR); total corrected to ${totalEntry?.data.corrected_total}`,
      };
    }
    return {
      code: "B",
      label: "OCR recovery executed but found nothing usable",
      evidence: `extractEnglishConsignee/total/lines empty or uncorrected; corpus_length=${(snippets as { corpus_length?: number })?.corpus_length ?? "?"}; validateAndCorrectInvoiceTotal corrected=${corrected}`,
    };
  }

  if (enrichedValue > rawValue && enrichedValue !== mappedInvoiceValue) {
    return {
      code: "C",
      label: "Recovery succeeded but value overwritten later",
      evidence: `enriched=${enrichedValue} mapped=${mappedInvoiceValue} raw=${rawValue}`,
    };
  }

  if (enrichedValue === rawValue && rawValue === 22 && !corrected) {
    if (englishTotal != null && Number(englishTotal) > 22) {
      return {
        code: "D",
        label: "Mapping uses wrong field OR total correction skipped",
        evidence: `OCR labeled total=${englishTotal} but validateAndCorrectInvoiceTotal corrected=${corrected}; resolveInvoiceValue still ${rawValue}`,
      };
    }
    return {
      code: "B",
      label: "OCR recovery executed but found nothing usable",
      evidence: `raw=${rawValue} after enrich=${enrichedValue} corrected=${corrected}`,
    };
  }

  if (mappedInvoiceValue === enrichedValue && enrichedValue > rawValue) {
    return {
      code: "A",
      label: "Recovery succeeded end-to-end",
      evidence: `raw=${rawValue} enriched=${enrichedValue} mapped=${mappedInvoiceValue}`,
    };
  }

  return {
    code: "D",
    label: "Mapping still uses wrong field",
    evidence: `raw=${rawValue} enriched=${enrichedValue} mapped=${mappedInvoiceValue}`,
  };
}

export function renderForensicTraceMarkdown(options: {
  raw: NormalizedInvoice;
  enriched: NormalizedInvoice;
  mappedInvoiceValue: number;
  mappedConsignee: string;
  mappedLineCount: number;
  mappedCustoms?: string;
  pipeline: string;
}): string {
  const { raw, enriched, pipeline } = options;
  const classification = classifyForensicFailure(raw, enriched, options.mappedInvoiceValue);

  const section = (title: string, obj: Record<string, unknown>) =>
    `### ${title}\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;

  const logSections = entries
    .map((e) => section(e.stage, { ...e.data, _ts: e.ts }))
    .join("\n");

  return `# AS2026-1069 Forensic Trace

Generated: ${new Date().toISOString()}  
Pipeline: ${pipeline}

## Classification: **${classification.code}) ${classification.label}**

${classification.evidence}

---

## Value summary

| Stage | consignee | invoice_value | line_items |
|---|---|---|---|
| **RAW OCR** | ${JSON.stringify(raw.consignee ?? "—")} | ${resolveInvoiceValue(raw)} | ${raw.items?.length ?? 0} |
| **RECOVERED (post-enrich)** | ${JSON.stringify((enriched.consignee ?? "—").slice(0, 80))} | ${resolveInvoiceValue(enriched)} | ${countLineItems(enriched)} |
| **FINAL MAPPED** | ${JSON.stringify(options.mappedConsignee.slice(0, 80))} | ${options.mappedInvoiceValue} | ${options.mappedLineCount} |

Customs readiness (mapped): ${options.mappedCustoms ?? "—"}

---

## Runtime checkpoints

${logSections}

---

## RAW OCR fields

${section("Parser API response", {
  invoice_number: raw.invoice_number,
  consignee: raw.consignee,
  total_value: raw.total_value,
  total_value_numeric: raw.total_value_numeric,
  items_length: raw.items?.length ?? 0,
  ocr_text_len: raw.ocr_text?.length ?? 0,
  ocr_text_preview: raw.ocr_text?.slice(0, 800) ?? null,
})}

## RECOVERED fields

${section("Post enrichInvoiceDocument", {
  consignee: enriched.consignee,
  total_value_numeric: enriched.total_value_numeric,
  total_value: enriched.total_value,
  resolveInvoiceValue: resolveInvoiceValue(enriched),
  items_length: enriched.items?.length ?? 0,
  parser_recovery_provenance: enriched.parser_recovery_provenance ?? [],
})}

## FINAL MAPPED fields

${section("ExportAuditReport.invoiceSummary", {
  consignee: options.mappedConsignee,
  invoiceValue: options.mappedInvoiceValue,
  lineItemCount: options.mappedLineCount,
  customsReadiness: options.mappedCustoms ?? null,
})}
`;
}
