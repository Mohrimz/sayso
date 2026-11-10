"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CONSENT_COOKIE, CONSENT_REQUIRED_MESSAGE, consentAcceptedAt } from "@/lib/consent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSignInLink, findProfileByEmail } from "@/lib/invites";
import { hasAgencyAdmin } from "@/lib/setup";
import { homeFor } from "@/lib/home";
import { devLinksAllowed, renderEmail, sendEmail } from "@/lib/email";
import { APP_NAME } from "@/lib/env";
import { done, fail, isEmail, str } from "@/lib/action-helpers";
import { safeNext } from "@/lib/utils";
import { arrivalUrl } from "@/lib/arrival";
import { isPlaceholderEmail } from "@/lib/placeholder-email";
import type { ActionState } from "./types";

/** Sign-in needs the cookie choice to have been made (the prompt saves it in a cookie). */
async function consentGiven() {
  return Boolean(consentAcceptedAt((await cookies()).get(CONSENT_COOKIE)?.value));
}

export async function signInWithPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await consentGiven())) return fail(CONSENT_REQUIRED_MESSAGE);
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!isEmail(email) || !password) return fail("Enter your email and password.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return fail("That email and password don't match. You can also sign in with an email link.");
  const next = safeNext(str(fd, "next"));
  // Through the welcome animation, then on to where they were heading.
  redirect(arrivalUrl(next === "/" ? await homeFor(supabase, data.user.id) : next, "back"));
}

export async function sendMagicLink(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await consentGiven())) return fail(CONSENT_REQUIRED_MESSAGE);
  const email = str(fd, "email").toLowerCase();
  if (!isEmail(email)) return fail("Enter a valid email address.");
  if (isPlaceholderEmail(email)) return fail("This login uses a password. Choose Password above and enter the one you were given.");
  const next = safeNext(str(fd, "next"));
  const sent = done(`Check ${email}: a sign-in link is on its way. It works once and expires in an hour.`);

  // The agency chose to tell people plainly when they aren't part of Sayso:
  // no account, or a client who's no longer in any client workspace.
  const notMember = fail(`${email} isn't part of ${APP_NAME}. If you think it should be, ask the person who invited you.`);
  const profile = await findProfileByEmail(email);
  if (!profile) return notMember;
  if (profile.side === "client") {
    const { count } = await createAdminClient()
      .from("workspace_members")
      .select("workspace_id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    if (!count) return notMember;
  }

  const link = await createSignInLink({ email, type: "magiclink", next });
  if ("error" in link) return fail("We couldn't create a sign-in link. Please try again.");

  const { html, text } = renderEmail({
    heading: `Sign in to ${APP_NAME}`,
    preheader: `Your sign-in link for ${APP_NAME}.`,
    paragraphs: [`Use the button below to sign in as ${email}.`],
    cta: { label: "Sign in", url: link.url },
    note: "This link expires in an hour and can only be used once.",
    reason: "If you didn't try to sign in, you can safely ignore this email.",
  });
  await sendEmail({ to: email, subject: `Your sign-in link for ${APP_NAME}`, html, text });

  return devLinksAllowed() ? { ...sent, devLink: link.url } : sent;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** First-run setup: creates the first agency admin. Disabled once one exists. */
export async function setupFirstAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  if (await hasAgencyAdmin()) return fail("Setup is already complete. Sign in instead.");
  if (!(await consentGiven())) return fail(CONSENT_REQUIRED_MESSAGE);

  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!name) return fail("Enter your name.");
  if (!isEmail(email)) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Use a password of at least 8 characters.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) return fail(error?.message ?? "Could not create the account.");

  const { error: profileError } = await admin
    .from("profiles")
    .update({ side: "agency", agency_role: "admin", full_name: name })
    .eq("id", data.user.id);
  if (profileError) return fail(profileError.message);

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect(arrivalUrl("/dashboard", "new"));
}
