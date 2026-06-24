import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { isNonGoodsLine, isServiceOrTransportLine } from "@/lib/export-auditor/service-line-detection";
import { applyPreferentialOriginExceptions } from "@/lib/export-auditor/preferential-origin-exception-engine";
import {
  detectAuthorisedExporter,
  type AuthorisedExporterDetectionResult,
} from "@/lib/export-auditor/authorised-exporter-detection-engine";

/** Preferential origin status — distinct from country of origin. */
export type PreferentialOriginStatus = "YES" | "NO" | "UNKNOWN" | "NOT_DECLARED";

/** How preferential origin was determined — never from country_of_origin alone. */
export type PreferenceSource =
  | "invoice_declaration"
  | "supplier_declaration_reference"
  | "manufacturer_declaration_reference"
  | "authorised_exporter_statement"
  | "excluded_positions_list"
  | "explicit_non_preferential_declaration"
  | "none";

export interface LinePreferentialOrigin {
  position_number: number;
  country_of_origin: string;
  preferential_origin: PreferentialOriginStatus;
  preference_reason: string;
  preference_source: PreferenceSource;
}

export interface DetectedDeclaration {
  kind:
    | "positions_preferential_yes"
    | "all_products_preferential"
    | "eur1_except_positions"
    | "except_where_otherwise_indicated"
    | "asterisk_preferential_marker"
    | "supplier_declaration"
    | "manufacturer_declaration"
    | "authorised_exporter";
  text: string;
  positions?: number[];
  excluded_positions?: number[];
}

export interface PreferentialOriginEngineResult {
  lines: LinePreferentialOrigin[];
  declarations_detected: DetectedDeclaration[];
  authorised_exporter_detected: boolean;
  authorised_exporter_number: string | null;
  authorised_exporter_detection: AuthorisedExporterDetectionResult | null;
  origin_declaration_found: boolean;
  has_explicit_preference_evidence: boolean;
  summary: string;
}

/** US authorization / UK authorisation spellings. */
const AUTH_SPELL = "authori[sz]ation";
const AUTH_EXPORTER_SPELL = "authori[sz]ed\\s+exporter";
const CUSTOMS_AUTH = `customs\\s+${AUTH_SPELL}`;
const AUTH_NO = "(?:no\\.?|number)";
const REF_SLASH = "[A-Z]{2}\\/\\d+\\/\\d+";
const REF_COMPACT = "[A-Z]{2}\\d{6}\\/\\d{4}";

const DECLARATION_PATTERNS: Array<{
  kind: DetectedDeclaration["kind"];
  re: RegExp;
  extractPositions?: (match: RegExpMatchArray) => number[] | undefined;
  extractExcluded?: (match: RegExpMatchArray) => number[] | undefined;
}> = [
  {
    kind: "positions_preferential_yes",
    re: /positions?\s+([\d,\sand]+)\s+(?:are\s+)?(?:of\s+)?(?:(?:EU|E\.U\.)\s+)?preferential\s+origin/gi,
    extractPositions: (m) => parsePositionNumbers(m[1]),
  },
  {
    kind: "positions_preferential_yes",
    re: /position\s+([\d,\sand]+)\s+(?:is|are)\s+(?:of\s+)?(?:(?:EU|E\.U\.)\s+)?preferential\s+origin/gi,
    extractPositions: (m) => parsePositionNumbers(m[1]),
  },
  {
    kind: "all_products_preferential",
    re: /products?\s+covered\s+by\s+this\s+document\s+are\s+of\s+preferential\s+origin/gi,
  },
  {
    kind: "all_products_preferential",
    re: /these\s+products\s+are\s+of\s+(?:EU\s+)?preferential\s+origin/gi,
  },
  {
    kind: "all_products_preferential",
    re: /exporter\s+of\s+the\s+products\s+covered\s+by\s+this\s+document[\s\S]{0,800}?preferential\s+origin/gi,
  },
  {
    kind: "authorised_exporter",
    re: new RegExp(
      `exporter\\s+of\\s+(?:the\\s+)?products\\s+covered\\s+by\\s+this\\s+document[\\s\\S]{0,300}?\\(\\s*${CUSTOMS_AUTH}\\s+${AUTH_NO}\\s*${REF_SLASH}\\s*\\)`,
      "gi"
    ),
  },
  {
    kind: "all_products_preferential",
    re: /declare(?:s|d)?\s+that\s+the\s+products?\s+(?:on\s+this\s+invoice\s+)?(?:are|is)\s+of\s+(?:(?:EU|E\.U\.)\s+)?preferential\s+origin/gi,
  },
  {
    kind: "all_products_preferential",
    re: /all\s+(?:the\s+)?(?:products?|goods?|items?|lines?)\s+(?:on\s+this\s+(?:invoice|document))?\s+(?:are|is)\s+of\s+(?:(?:EU|E\.U\.)\s+)?preferential\s+origin/gi,
  },
  {
    kind: "all_products_preferential",
    re: /preferential\s+origin\s+(?:declaration\s+)?(?:applies\s+to\s+)?all\s+(?:products?|goods?|positions?|lines?)/gi,
  },
  {
    kind: "eur1_except_positions",
    re: /eur\.?\s*1\s+(?:enclosed|attached|included|provided|issued).*?except(?:\s+where\s+otherwise\s+indicated)?(?:\s+(?:for\s+)?)?(?:positions?\s+)?([\d,\sand]+)/gi,
    extractExcluded: (m) => parsePositionNumbers(m[1]),
  },
  {
    kind: "eur1_except_positions",
    re: /preferential\s+origin\s+(?:declaration\s+)?applies\s+to\s+all\s+(?:positions|products|lines|goods)\s+except\s+(?:positions?\s+)?([\d,\sand]+)/gi,
    extractExcluded: (m) => parsePositionNumbers(m[1]),
  },
  {
    kind: "eur1_except_positions",
    re: /(?:applies\s+to\s+all|all)\s+(?:positions|products|lines|goods)\s+except\s+(?:positions?\s+)?([\d,\sand]+)/gi,
    extractExcluded: (m) => parsePositionNumbers(m[1]),
  },
  {
    kind: "except_where_otherwise_indicated",
    re: /except\s+where\s+otherwise\s+clearly\s+indicated/gi,
  },
  {
    kind: "except_where_otherwise_indicated",
    re: /except\s+where\s+otherwise\s+indicated/gi,
  },
  {
    kind: "asterisk_preferential_marker",
    re: /articles?,?\s+which\s+are\s+not\s+marked\s+with\s+sign\s*\(\s*\*\s*\)/gi,
  },
  {
    kind: "supplier_declaration",
    re: /(?:short-term|long-term)\s+supplier\s+declaration|STSD|LTSD|supplier\s+declaration/gi,
  },
  {
    kind: "manufacturer_declaration",
    re: /manufacturer(?:'?s)?\s+declaration/gi,
  },
  {
    kind: "authorised_exporter",
    re: new RegExp(`${CUSTOMS_AUTH}\\s+${AUTH_NO}\\s*${REF_SLASH}`, "gi"),
  },
  {
    kind: "authorised_exporter",
    re: new RegExp(`${CUSTOMS_AUTH}\\s+${AUTH_NO}\\s+${REF_COMPACT}`, "gi"),
  },
  {
    kind: "authorised_exporter",
    re: new RegExp(`${AUTH_EXPORTER_SPELL}\\s+${AUTH_NO}\\s*${REF_SLASH}`, "gi"),
  },
  {
    kind: "authorised_exporter",
    re: new RegExp(`${AUTH_EXPORTER_SPELL}\\s+${AUTH_NO}\\s+${REF_COMPACT}`, "gi"),
  },
  {
    kind: "authorised_exporter",
    re: /authorised\s+exporter|authorized\s+exporter|\bREX[\s-]?(?:No|Number|#)?/gi,
  },
];

export function parsePositionNumbers(raw: string): number[] {
  const nums = new Set<number>();
  const normalized = raw.replace(/\band\b/gi, ",");

  for (const segment of normalized.split(/[,;]+/)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const rangeMatch = trimmed.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        for (let i = lo; i <= hi; i += 1) {
          nums.add(i);
        }
      }
      continue;
    }

    for (const part of trimmed.split(/\s+/)) {
      const n = parseInt(part.trim(), 10);
      if (Number.isFinite(n) && n > 0) {
        nums.add(n);
      }
    }
  }

  return [...nums].sort((a, b) => a - b);
}

/** Extract REX / authorised exporter registration number from invoice text. */
export function extractAuthorisedExporterNumber(corpus: string): string | null {
  return detectAuthorisedExporter(corpus).authorisation_number;
}

/** Extract full EU preferential origin declaration block from document text. */
export function extractOriginDeclarationBlock(corpus: string): string | null {
  const blockRe =
    /the\s+exporter\s+of\s+the\s+products\s+covered\s+by\s+this\s+document[\s\S]{0,900}?preferential\s+origin\.?/i;
  const match = corpus.match(blockRe);
  if (match) return match[0].replace(/\s+/g, " ").trim();

  const shortRe = /these\s+products\s+are\s+of\s+(?:EU\s+)?preferential\s+origin\.?/i;
  const short = corpus.match(shortRe);
  return short ? short[0].trim() : null;
}

export function hasOriginDeclaration(corpus: string): boolean {
  return (
    extractOriginDeclarationBlock(corpus) != null ||
    /products?\s+covered\s+by\s+this\s+document[\s\S]{0,400}?preferential\s+origin/i.test(corpus) ||
    new RegExp(
      `${CUSTOMS_AUTH}\\s+${AUTH_NO}\\s*${REF_SLASH}[\\s\\S]{0,400}?preferential\\s+origin`,
      "i"
    ).test(corpus)
  );
}

/** True when text explicitly states EUR.1 / declaration covers all remaining (non-excluded) positions. */
export function eur1ExplicitlyCoversRemainingPositions(text: string): boolean {
  return (
    /all\s+(?:other|remaining)\s+(?:positions|line\s+items|products|goods)/i.test(text) ||
    /all\s+(?:positions|products|line\s+items|goods|lines)\s+except/i.test(text) ||
    /for\s+all\s+(?:positions|products|line\s+items|goods|lines)\s+except/i.test(text) ||
    /covers\s+all\s+(?:positions|products|items|lines|goods)\s+except/i.test(text) ||
    /applies\s+to\s+all\s+(?:positions|products|items|lines|goods)\s+except/i.test(text) ||
    /eur\.?\s*1\s+(?:enclosed|attached|included|provided|issued)\s+for\s+all\s+(?:positions|products|line\s+items|goods)\s+except/i.test(
      text
    )
  );
}

function eur1RemainingCoverageExplicit(
  corpus: string,
  exceptDeclarations: DetectedDeclaration[]
): boolean {
  for (const decl of exceptDeclarations) {
    if (eur1ExplicitlyCoversRemainingPositions(decl.text)) {
      return true;
    }
  }
  return eur1ExplicitlyCoversRemainingPositions(corpus);
}

/** Collect invoice text that may contain preferential origin declarations. */
export function collectDeclarationCorpus(invoice: NormalizedInvoice): string {
  const parts: string[] = [];

  if (invoice.vat_article?.trim()) {
    parts.push(invoice.vat_article.trim());
  }

  const extended = invoice as NormalizedInvoice & {
    origin_declaration_text?: string;
    preference_declarations?: string[];
  };

  if (extended.origin_declaration_text?.trim()) {
    parts.push(extended.origin_declaration_text.trim());
  }

  for (const key of ["footer_text", "ocr_text", "shipment_notes", "packing_info", "delivery_notes"] as const) {
    const value = invoice[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    }
  }

  for (const entry of extended.preference_declarations ?? []) {
    if (typeof entry === "string" && entry.trim()) {
      parts.push(entry.trim());
    }
  }

  for (const [key, value] of Object.entries(invoice.document_flags ?? {})) {
    if (typeof value === "string" && value.trim()) {
      if (/declaration|origin|preference|eur|supplier|manufacturer|authorised|authorized|rex/i.test(key)) {
        parts.push(value.trim());
      }
    }
  }

  for (const value of Object.values(invoice.document_flags ?? {})) {
    if (typeof value === "string" && value.trim().length > 20) {
      if (/preferential|origin declaration|eur\.?\s*1|except where|supplier declaration|manufacturer declaration/i.test(value)) {
        parts.push(value.trim());
      }
    }
  }

  return parts.join("\n");
}

export function detectDeclarations(corpus: string): DetectedDeclaration[] {
  if (!corpus.trim()) {
    return [];
  }

  const found: DetectedDeclaration[] = [];

  for (const pattern of DECLARATION_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(corpus)) !== null) {
      found.push({
        kind: pattern.kind,
        text: match[0].trim(),
        positions: pattern.extractPositions?.(match),
        excluded_positions: pattern.extractExcluded?.(match),
      });
    }
  }

  return dedupeDeclarations(found);
}

function dedupeDeclarations(declarations: DetectedDeclaration[]): DetectedDeclaration[] {
  const seen = new Set<string>();
  const result: DetectedDeclaration[] = [];
  for (const decl of declarations) {
    const key = `${decl.kind}|${decl.text}|${(decl.positions ?? []).join(",")}|${(decl.excluded_positions ?? []).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(decl);
  }
  return result;
}

interface LineRuleState {
  explicitYes: Set<number>;
  explicitNo: Set<number>;
  blanketAllYes: boolean;
  eur1Except: Set<number>;
  eur1CoversRemainingExplicit: boolean;
  exceptOtherwiseIndicated: boolean;
  asteriskMarkerRule: boolean;
  supplierRef: boolean;
  manufacturerRef: boolean;
  originDeclarationPresent: boolean;
  authorisedExporterPresent: boolean;
}

function buildRuleState(
  declarations: DetectedDeclaration[],
  corpus: string
): LineRuleState {
  const state: LineRuleState = {
    explicitYes: new Set(),
    explicitNo: new Set(),
    blanketAllYes: false,
    eur1Except: new Set(),
    eur1CoversRemainingExplicit: false,
    exceptOtherwiseIndicated: false,
    asteriskMarkerRule: false,
    supplierRef: false,
    manufacturerRef: false,
    originDeclarationPresent: false,
    authorisedExporterPresent: false,
  };

  const eur1ExceptDecls = declarations.filter((d) => d.kind === "eur1_except_positions");

  for (const decl of declarations) {
    switch (decl.kind) {
      case "positions_preferential_yes":
        for (const p of decl.positions ?? []) {
          state.explicitYes.add(p);
        }
        break;
      case "all_products_preferential":
        state.blanketAllYes = true;
        break;
      case "eur1_except_positions":
        for (const p of decl.excluded_positions ?? []) {
          state.eur1Except.add(p);
          state.explicitNo.add(p);
        }
        break;
      case "except_where_otherwise_indicated":
        state.exceptOtherwiseIndicated = true;
        break;
      case "asterisk_preferential_marker":
        state.asteriskMarkerRule = true;
        break;
      case "supplier_declaration":
        state.supplierRef = true;
        break;
      case "manufacturer_declaration":
        state.manufacturerRef = true;
        break;
      default:
        break;
    }
  }

  if (eur1ExceptDecls.length > 0) {
    state.eur1CoversRemainingExplicit = eur1RemainingCoverageExplicit(corpus, eur1ExceptDecls);
  }

  state.originDeclarationPresent = hasOriginDeclaration(corpus);
  state.authorisedExporterPresent = declarations.some((d) => d.kind === "authorised_exporter");

  if (state.asteriskMarkerRule) {
    state.blanketAllYes = false;
  }

  if (state.explicitYes.size > 0) {
    state.blanketAllYes = false;
  }

  const hasGlobalDeclaration = declarations.some(
    (d) => d.kind === "all_products_preferential"
  );
  const hasPositionExclusions =
    state.eur1Except.size > 0 || state.explicitNo.size > 0;

  if (
    hasGlobalDeclaration &&
    !hasPositionExclusions &&
    state.explicitYes.size === 0 &&
    !state.asteriskMarkerRule
  ) {
    state.blanketAllYes = true;
  }

  if (
    state.originDeclarationPresent &&
    !hasPositionExclusions &&
    state.explicitYes.size === 0 &&
    !state.asteriskMarkerRule &&
    !state.exceptOtherwiseIndicated
  ) {
    state.blanketAllYes = true;
  }

  return state;
}

function hasCountryOfOrigin(countryOfOrigin: string): boolean {
  const trimmed = countryOfOrigin.trim();
  return trimmed.length > 0 && trimmed !== "—";
}

function undeclaredPreference(
  countryOfOrigin: string,
  reason: string
): Pick<LinePreferentialOrigin, "preferential_origin" | "preference_reason" | "preference_source"> {
  return {
    preferential_origin: hasCountryOfOrigin(countryOfOrigin) ? "NOT_DECLARED" : "UNKNOWN",
    preference_reason: reason,
    preference_source: "none",
  };
}

export function lineHasPreferentialAsteriskMarker(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  if (!text) return false;
  return /\*/.test(text);
}

function resolveLinePreference(
  position: number,
  countryOfOrigin: string,
  description: string,
  rules: LineRuleState,
  declarations: DetectedDeclaration[]
): Pick<LinePreferentialOrigin, "preferential_origin" | "preference_reason" | "preference_source"> {
  if (rules.asteriskMarkerRule) {
    const decl = declarations.find((d) => d.kind === "asterisk_preferential_marker");
    if (lineHasPreferentialAsteriskMarker(description)) {
      return {
        preferential_origin: "YES",
        preference_reason: decl
          ? `Line marked with (*) per invoice declaration: "${decl.text}".`
          : "Line marked with (*) — preferential origin per invoice asterisk rule.",
        preference_source: "invoice_declaration",
      };
    }
    return {
      preferential_origin: "NO",
      preference_reason: decl
        ? `Line not marked with (*) — without preferential origin: "${decl.text}".`
        : "Line not marked with (*) — without preferential origin per invoice asterisk rule.",
      preference_source: "invoice_declaration",
    };
  }

  if (rules.explicitNo.has(position)) {
    const decl = declarations.find(
      (d) => d.kind === "eur1_except_positions" && d.excluded_positions?.includes(position)
    );
    return {
      preferential_origin: "NO",
      preference_reason: decl
        ? `Position ${position} excluded from EUR.1 / preferential coverage: "${decl.text}".`
        : `Position ${position} explicitly excluded from preferential origin coverage.`,
      preference_source: "excluded_positions_list",
    };
  }

  if (rules.explicitYes.has(position)) {
    const decl = declarations.find(
      (d) => d.kind === "positions_preferential_yes" && d.positions?.includes(position)
    );
    return {
      preferential_origin: "YES",
      preference_reason: decl
        ? `Position ${position} named in invoice preferential origin declaration: "${decl.text}".`
        : `Position ${position} listed as preferential origin in invoice declaration.`,
      preference_source: "invoice_declaration",
    };
  }

  if (rules.blanketAllYes) {
    const decl = declarations.find((d) => d.kind === "all_products_preferential");
    return {
      preferential_origin: "YES",
      preference_reason: decl
        ? `Blanket preferential origin declaration applies: "${decl.text}".`
        : "All products on invoice declared as preferential origin.",
      preference_source: "invoice_declaration",
    };
  }

  if (rules.eur1Except.size > 0 && !rules.eur1Except.has(position)) {
    const decl = declarations.find((d) => d.kind === "eur1_except_positions");
    if (rules.eur1CoversRemainingExplicit) {
      return {
        preferential_origin: "YES",
        preference_reason: decl
          ? `EUR.1 declaration explicitly covers all remaining positions (not in excluded list): "${decl.text}".`
          : "EUR.1 explicitly applies to all remaining non-excluded positions.",
        preference_source: "invoice_declaration",
      };
    }
    return {
      preferential_origin: "UNKNOWN",
      preference_reason: decl
        ? `EUR.1 excludes positions ${[...rules.eur1Except].join(", ")} but does not explicitly confirm preferential origin for all remaining positions: "${decl.text}".`
        : "EUR.1 exclusion present without explicit coverage for remaining positions.",
      preference_source: "invoice_declaration",
    };
  }

  if (
    rules.authorisedExporterPresent &&
    rules.originDeclarationPresent &&
    rules.explicitYes.size === 0
  ) {
    const decl = declarations.find(
      (d) => d.kind === "authorised_exporter" || d.kind === "all_products_preferential"
    );
    return {
      preferential_origin: "YES",
      preference_reason: decl
        ? `Authorised exporter origin declaration: "${decl.text.slice(0, 120)}".`
        : "Authorised exporter origin declaration detected on invoice.",
      preference_source: "authorised_exporter_statement",
    };
  }

  if (rules.exceptOtherwiseIndicated) {
    return {
      preferential_origin: "UNKNOWN",
      preference_reason:
        '"Except where otherwise indicated" present — no line-specific indication extracted for this position.',
      preference_source: "invoice_declaration",
    };
  }

  if (rules.supplierRef) {
    return {
      preferential_origin: "UNKNOWN",
      preference_reason:
        "Supplier declaration (STSD/LTSD) referenced — preferential status not mapped to this line without explicit position linkage.",
      preference_source: "supplier_declaration_reference",
    };
  }

  if (rules.manufacturerRef) {
    return {
      preferential_origin: "UNKNOWN",
      preference_reason:
        "Manufacturer declaration referenced — preferential status not mapped to this line without explicit position linkage.",
      preference_source: "manufacturer_declaration_reference",
    };
  }

  if (rules.authorisedExporterPresent && !rules.originDeclarationPresent) {
    return undeclaredPreference(
      countryOfOrigin,
      "Authorised exporter (REX) reference detected — does not alone prove preferential origin for this line without an invoice declaration."
    );
  }

  return undeclaredPreference(
    countryOfOrigin,
    "No explicit preferential origin declaration applies to this line. Country of origin alone does not establish preference."
  );
}

function buildSummary(
  lines: LinePreferentialOrigin[],
  declarations: DetectedDeclaration[],
  authorisedExporter: boolean
): string {
  const yes = lines.filter((l) => l.preferential_origin === "YES").length;
  const no = lines.filter((l) => l.preferential_origin === "NO").length;
  const notDeclared = lines.filter((l) => l.preferential_origin === "NOT_DECLARED").length;
  const unknown = lines.filter((l) => l.preferential_origin === "UNKNOWN").length;

  const parts = [
    `${lines.length} line(s): ${yes} preferential YES, ${no} NO, ${notDeclared} NOT_DECLARED, ${unknown} UNKNOWN.`,
  ];

  if (declarations.length > 0) {
    parts.push(`${declarations.length} declaration phrase(s) detected in invoice text.`);
  } else {
    parts.push("No preferential origin declaration phrases detected.");
  }

  if (authorisedExporter) {
    parts.push("Authorised exporter statement present.");
  }

  parts.push("Preferential origin was not inferred from country of origin alone.");

  return parts.join(" ");
}

/** Preferential Origin Engine — per-line preference from explicit invoice evidence only. */
export function runPreferentialOriginEngine(
  invoice: NormalizedInvoice
): PreferentialOriginEngineResult {
  const items: ApiInvoiceItem[] = invoice.items ?? [];
  const corpus = collectDeclarationCorpus(invoice);
  const declarations = detectDeclarations(corpus);
  const authDetection = detectAuthorisedExporter(corpus, invoice);
  const authorised_exporter_number = authDetection.detected
    ? authDetection.authorisation_number
    : null;
  const authorised_exporter_detected =
    authDetection.detected ||
    declarations.some((d) => d.kind === "authorised_exporter");
  const origin_declaration_found = hasOriginDeclaration(corpus);
  const rules = buildRuleState(declarations, corpus);

  const rawLines: LinePreferentialOrigin[] = items.map((item, index) => {
    const position_number = index + 1;
    const country_of_origin = item.country_of_origin?.trim() || "—";
    const description = item.description?.trim() ?? "";

    if (isNonGoodsLine(description)) {
      const isPackaging = !isServiceOrTransportLine(description);
      return {
        position_number,
        country_of_origin,
        preferential_origin: "NOT_DECLARED",
        preference_reason: isPackaging
          ? "Packaging line excluded from preferential origin analysis"
          : "Service / freight line excluded from preferential origin analysis",
        preference_source: "none",
      };
    }

    const resolved = resolveLinePreference(
      position_number,
      country_of_origin,
      item.description?.trim() ?? "",
      rules,
      declarations
    );

    return {
      position_number,
      country_of_origin,
      ...resolved,
    };
  });

  const lines = applyPreferentialOriginExceptions(invoice, rawLines);

  const has_explicit_preference_evidence = lines.some(
    (l) =>
      l.preferential_origin === "YES" ||
      l.preferential_origin === "NO" ||
      (l.preference_source !== "none" &&
        l.preference_source !== "authorised_exporter_statement")
  );

  return {
    lines,
    declarations_detected: declarations,
    authorised_exporter_detected,
    authorised_exporter_number: authorised_exporter_number || null,
    authorised_exporter_detection: authDetection,
    origin_declaration_found,
    has_explicit_preference_evidence,
    summary: buildSummary(lines, declarations, authorised_exporter_detected),
  };
}
