export const COOKIE_CONSENT_KEY = "eg-cookie-consent-v1";

export type CookieCategory = "necessary" | "analytics" | "marketing";

export interface CookieConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

export const defaultCookieConsent = (): CookieConsentState => ({
  necessary: true,
  analytics: false,
  marketing: false,
  decidedAt: new Date().toISOString(),
});

export function readCookieConsent(): CookieConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentState;
    if (parsed.necessary !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCookieConsent(state: CookieConsentState): void {
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(state));
}
