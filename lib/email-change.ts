import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed links for changing a sign-in email address.
 *
 * The link goes to the new address, so clicking it proves the person owns
 * it. It carries the current address too and is only honoured while that is
 * still the account's email, so an old link can't undo a later change. Links
 * expire after 24 hours.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

function secret() {
  const key = process.env.EMAIL_CHANGE_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return key;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(`email-change.${payload}`).digest("base64url");
}

export type EmailChange = { userId: string; from: string; to: string };

export function createEmailChangeToken(change: EmailChange): string {
  const payload = Buffer.from(
    JSON.stringify({ u: change.userId, f: change.from.toLowerCase(), t: change.to.toLowerCase(), e: Date.now() + TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The change a token asks for, or null if it's forged, malformed or expired. */
export function readEmailChangeToken(token: string | null | undefined): EmailChange | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.u !== "string" || typeof data.f !== "string" || typeof data.t !== "string" || typeof data.e !== "number") return null;
    if (Date.now() > data.e) return null;
    return { userId: data.u, from: data.f, to: data.t };
  } catch {
    return null;
  }
}
