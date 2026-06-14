/**
 * Exclude date fragments from monetary candidate extraction (e.g. 21.05 from 21.05.2026).
 */

const FULL_DATE_TOKEN_RE = /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/;

/** True when a numeric token is part of or equal to a calendar date in the corpus. */
export function isDateLikeMonetaryToken(
  corpus: string,
  matchIndex: number,
  rawToken: string
): boolean {
  const token = rawToken.trim();
  if (!token) return true;

  if (FULL_DATE_TOKEN_RE.test(token)) return true;

  const after = corpus.slice(matchIndex + token.length, matchIndex + token.length + 10);
  if (/^[./-]\d{2,4}\b/.test(after)) return true;

  const before = corpus.slice(Math.max(0, matchIndex - 6), matchIndex);
  if (/\b\d{1,2}[./-]$/.test(before) && /^\d{1,2}\b/.test(token)) return true;

  const window = corpus.slice(Math.max(0, matchIndex - 2), matchIndex + token.length + 8);
  if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(window) && window.includes(token)) {
    return true;
  }

  return false;
}
