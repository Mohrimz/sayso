/**
 * Cookie consent, stored in a first-party cookie so both the browser (to show
 * the prompt) and the server (to refuse sign-in until accepted) can read it.
 *
 * Value: "v<version>.<accepted at, ms since epoch>". Bump CONSENT_VERSION when
 * the list of cookies changes and everyone is asked again.
 */
export const CONSENT_COOKIE = "sayso_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 12 months

/** When the current version was accepted, or null if it hasn't been. */
export function consentAcceptedAt(value: string | null | undefined): Date | null {
  const match = /^v(\d+)\.(\d+)$/.exec(value ?? "");
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  const at = new Date(Number(match[2]));
  return Number.isNaN(at.getTime()) ? null : at;
}

export function consentValue(now = Date.now()) {
  return `v${CONSENT_VERSION}.${now}`;
}

/** What the portal stores in the browser, shown in the prompt and the Privacy Policy. */
export const STORED_ITEMS = [
  { name: "Sign-in session", purpose: "Keeps you signed in and protects your account.", lasts: "Until you sign out" },
  { name: "Your cookie choice", purpose: "Remembers that you accepted, so we don't ask every time.", lasts: "12 months" },
  {
    name: "Sayso assistant (agency staff only)",
    purpose:
      "This browser remembers which assistant chat you had open last and your answer mode (Quick, Auto or Deep), in local storage, not a cookie. The conversations themselves are saved to your account.",
    lasts: "Until you clear it",
  },
] as const;

export const CONSENT_REQUIRED_MESSAGE = "Please accept cookies first. They're needed to keep you signed in.";
