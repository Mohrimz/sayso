"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyWorkspaces, requireViewer } from "@/lib/auth";
import { sendEmailChangeLink } from "@/lib/email-change-link";
import { done, fail, friendlyError, str } from "@/lib/action-helpers";
import type { ActionState } from "./types";

const PHONE_RE = /^[+()0-9\s.-]{5,40}$/;

/** First sign-in setup, step 1: name, job title and phone (the profile the team sees). */
export async function saveOnboardingProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const name = str(fd, "name");
  const jobTitle = str(fd, "job_title");
  const phone = str(fd, "phone");
  if (!name) return fail("Enter your name.");
  if (!jobTitle) return fail("Enter your job title, such as Founder or Marketing manager.");
  if (!phone) return fail("Enter a phone number the team can reach you on.");
  if (name.length > 80 || jobTitle.length > 80) return fail("Keep your name and job title under 80 characters.");
  if (!PHONE_RE.test(phone)) return fail("Enter a phone number using digits, spaces and + ( ) - only.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name, job_title: jobTitle, phone }).eq("id", viewer.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Saved.");
}

/**
 * Step 3, for placeholder logins the agency made (e.g. acme@sayso.mohrimz.com):
 * their own email address (confirmed by a link) and a password only they know.
 */
export async function saveSignInDetails(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const password = str(fd, "password");
  if (password.length < 8) return fail("Choose a password of at least 8 characters.");
  if (password !== str(fd, "password_confirm")) return fail("The two passwords don't match.");

  // The email checks come first, so a bad address doesn't leave a half-saved step.
  const email = str(fd, "email");
  if (!email) return fail("Enter your email address.");
  const supabase = await createClient();
  if (viewer.placeholderEmail) {
    const result = await sendEmailChangeLink(viewer, email);
    if ("error" in result) return fail(result.error);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return fail(error.message);
    return done(result.message, { devLink: result.devLink });
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error.message);
  return done("Password saved.");
}

/** Last step: setup is done. Opens their client home, with the walkthrough if they want it. */
export async function finishOnboarding(withTour: boolean) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", viewer.id);
  if (error) throw new Error("Your setup couldn't be saved. Please try again.");
  const [workspace] = await getMyWorkspaces();
  const home = workspace ? `/w/${workspace.slug}` : "/";
  // The setup screen lives in the shared layout, so re-render it on the way out.
  revalidatePath("/", "layout");
  redirect(withTour && workspace ? `${home}?tour=1` : home);
}
