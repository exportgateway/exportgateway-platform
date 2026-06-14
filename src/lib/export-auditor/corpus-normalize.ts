/**
 * Normalize multi-page OCR / PDF text corpora before field extraction.
 */

/** Page markers such as `-- 1 of 3 --` or `1 of 3` inserted by PDF extractors. */
const PDF_PAGE_MARKER_RE =
  /^[\s\-–—]*--?\s*\d+\s+of\s+\d+\s*--?[\s\-–—]*$/gim;

export function stripPageMarkers(text: string): string {
  return text
    .replace(PDF_PAGE_MARKER_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip page markers and collapse excessive blank lines in OCR corpora. */
export function normalizeMultipageOcrCorpus(corpus: string): string {
  if (!corpus?.trim()) return corpus ?? "";
  return stripPageMarkers(corpus);
}
