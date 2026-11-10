"use server";

import { refresh } from "next/cache";
import { listFolder, removeFiles } from "@/lib/files";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireViewer } from "@/lib/auth";
import { isOnlyAgencyAdmin } from "@/lib/account";
import { CONSENT_COOKIE } from "@/lib/consent";
import { sendEmailChangeLink } from "@/lib/email-change-link";
import { bool, done, fail, friendlyError, str } from "@/lib/action-helpers";
import { safeNext } from "@/lib/utils";
import type { ActionState } from "./types";

const PHONE_RE = /^[+()0-9\s.-]{5,40}$/;

/** Name, job title and phone number. */
export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const name = str(fd, "name");
  const jobTitle = str(fd, "job_title");
  const phone = str(fd, "phone");
  if (!name) return fail("Enter your name.");
  if (name.length > 80) return fail("Use a shorter name (80 characters at most).");
  if (jobTitle.length > 80) return fail("Use a shorter job title (80 characters at most).");
  if (phone && !PHONE_RE.test(phone)) return fail("Enter a phone number using digits, spaces and + ( ) - only.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: name, job_title: jobTitle || null, phone: phone || null })
    .eq("id", viewer.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Profile saved.");
}

/**
 * Sets (or clears) the profile picture after the browser has uploaded it to
 * the viewer's own folder, then removes the previous file.
 */
export async function setAvatar(path: string | null): Promise<{ ok: boolean; error?: string }> {
  const viewer = await requireViewer();
  if (path !== null && (typeof path !== "string" || !path.startsWith(`${viewer.id}/`) || path.includes("..") || path.length > 200)) {
    return { ok: false, error: "That picture couldn't be saved." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", viewer.id);
  if (error) return { ok: false, error: friendlyError(error) };
  if (viewer.avatarPath && viewer.avatarPath !== path) {
    await removeFiles("avatars", [viewer.avatarPath]).catch(() => undefined);
  }
  // The editor refreshes the page (and the sidebar picture) itself.
  return { ok: true };
}

/** Emails a confirmation link to the new address; the change happens when it's clicked. */
export async function requestEmailChange(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const result = await sendEmailChangeLink(viewer, str(fd, "email"));
  if ("error" in result) return fail(result.error);
  return done(result.message, { devLink: result.devLink });
}

/** Withdraws cookie consent on this browser. Sign-in needs those cookies, so this also signs out here. */
export async function withdrawCookieConsent() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(CONSENT_COOKIE);
  redirect("/login");
}

/** Signs out every browser and device, including this one. */
export async function signOutEverywhere() {
  await requireViewer();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?signedout=all");
}

/**
 * Permanently deletes the signed-in person's account. Their comments,
 * approvals and messages stay (shown as "Former member") so the record of
 * what was agreed is kept; their profile, picture and access are removed.
 */
export async function deleteAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  if (str(fd, "confirm").toLowerCase() !== viewer.email.toLowerCase()) {
    return fail("Type your email address exactly as shown to confirm.");
  }

  if (await isOnlyAgencyAdmin(viewer)) {
    return fail("You're the only agency admin. Make someone else an admin on the Team page first, so nobody is locked out.");
  }

  const admin = createAdminClient();
  await removeFiles("avatars", await listFolder("avatars", viewer.id).catch(() => [])).catch(() => undefined);

  const { error } = await admin.auth.admin.deleteUser(viewer.id);
  if (error) {
    console.error("[account] delete failed", error.message);
    return fail("We couldn't delete your account. Please try again, or ask your agency contact.");
  }

  // The session belongs to a user that no longer exists: clear it.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.startsWith("sb-")) jar.delete(c.name);
  redirect("/login?deleted=1");
}

export async function updateNotificationPrefs(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      notification_prefs: {
        email_approvals: bool(fd, "email_approvals"),
        email_comments: bool(fd, "email_comments"),
        email_changes: bool(fd, "email_changes"),
        email_tasks: bool(fd, "email_tasks"),
        email_messages: bool(fd, "email_messages"),
        // Only the agency team sees this switch; keep a client's stored value as it is.
        email_offers: viewer.side === "agency" ? bool(fd, "email_offers") : viewer.prefs.email_offers,
      },
    })
    .eq("id", viewer.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Notification settings saved.");
}

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireViewer();
  const password = str(fd, "password");
  if (password.length < 8) return fail("Use at least 8 characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error.message);
  return done("Password updated.");
}

/** Welcome step for invited users: confirm name, optionally set a password. */
export async function completeWelcome(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const name = str(fd, "name");
  const password = str(fd, "password");
  if (!name) return fail("Enter your name.");
  if (password && password.length < 8) return fail("Use a password of at least 8 characters, or leave it blank.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", viewer.id);
  if (error) return fail(friendlyError(error));
  if (password) {
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) return fail(pwError.message);
  }
  redirect(safeNext(str(fd, "next")));
}
