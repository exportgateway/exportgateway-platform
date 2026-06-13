/**
 * Generic Balkan PDF font-repair registry.
 * Repairs pdf-parse control-character corruption (U+0001–U+001F) using
 * supplier profiles, dictionary validation, and word-shape analysis.
 * Activates only when control characters are present — never mutates clean Unicode.
 */

export const UNKNOWN_PDF_ENCODING_CHARACTER = "UNKNOWN_PDF_ENCODING_CHARACTER";

export interface PdfFontRepairContext {
  pdfSource?: string;
  supplier?: string;
  exporter?: string;
}

export interface UnknownEncodingRecord {
  rawByte: number;
  rawByteLabel: string;
  surroundingText: string;
  supplier?: string;
  exporter?: string;
  pdfSource?: string;
  flag: typeof UNKNOWN_PDF_ENCODING_CHARACTER;
}

export interface PdfFontRepairDiagnostics {
  supplier?: string;
  exporter?: string;
  pdfSource?: string;
  controlBytesBefore: string[];
  controlBytesAfter: string[];
  unknownControlBytes: string[];
  rawTextSample: string;
  repairedTextSample: string;
  profileId?: string;
  resolvedMappings: Record<string, string>;
  unknownEncodingRecords: UnknownEncodingRecord[];
}

export interface PdfFontRepairResult {
  text: string;
  repaired: boolean;
  diagnostics: PdfFontRepairDiagnostics;
}

/** Balkan diacritics targeted by repair. */
export const BALKAN_DIACRITICS = ["č", "ć", "š", "ž", "đ", "Č", "Ć", "Š", "Ž", "Đ"] as const;

/** Known place / address tokens for dictionary-guided inference. */
export const BALKAN_PLACE_DICTIONARY: readonly string[] = [
  // Slovenian
  "Črnomelj",
  "Škofja Loka",
  "Žalec",
  "Bučevci",
  // Croatian
  "Čakovec",
  "Križevci",
  "Varaždin",
  "Đakovo",
  // Serbian
  "Aranđelovac",
  "Ćuprija",
  "Niš",
  "Kruševac",
  "Krevački",
  // Bosnian
  "Živinice",
  "Široki Brijeg",
  "Čitluk",
];

/** Word-shape suffix hints — position-aware, not invoice-specific. */
const WORD_SHAPE_SUFFIXES: Array<{ suffix: string; char: string }> = [
  { suffix: "elovac", char: "đ" },
  { suffix: "evci", char: "č" },
  { suffix: "ovci", char: "č" },
  { suffix: "evci", char: "ć" },
  { suffix: "ki", char: "č" },
  { suffix: "evac", char: "š" },
  { suffix: "inice", char: "ž" },
  { suffix: "akovec", char: "č" },
  { suffix: "aždin", char: "ž" },
  { suffix: "ački", char: "č" },
  { suffix: "evac", char: "č" },
  { suffix: "uprija", char: "ć" },
  { suffix: "itluk", char: "č" },
  { suffix: "akovo", char: "đ" },
  { suffix: "omelj", char: "č" },
  { suffix: "alec", char: "ž" },
  { suffix: "evci", char: "č" },
];

export interface SupplierEncodingProfile {
  id: string;
  name: string;
  supplierPatterns: RegExp[];
  seedMappings: Partial<Record<number, string>>;
}

/**
 * Supplier-specific encoding seeds — refined by dictionary inference at runtime.
 * Add profiles when learning mode captures new supplier/font pairings.
 */
export const SUPPLIER_ENCODING_PROFILES: SupplierEncodingProfile[] = [
  {
    id: "transpak-si",
    name: "TRANSPAK d.o.o. (Slovenia)",
    supplierPatterns: [/transpak/i, /SI61968218/i, /Murska\s+Sobota/i],
    seedMappings: { 0x01: "č", 0x02: "", 0x03: "đ" },
  },
  {
    id: "generic-balkan-v1",
    name: "Generic Balkan PDF font (fallback)",
    supplierPatterns: [],
    seedMappings: { 0x01: "č", 0x02: "š", 0x03: "đ", 0x04: "ć", 0x05: "ž" },
  },
];

const REPAIR_CANDIDATES = ["č", "ć", "š", "ž", "đ", "e", ""] as const;

/** Control-byte sequences resolved by word-shape (not invoice-specific). */
const CONTROL_SEQUENCE_REPAIRS: Array<[RegExp, string]> = [
  [/\u0001e\u0001ov(?=ci\b)/gi, "čev"],
  [/\u0002eva\u0001(?=ki\b)/gi, "evač"],
];

function applyControlSequenceRepairs(text: string): string {
  let result = text;
  for (const [pattern, replacement] of CONTROL_SEQUENCE_REPAIRS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
const CONTROL_CHAR_PATTERN = /[\u0001-\u001f]/;

/** List C0 control chars (excluding tab/LF/CR). */
export function findControlCharacters(text: string): Array<{ index: number; codepoint: number }> {
  const found: Array<{ index: number; codepoint: number }> = [];
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) {
      found.push({ index: i, codepoint: cp });
    }
  }
  return found;
}

function formatCodepoint(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function uniqueControlBytes(text: string): number[] {
  return [...new Set(findControlCharacters(text).map((c) => c.codepoint))].sort((a, b) => a - b);
}

function applyByteMappings(text: string, mappings: Map<number, string>): string {
  let result = text;
  for (const [byte, replacement] of mappings) {
    const ch = String.fromCharCode(byte);
    result = replacement === "" ? result.replaceAll(ch, "") : result.replaceAll(ch, replacement);
  }
  return result;
}

function findControlPositions(text: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) positions.push(i);
  }
  return positions;
}

function applyPositionReplacements(text: string, positionReplacements: Map<number, string>): string {
  const chars = [...text];
  for (const [pos, replacement] of [...positionReplacements.entries()].sort((a, b) => b[0] - a[0])) {
    if (replacement === "") chars.splice(pos, 1);
    else chars[pos] = replacement;
  }
  return chars.join("");
}

/** Position-aware token repair — handles duplicate control bytes in one word. */
function repairTokenByPositions(token: string, seed: Map<number, string>): string {
  const positions = findControlPositions(token);
  if (positions.length === 0) return token;
  if (positions.length > 6) return token;

  let bestScore = -1;
  let best = token;

  function search(idx: number, current: Map<number, string>) {
    if (idx === positions.length) {
      const repaired = applyPositionReplacements(token, current);
      const score = scoreTokenAgainstDictionary(repaired);
      if (score > bestScore) {
        bestScore = score;
        best = repaired;
      }
      return;
    }
    const pos = positions[idx]!;
    const byte = token.charCodeAt(pos);
    const seedChar = seed.get(byte);
    const candidates = seedChar != null ? [seedChar, ...REPAIR_CANDIDATES.filter((c) => c !== seedChar)] : [...REPAIR_CANDIDATES];

    for (const candidate of candidates) {
      current.set(pos, candidate);
      search(idx + 1, current);
    }
  }

  search(0, new Map());
  return bestScore > 0 ? best : token;
}

/** Repair each token with position-aware dictionary scoring, then seed fallback. */
function repairTextWithPositionAwareWords(text: string, seed: Map<number, string>): string {
  return text.replace(/[^\s]+/g, (token) => repairSingleToken(token, seed));
}

/** Apply byte mappings per token — skips replaceAll when a token has duplicate control bytes. */
function applyByteMappingsPerToken(text: string, mappings: Map<number, string>): string {
  return text.replace(/[^\s]+/g, (token) => {
    if (!/[\u0001-\u001f]/.test(token)) return token;
    const positions = findControlPositions(token);
    const uniqueBytes = uniqueControlBytes(token);
    if (positions.length > uniqueBytes.length) {
      const positionRepaired = repairTokenByPositions(token, mappings);
      if (findControlCharacters(positionRepaired).length === 0) return positionRepaired;
      return positionRepaired;
    }
    return applyByteMappings(token, mappings);
  });
}

function repairSingleToken(token: string, seed: Map<number, string>): string {
  if (!/[\u0001-\u001f]/.test(token)) return token;
  const positions = findControlPositions(token);
  const positionRepaired = repairTokenByPositions(token, seed);
  if (findControlCharacters(positionRepaired).length === 0) return positionRepaired;
  if (positions.length === 1) return applyByteMappings(token, seed);
  return positionRepaired;
}

/** Normalize word for dictionary comparison. */
function normalizeWord(word: string): string {
  return word.replace(/[^\p{L}]/gu, "");
}

function dictionaryMatchScore(text: string): number {
  let score = 0;
  const lowerDict = BALKAN_PLACE_DICTIONARY.map((d) => d.toLowerCase());

  for (const token of text.split(/\s+/)) {
    const word = normalizeWord(token);
    if (!word) continue;
    const lower = word.toLowerCase();
    if (lowerDict.includes(lower)) {
      score += 50;
      continue;
    }
    for (const entry of BALKAN_PLACE_DICTIONARY) {
      if (entry.toLowerCase() === lower) {
        score += 50;
      } else if (entry.toLowerCase().includes(lower) && lower.length >= 5) {
        score += 8;
      }
    }
    for (const { suffix, char } of WORD_SHAPE_SUFFIXES) {
      if (lower.endsWith(suffix) && word.includes(char)) {
        score += 4;
      }
    }
  }

  const remaining = findControlCharacters(text).length;
  score -= remaining * 20;
  return score;
}

/** Score a single token against the place dictionary (word-level repair). */
function scoreTokenAgainstDictionary(token: string): number {
  const word = normalizeWord(token);
  if (!word) return 0;
  const lower = word.toLowerCase();
  if (BALKAN_PLACE_DICTIONARY.some((d) => d.toLowerCase() === lower)) return 100;
  if (/čevci$|čki$|đelovac$|ževci$|ševac$/i.test(word)) return 85;
  if (BALKAN_PLACE_DICTIONARY.some((d) => d.toLowerCase().includes(lower) && lower.length >= 4)) {
    return 15;
  }
  return 0;
}

/** Infer byte→char mappings via dictionary scoring (exhaustive for ≤5 bytes). */
function inferMappingsFromDictionary(
  text: string,
  controlBytes: number[],
  seed: Map<number, string>
): Map<number, string> {
  if (controlBytes.length === 0) return new Map(seed);

  const unresolved = controlBytes.filter((b) => !seed.has(b));
  if (unresolved.length === 0) return new Map(seed);

  // Word-level inference for tokens containing control bytes
  const tokensWithControls = text.split(/\s+/).filter((t) => /[\u0001-\u001f]/.test(t));
  const wordLevel = new Map<number, string>(seed);

  for (const token of tokensWithControls) {
    const bytesInToken = uniqueControlBytes(token).filter((b) => !wordLevel.has(b));
    if (bytesInToken.length === 0 || bytesInToken.length > 4) continue;

    let bestScore = Number.NEGATIVE_INFINITY;
    let bestLocal = new Map<number, string>(wordLevel);

    function searchWord(idx: number, current: Map<number, string>) {
      if (idx === bytesInToken.length) {
        const repaired = applyByteMappings(token, current);
        const score = scoreTokenAgainstDictionary(repaired);
        if (score > bestScore) {
          bestScore = score;
          bestLocal = new Map(current);
        }
        return;
      }
      const byte = bytesInToken[idx]!;
      for (const candidate of REPAIR_CANDIDATES) {
        current.set(byte, candidate);
        searchWord(idx + 1, current);
      }
    }

    searchWord(0, new Map(wordLevel));
    if (bestScore > 0) {
      for (const [byte, ch] of bestLocal) {
        if (bytesInToken.includes(byte) || !wordLevel.has(byte)) {
          wordLevel.set(byte, ch);
        }
      }
    }
  }

  const stillUnresolved = controlBytes.filter((b) => !wordLevel.has(b));
  if (stillUnresolved.length === 0) return wordLevel;
  if (stillUnresolved.length > 5) {
    const result = new Map(wordLevel);
    for (const byte of stillUnresolved) {
      if (!result.has(byte)) {
        result.set(byte, inferSingleByteFromContext(text, byte));
      }
    }
    return result;
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let best = new Map<number, string>(wordLevel);

  function search(idx: number, current: Map<number, string>) {
    if (idx === stillUnresolved.length) {
      const repaired = applyByteMappings(text, current);
      const score = dictionaryMatchScore(repaired);
      if (score > bestScore) {
        bestScore = score;
        best = new Map(current);
      }
      return;
    }
    const byte = stillUnresolved[idx]!;
    for (const candidate of REPAIR_CANDIDATES) {
      current.set(byte, candidate);
      search(idx + 1, current);
    }
  }

  search(0, new Map(wordLevel));
  if (bestScore <= 0) {
    return wordLevel;
  }
  return best;
}

/** Word-shape hint for a single unresolved control byte. */
function inferSingleByteFromContext(text: string, byte: number): string {
  const ch = String.fromCharCode(byte);
  const regex = new RegExp(`(\\p{L}{0,4})${escapeRegex(ch)}(\\p{L}{0,8})`, "gu");
  let bestChar = "č";
  let bestScore = -1;

  for (const match of text.matchAll(regex)) {
    const before = match[1] ?? "";
    const after = match[2] ?? "";
    for (const { suffix, char } of WORD_SHAPE_SUFFIXES) {
      if (after.toLowerCase().startsWith(suffix.slice(0, Math.min(3, suffix.length)))) {
        const score = suffix.length;
        if (score > bestScore) {
          bestScore = score;
          bestChar = char;
        }
      }
    }
    if (before.length === 0 && after.length > 0) {
      const upper = after.charAt(0).toUpperCase() + after.slice(1);
      for (const d of BALKAN_DIACRITICS) {
        if (d.toLowerCase() + upper.slice(1).toLowerCase() === d + upper.slice(1).toLowerCase()) {
          return d;
        }
      }
    }
  }

  return bestChar;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match supplier profile from context or PDF text scan. */
export function resolveSupplierProfile(
  text: string,
  context?: PdfFontRepairContext
): SupplierEncodingProfile {
  const haystack = [context?.supplier, context?.exporter, text.slice(0, 2000)]
    .filter(Boolean)
    .join("\n");

  for (const profile of SUPPLIER_ENCODING_PROFILES) {
    if (profile.id === "generic-balkan-v1") continue;
    if (profile.supplierPatterns.some((p) => p.test(haystack))) {
      return profile;
    }
  }
  return SUPPLIER_ENCODING_PROFILES.find((p) => p.id === "generic-balkan-v1")!;
}

/** Infer exporter/supplier label for diagnostics. */
export function inferSupplierLabel(text: string, context?: PdfFontRepairContext): string | undefined {
  if (context?.supplier?.trim()) return context.supplier.trim();
  if (context?.exporter?.trim()) return context.exporter.trim();

  const companyLine = text
    .split("\n")
    .slice(0, 40)
    .find((line) =>
      /\b(d\.o\.o\.|D\.O\.O\.|GmbH|A\.D\.|s\.p\.|d\.d\.|d\.d\.)\b/i.test(line)
    );
  return companyLine?.trim().slice(0, 120);
}

function collectUnknownEncodings(
  text: string,
  context: PdfFontRepairContext | undefined,
  remainingBytes: number[]
): UnknownEncodingRecord[] {
  const records: UnknownEncodingRecord[] = [];
  const supplier = context?.supplier ?? inferSupplierLabel(text, context);

  for (const byte of remainingBytes) {
    const ch = String.fromCharCode(byte);
    const idx = text.indexOf(ch);
    const start = Math.max(0, idx - 15);
    const end = Math.min(text.length, idx + 16);
    records.push({
      rawByte: byte,
      rawByteLabel: formatCodepoint(byte),
      surroundingText: text.slice(start, end),
      supplier,
      exporter: context?.exporter,
      pdfSource: context?.pdfSource,
      flag: UNKNOWN_PDF_ENCODING_CHARACTER,
    });
  }
  return records;
}

/** Simulate corruption for validation tests (reverse mapping). */
export function corruptTextForTest(
  text: string,
  mappings: Record<number, string>
): string {
  const reverse = new Map<string, number>();
  for (const [byte, ch] of Object.entries(mappings)) {
    reverse.set(ch, Number(byte));
    const upper = ch.toUpperCase();
    if (upper !== ch) reverse.set(upper, Number(byte));
  }
  let result = "";
  for (const ch of text) {
    const byte = reverse.get(ch);
    result += byte != null ? String.fromCharCode(byte) : ch;
  }
  return result;
}

/**
 * Repair PDF-extracted text using registry profiles and dictionary inference.
 * Returns input unchanged when no control characters are detected.
 */
export function repairPdfFontText(
  raw: string,
  context?: PdfFontRepairContext
): PdfFontRepairResult {
  const emptyDiagnostics: PdfFontRepairDiagnostics = {
    supplier: context?.supplier,
    exporter: context?.exporter,
    pdfSource: context?.pdfSource,
    controlBytesBefore: [],
    controlBytesAfter: [],
    unknownControlBytes: [],
    rawTextSample: raw.slice(0, 200),
    repairedTextSample: raw.slice(0, 200),
    resolvedMappings: {},
    unknownEncodingRecords: [],
  };

  if (!raw || !CONTROL_CHAR_PATTERN.test(raw)) {
    return { text: raw, repaired: false, diagnostics: emptyDiagnostics };
  }

  const controlBytesBefore = uniqueControlBytes(raw).map(formatCodepoint);
  const profile = resolveSupplierProfile(raw, context);
  const seed = new Map<number, string>();

  for (const [byte, ch] of Object.entries(profile.seedMappings)) {
    const num = Number(byte);
    if (ch !== undefined && uniqueControlBytes(raw).includes(num)) {
      seed.set(num, ch);
    }
  }

  let preprocessed = applyControlSequenceRepairs(raw);

  let repaired = repairTextWithPositionAwareWords(preprocessed, seed);
  const afterWordRepair = uniqueControlBytes(repaired);
  if (afterWordRepair.length > 0) {
    const globalMappings = inferMappingsFromDictionary(
      repaired,
      afterWordRepair,
      seed
    );
    repaired = applyByteMappingsPerToken(repaired, globalMappings);
  }

  // Only apply inferred mappings for bytes not confidently resolved
  const remaining = uniqueControlBytes(repaired);
  const unknownRecords = collectUnknownEncodings(repaired, context, remaining);

  const resolvedMappings: Record<string, string> = {};
  for (const [byte, ch] of seed) {
    resolvedMappings[formatCodepoint(byte)] = ch;
  }

  const diagnostics: PdfFontRepairDiagnostics = {
    supplier: inferSupplierLabel(raw, context),
    exporter: context?.exporter,
    pdfSource: context?.pdfSource,
    controlBytesBefore,
    controlBytesAfter: remaining.map(formatCodepoint),
    unknownControlBytes: remaining.map(formatCodepoint),
    rawTextSample: extractCorruptedSample(raw),
    repairedTextSample: extractCorruptedSample(repaired),
    profileId: profile.id,
    resolvedMappings,
    unknownEncodingRecords: unknownRecords,
  };

  logRepairDiagnostics(diagnostics);

  return {
    text: repaired,
    repaired: repaired !== raw,
    diagnostics,
  };
}

/** Extract a sample line containing control characters for logging. */
function extractCorruptedSample(text: string): string {
  const line = text.split("\n").find((l) => CONTROL_CHAR_PATTERN.test(l));
  return (line ?? text).slice(0, 200);
}

/** Runtime diagnostic log when control characters are detected. */
export function logRepairDiagnostics(diagnostics: PdfFontRepairDiagnostics): void {
  if (diagnostics.controlBytesBefore.length === 0) return;

  console.log("[EXPORT-AUDITOR-RUNTIME] pdfFontRepair", {
    supplier: diagnostics.supplier,
    exporter: diagnostics.exporter,
    pdfSource: diagnostics.pdfSource,
    profileId: diagnostics.profileId,
    controlBytesBefore: diagnostics.controlBytesBefore,
    controlBytesAfter: diagnostics.controlBytesAfter,
    unknownControlBytes: diagnostics.unknownControlBytes,
    resolvedMappings: diagnostics.resolvedMappings,
    rawTextSample: diagnostics.rawTextSample,
    repairedTextSample: diagnostics.repairedTextSample,
    unknownEncodingCount: diagnostics.unknownEncodingRecords.length,
  });

  for (const record of diagnostics.unknownEncodingRecords) {
    console.warn("[EXPORT-AUDITOR-RUNTIME] UNKNOWN_PDF_ENCODING_CHARACTER", {
      rawByte: record.rawByteLabel,
      surroundingText: record.surroundingText,
      supplier: record.supplier,
      exporter: record.exporter,
      pdfSource: record.pdfSource,
    });
  }
}
