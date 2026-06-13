import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import type {
  AuditIssue,
  PreferenceOriginAnalysis,
  SupportingDocumentKind,
  SupportingDocumentReference,
} from "@/lib/export-auditor/types";

export type { SupportingDocumentKind } from "@/lib/export-auditor/types";

export const DELIVERY_NOTE_DETECTED = "DELIVERY_NOTE_DETECTED";
export const CERTIFICATE_OF_ORIGIN_REFERENCED = "CERTIFICATE_OF_ORIGIN_REFERENCED";
export const PACKING_LIST_REFERENCED = "PACKING_LIST_REFERENCED";
export const EUR1_REFERENCED = "EUR1_REFERENCED";
export const LTSD_REFERENCED = "LTSD_REFERENCED";

export const SUPPORTING_DOCUMENT_LABELS: Record<SupportingDocumentKind, string> = {
  delivery_note: "Delivery Note Referenced",
  certificate_of_origin: "Certificate of Origin Referenced",
  packing_list: "Packing List Referenced",
  eur1: "EUR.1 Referenced",
  long_term_supplier_declaration: "Long-Term Supplier Declaration Referenced",
};

const SUPPORTING_DOCUMENT_ORDER: SupportingDocumentKind[] = [
  "delivery_note",
  "certificate_of_origin",
  "packing_list",
  "eur1",
  "long_term_supplier_declaration",
];

const ISSUE_CODE_TO_KIND: Record<string, SupportingDocumentKind> = {
  [DELIVERY_NOTE_DETECTED]: "delivery_note",
  [CERTIFICATE_OF_ORIGIN_REFERENCED]: "certificate_of_origin",
  [PACKING_LIST_REFERENCED]: "packing_list",
  [EUR1_REFERENCED]: "eur1",
  [LTSD_REFERENCED]: "long_term_supplier_declaration",
};

export const SUPPORTING_DOCUMENT_ISSUE_CODES = new Set(Object.keys(ISSUE_CODE_TO_KIND));

const MESSAGE_PATTERNS: Array<{ kind: SupportingDocumentKind; re: RegExp }> = [
  {
    kind: "delivery_note",
    re: /delivery note detected|delivery note referenced|referenced delivery note|lieferschein|bon de livraison/i,
  },
  {
    kind: "certificate_of_origin",
    re: /certificate of origin referenced|certificate of origin detected|referenced certificate of origin|\bC\.O\.O\.\b|\bCOO\b.*(?:referenced|enclosed|attached)/i,
  },
  {
    kind: "packing_list",
    re: /packing list referenced|packing list detected|referenced packing list|packliste|liste de colisage/i,
  },
  {
    kind: "eur1",
    re: /eur\.?\s*1\s+(?:enclosed|attached|included|provided|issued|referenced)|\beur\.?\s*1\b.*referenced/i,
  },
  {
    kind: "long_term_supplier_declaration",
    re: /long-term\s+supplier\s+declaration|\bLTSD\b.*referenced|referenced.*long-term\s+supplier/i,
  },
];

const CORPUS_PATTERNS: Array<{ kind: SupportingDocumentKind; re: RegExp }> = [
  { kind: "delivery_note", re: /delivery note|lieferschein|bon de livraison/i },
  {
    kind: "certificate_of_origin",
    re: /certificate of origin|\bC\.O\.O\.\b|\bcertificate\s+of\s+origin\b/i,
  },
  { kind: "packing_list", re: /packing list|packliste|liste de colisage/i },
  { kind: "eur1", re: /\beur\.?\s*1\b/i },
  { kind: "long_term_supplier_declaration", re: /long-term\s+supplier\s+declaration|\bLTSD\b/i },
];

function collectDocumentCorpus(invoice: NormalizedInvoice): string {
  const parts: string[] = [];
  for (const key of ["ocr_text", "footer_text", "delivery_notes", "packing_info", "shipment_notes"] as const) {
    const value = invoice[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    }
  }
  return parts.join("\n");
}

function detectFromDocumentFlags(invoice: NormalizedInvoice, detected: Set<SupportingDocumentKind>): void {
  const flags = invoice.document_flags ?? {};
  if (flags.delivery_note_referenced === true) {
    detected.add("delivery_note");
  }
  if (flags.certificate_of_origin_referenced === true) {
    detected.add("certificate_of_origin");
  }
  if (flags.packing_list_referenced === true) {
    detected.add("packing_list");
  }
}

function detectFromCorpus(invoice: NormalizedInvoice, detected: Set<SupportingDocumentKind>): void {
  const corpus = collectDocumentCorpus(invoice);
  if (!corpus.trim()) {
    return;
  }
  for (const { kind, re } of CORPUS_PATTERNS) {
    if (re.test(corpus)) {
      detected.add(kind);
    }
  }
}

function detectFromPreferenceOrigin(
  preferenceOrigin: PreferenceOriginAnalysis | undefined,
  detected: Set<SupportingDocumentKind>
): void {
  if (!preferenceOrigin) {
    return;
  }

  for (const decl of preferenceOrigin.declarationsDetected ?? []) {
    if (decl.kind === "eur1_except_positions" || /\beur\.?\s*1\b/i.test(decl.text)) {
      detected.add("eur1");
    }
    if (
      decl.kind === "supplier_declaration" &&
      /long-term\s+supplier\s+declaration|\bLTSD\b/i.test(decl.text)
    ) {
      detected.add("long_term_supplier_declaration");
    }
  }
}

export function inferSupportingDocumentCodeFromMessage(message: string): string | undefined {
  for (const { kind, re } of MESSAGE_PATTERNS) {
    if (re.test(message)) {
      const entry = Object.entries(ISSUE_CODE_TO_KIND).find(([, k]) => k === kind);
      return entry?.[0];
    }
  }
  return undefined;
}

export function kindFromIssueCode(code: string): SupportingDocumentKind | undefined {
  return ISSUE_CODE_TO_KIND[code];
}

function resolveSupportingDocumentIssueCode(issue: AuditIssue): string {
  if (issue.field?.trim()) {
    return issue.field.trim().toUpperCase();
  }
  const fromMessage = inferSupportingDocumentCodeFromMessage(issue.message);
  if (fromMessage) {
    return fromMessage;
  }
  return issue.message.trim().toUpperCase();
}

export function isSupportingDocumentReferenceIssue(issue: AuditIssue): boolean {
  const code = resolveSupportingDocumentIssueCode(issue);
  if (SUPPORTING_DOCUMENT_ISSUE_CODES.has(code)) {
    return true;
  }
  return inferSupportingDocumentCodeFromMessage(issue.message) != null;
}

export function extractSupportingDocumentsFromIssues(issues: AuditIssue[]): SupportingDocumentKind[] {
  const detected = new Set<SupportingDocumentKind>();
  for (const issue of issues) {
    const code = resolveSupportingDocumentIssueCode(issue);
    const fromCode = kindFromIssueCode(code);
    if (fromCode) {
      detected.add(fromCode);
      continue;
    }
    for (const { kind, re } of MESSAGE_PATTERNS) {
      if (re.test(issue.message)) {
        detected.add(kind);
      }
    }
  }
  return SUPPORTING_DOCUMENT_ORDER.filter((kind) => detected.has(kind));
}

export function filterSupportingDocumentIssues(issues: AuditIssue[]): AuditIssue[] {
  return issues.filter((issue) => !isSupportingDocumentReferenceIssue(issue));
}

function toReferences(detected: Set<SupportingDocumentKind>): SupportingDocumentReference[] {
  return SUPPORTING_DOCUMENT_ORDER.filter((kind) => detected.has(kind)).map((kind) => ({
    kind,
    label: SUPPORTING_DOCUMENT_LABELS[kind],
  }));
}

export function detectSupportingDocuments(
  invoice: NormalizedInvoice,
  preferenceOrigin?: PreferenceOriginAnalysis,
  issues?: AuditIssue[]
): SupportingDocumentReference[] {
  const detected = new Set<SupportingDocumentKind>();

  detectFromDocumentFlags(invoice, detected);
  detectFromCorpus(invoice, detected);
  detectFromPreferenceOrigin(preferenceOrigin, detected);

  if (issues?.length) {
    for (const kind of extractSupportingDocumentsFromIssues(issues)) {
      detected.add(kind);
    }
  }

  return toReferences(detected);
}
