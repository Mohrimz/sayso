"use server";

import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { inviteUser } from "@/lib/invites";
import { devLinksAllowed } from "@/lib/email";
import { isUuid } from "@/lib/chat";
import { deleteLogin } from "@/lib/account";
import { done, fail, friendlyError, isEmail, list, str } from "@/lib/action-helpers";
import type { ActionState } from "./types";

export async function inviteAgencyUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireAdmin();
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const role = str(fd, "role") === "admin" ? "admin" : "member";
  if (!isEmail(email)) return fail("Enter a valid email address.");
  if (!name) return fail("Enter their name.");

  const result = await inviteUser({ email, name, side: "agency", agencyRole: role, invitedBy: viewer.name, invitedByEmail: viewer.email });
  if ("error" in result) return fail(result.error);
  refresh();
  return done(`Invitation sent to ${email}.`, {
    data: { inviteLink: result.link },
    devLink: devLinksAllowed() ? result.link : undefined,
  });
}

/**
 * Sets which clients a team member works on, from the Team page: the ticked
 * clients are added, unticked ones removed. Admins see every client already.
 */
export async function setMemberClients(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const userId = str(fd, "user_id");
  if (!isUuid(userId)) return fail("Team member not found.");
  const supabase = await createClient();

  const { data: person } = await supabase.from("profiles").select("full_name, email, side, agency_role").eq("id", userId).maybeSingle();
  if (!person || person.side !== "agency") return fail("Team member not found.");
  if (person.agency_role === "admin") return fail("Admins already see every client.");

  const [{ data: workspaces }, { data: current }] = await Promise.all([
    supabase.from("workspaces").select("id"),
    supabase.from("workspace_members").select("workspace_id").eq("user_id", userId).eq("role", "team_member"),
  ]);
  const known = new Set((workspaces ?? []).map((w) => w.id));
  const wanted = new Set(list(fd, "workspace_ids").filter((id) => known.has(id)));
  const has = new Set((current ?? []).map((m) => m.workspace_id));
  const add = [...wanted].filter((id) => !has.has(id));
  const remove = [...has].filter((id) => !wanted.has(id));

  if (add.length) {
    const { error } = await supabase
      .from("workspace_members")
      .upsert(add.map((workspace_id) => ({ workspace_id, user_id: userId, role: "team_member" as const })), { onConflict: "workspace_id,user_id" });
    if (error) return fail(friendlyError(error));
  }
  if (remove.length) {
    const { error } = await supabase.from("workspace_members").delete().eq("user_id", userId).eq("role", "team_member").in("workspace_id", remove);
    if (error) return fail(friendlyError(error));
  }
  refresh();
  const name = person.full_name || person.email;
  return done(wanted.size ? `${name} now works on ${wanted.size} client${wanted.size === 1 ? "" : "s"}.` : `${name} isn't assigned to any client.`);
}

/**
 * Removes someone from the agency team: their login is deleted, so they lose
 * access straight away. Their past work stays, shown as "Former member".
 */
export async function removeAgencyMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireAdmin();
  const userId = str(fd, "user_id");
  if (!isUuid(userId)) return fail("Team member not found.");
  if (userId === viewer.id) return fail("You can't remove yourself. Another admin can, or delete your account from the Account page.");

  const supabase = await createClient();
  const { data: person } = await supabase.from("profiles").select("full_name, email, side").eq("id", userId).maybeSingle();
  if (!person || person.side !== "agency") return fail("Team member not found.");

  const removed = await deleteLogin(userId);
  if (!removed.ok) return fail("They couldn't be removed. Please try again.");
  refresh();
  return done(`${person.full_name || person.email} has been removed from the team.`);
}

export async function setAgencyRole(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireAdmin();
  const userId = str(fd, "user_id");
  const role = str(fd, "role") === "admin" ? "admin" : "member";
  if (userId === viewer.id && role !== "admin") return fail("You can't remove your own admin access.");

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ agency_role: role }).eq("id", userId).eq("side", "agency");
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Role updated.");
}
