/**
 * Logins the agency hands a client before it knows their email address, such
 * as acme@sayso.mohrimz.com. Nobody reads these inboxes, so nothing is ever
 * emailed to them. The client switches to their own address during their
 * first sign-in.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "sayso.mohrimz.com";

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`));
}
