import "server-only";
import type { Viewer } from "@/lib/auth";
import { isEmail } from "@/lib/action-helpers";
import { createEmailChangeToken } from "@/lib/email-change";
import { devLinksAllowed, renderEmail, sendEmail } from "@/lib/email";
import { APP_NAME, SITE_URL } from "@/lib/env";
import { findProfileByEmail } from "@/lib/invites";
import { isPlaceholderEmail } from "@/lib/placeholder-email";

/**
 * Emails a confirmation link to the new address. Nothing changes until it's
 * clicked (see /auth/change-email). Used by the Account page and by a client's
 * first sign-in setup.
 */
export async function sendEmailChangeLink(viewer: Viewer, rawEmail: string): Promise<{ error: string } | { message: string; devLink?: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  if (email === viewer.email.toLowerCase()) return { error: "That's already your email address." };
  if (isPlaceholderEmail(email)) return { error: "Enter your own email address, the one you read every day." };
  const taken = await findProfileByEmail(email);
  if (taken) return { error: "That email address can't be used. It may already belong to another account." };

  const token = createEmailChangeToken({ userId: viewer.id, from: viewer.email, to: email });
  const link = `${SITE_URL}/auth/change-email?token=${encodeURIComponent(token)}`;

  const confirm = renderEmail({
    heading: "Confirm your new email address",
    preheader: `Confirm this address for your ${APP_NAME} account.`,
    reason: `This email was sent to ${email} because someone asked to use it for a ${APP_NAME} account.`,
    paragraphs: [
      `${viewer.name}, you asked to sign in to ${APP_NAME} with this address instead of ${viewer.email}.`,
      "Confirm below to make the change. The link works for 24 hours. If you didn't ask for this, you can ignore this email.",
    ],
    cta: { label: "Confirm new email", url: link },
  });
  const sent = await sendEmail({ to: email, subject: `Confirm your new email for ${APP_NAME}`, ...confirm });
  if (!sent.ok) return { error: "We couldn't send the confirmation email. Please try again." };

  // Let the current address know, in case this wasn't them (placeholder logins have no inbox).
  const notice = renderEmail({
    heading: "Your email address is being changed",
    preheader: `Someone asked to change your ${APP_NAME} email to ${email}.`,
    paragraphs: [
      `Someone signed in as you asked to change your ${APP_NAME} email address to ${email}. Nothing changes until that address confirms it.`,
      "If this wasn't you, change your password and tell your agency contact.",
    ],
  });
  await sendEmail({ to: viewer.email, subject: `Email change requested for ${APP_NAME}`, ...notice });

  return {
    message: `Check ${email} for a confirmation link. Your email stays the same until you click it.`,
    devLink: devLinksAllowed() ? link : undefined,
  };
}
