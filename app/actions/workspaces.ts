"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findWorkspaceAccess, requireAdmin, requireViewer } from "@/lib/auth";
import { inviteUser } from "@/lib/invites";
import { deleteLogin } from "@/lib/account";
import { APP_NAME } from "@/lib/env";
import { currentMonth } from "@/lib/dates";
import { devLinksAllowed } from "@/lib/email";
import { csv, done, fail, friendlyError, isEmail, lines, num, optNum, optStr, str } from "@/lib/action-helpers";
import { slugify } from "@/lib/utils";
import type { ApprovalRuleEntry, Colour, Faq, Font, MemberRole, SocialAccount } from "@/lib/types";
import type { ActionState } from "./types";

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "instagram | @handle | https://..." per line. */
function parseSocialAccounts(text: string): SocialAccount[] {
  return lines(text).map((line) => {
    const [platform = "", handle = "", url] = line.split("|").map((p) => p.trim());
    return { platform: platform.toLowerCase(), handle, ...(url ? { url } : {}) };
  });
}

export async function createWorkspace(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireAdmin();
  const name = str(fd, "name");
  const slug = slugify(str(fd, "slug") || name);
  const timeZone = str(fd, "time_zone") || "UTC";
  if (!name) return fail("Enter the client's business name.");
  if (!slug) return fail("Choose a web address for this workspace.");
  if (!isTimeZone(timeZone)) return fail("That time zone isn't recognised. Use a name like Europe/London.");

  const supabase = await createClient();
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({
      name,
      slug,
      website: optStr(fd, "website"),
      time_zone: timeZone,
      main_contact_name: optStr(fd, "main_contact_name"),
      main_contact_email: optStr(fd, "main_contact_email"),
      approval_rule: str(fd, "approval_rule") === "all" ? "all" : "any",
      status: "onboarding",
      quotas: {
        feed_post: num(fd, "quota_feed_post", 12),
        reel: num(fd, "quota_reel", 4),
        story: num(fd, "quota_story", 8),
        report: num(fd, "quota_report", 1),
      },
      revision_rounds: num(fd, "revision_rounds", 2),
    })
    .select("id, slug")
    .single();
  if (error || !workspace) {
    return fail(error?.code === "23505" ? "Another client already uses that web address." : friendlyError(error));
  }

  await Promise.all([
    supabase.from("packages").insert({
      workspace_id: workspace.id,
      service_name: str(fd, "service_name"),
      monthly_fee: optNum(fd, "monthly_fee"),
      currency: (str(fd, "currency") || "USD").toUpperCase(),
      start_date: optStr(fd, "start_date"),
      term_months: optNum(fd, "term_months"),
    }),
    supabase.from("brand_kits").insert({ workspace_id: workspace.id }),
    supabase.from("monthly_plans").insert({
      workspace_id: workspace.id,
      month: `${currentMonth(timeZone)}-01`,
      status: "draft",
      created_by: viewer.id,
    }),
  ]);

  redirect(`/w/${workspace.slug}/settings?created=1`);
}

async function adminAccess(workspaceId: string) {
  const access = await findWorkspaceAccess("id", workspaceId);
  return access?.can.manageWorkspace ? access : null;
}

export async function updateWorkspaceProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await adminAccess(str(fd, "workspace_id"));
  if (!access) return fail("Only agency admins can change client settings.");
  const name = str(fd, "name");
  const timeZone = str(fd, "time_zone");
  if (!name) return fail("Enter the business name.");
  if (!isTimeZone(timeZone)) return fail("That time zone isn't recognised. Use a name like Europe/London.");
  const status = str(fd, "status");

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      name,
      website: optStr(fd, "website"),
      time_zone: timeZone,
      main_contact_name: optStr(fd, "main_contact_name"),
      main_contact_email: optStr(fd, "main_contact_email"),
      social_accounts: parseSocialAccounts(str(fd, "social_accounts")),
      approval_rule: str(fd, "approval_rule") === "all" ? "all" : "any",
      status: (["onboarding", "active", "paused", "archived"].includes(status) ? status : "active") as
        | "onboarding"
        | "active"
        | "paused"
        | "archived",
    })
    .eq("id", access.workspace.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Profile saved.");
}

export async function updateWorkspaceScope(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await adminAccess(str(fd, "workspace_id"));
  if (!access) return fail("Only agency admins can change the package.");
  const supabase = await createClient();

  const { error } = await supabase
    .from("workspaces")
    .update({
      quotas: {
        feed_post: num(fd, "quota_feed_post"),
        reel: num(fd, "quota_reel"),
        story: num(fd, "quota_story"),
        report: num(fd, "quota_report"),
      },
      revision_rounds: Math.max(0, num(fd, "revision_rounds", 2)),
    })
    .eq("id", access.workspace.id);
  if (error) return fail(friendlyError(error));

  const { error: pkgError } = await supabase.from("packages").upsert({
    workspace_id: access.workspace.id,
    service_name: str(fd, "service_name"),
    monthly_fee: optNum(fd, "monthly_fee"),
    currency: (str(fd, "currency") || "USD").toUpperCase().slice(0, 3),
    start_date: optStr(fd, "start_date"),
    term_months: optNum(fd, "term_months"),
    notes: optStr(fd, "package_notes"),
  });
  if (pkgError) return fail(friendlyError(pkgError));
  refresh();
  return done("Package saved.");
}

export async function updateGoalsAndRules(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await adminAccess(str(fd, "workspace_id"));
  if (!access) return fail("Only agency admins can change goals and rules.");

  const rules: ApprovalRuleEntry[] = csv(str(fd, "all_approver_tags")).map((tag) => ({
    tag,
    requirement: "all_approvers",
    note: `Items tagged "${tag}" need sign-off from every approver.`,
  }));

  const followers: Record<string, number> = {};
  for (const line of lines(str(fd, "baseline_followers"))) {
    const [platform, count] = line.split(/[:|]/).map((p) => p.trim());
    const n = Number(count?.replace(/[, ]/g, ""));
    if (platform && Number.isFinite(n)) followers[platform.toLowerCase()] = n;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      goals_focus: optStr(fd, "goals_focus"),
      success_measures: optStr(fd, "success_measures"),
      rules,
      baseline: {
        recorded_on: optStr(fd, "baseline_recorded_on") ?? undefined,
        followers,
        monthly_reach: optNum(fd, "baseline_reach") ?? undefined,
        engagement_rate: optNum(fd, "baseline_engagement") ?? undefined,
        notes: optStr(fd, "baseline_notes") ?? undefined,
      },
    })
    .eq("id", access.workspace.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Goals and rules saved.");
}

export async function updateBrandKit(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access?.can.editBrandKit) return fail("You don't have permission to edit the brand kit.");

  const colours: Colour[] = lines(str(fd, "colours")).map((line) => {
    const hex = line.match(/#[0-9a-f]{3,8}\b/i)?.[0] ?? "";
    return { name: line.replace(hex, "").replace(/[-–—:|]\s*$/, "").trim() || hex, hex };
  });
  const fonts: Font[] = lines(str(fd, "fonts")).map((line) => {
    const [name, usage] = line.split(/\s[-–—:|]\s|[:|]/).map((p) => p.trim());
    return { name, ...(usage ? { usage } : {}) };
  });
  const faq: Faq[] = [];
  const questions = fd.getAll("faq_question").map(String);
  const answers = fd.getAll("faq_answer").map(String);
  questions.forEach((q, i) => {
    if (q.trim() && answers[i]?.trim()) faq.push({ question: q.trim(), answer: answers[i].trim() });
  });

  const supabase = await createClient();
  const { error } = await supabase.from("brand_kits").upsert({
    workspace_id: access.workspace.id,
    tone: optStr(fd, "tone"),
    topics_to_avoid: optStr(fd, "topics_to_avoid"),
    notes: optStr(fd, "notes")?.slice(0, 8000) ?? null,
    colours,
    fonts,
    faq,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Brand kit saved.");
}

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access?.can.inviteMembers) return fail("You don't have permission to invite people.");

  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const role = str(fd, "role") as MemberRole;
  if (!isEmail(email)) return fail("Enter a valid email address.");
  if (!["approver", "viewer", "team_member"].includes(role)) return fail("Choose a role.");
  if (role === "team_member" && access.role !== "admin") return fail("Only agency admins can add team members.");

  const result = await inviteUser({
    email,
    name,
    side: role === "team_member" ? "agency" : "client",
    workspace: { id: access.workspace.id, name: access.workspace.name, slug: access.workspace.slug, role },
    invitedBy: viewer.name,
    invitedByEmail: viewer.email,
  });
  if ("error" in result) return fail(result.error);
  refresh();

  const message = result.existing ? `${email} now has access and has been emailed.` : `Invitation sent to ${email}.`;
  // Admins can copy the link to send it another way (e.g. WhatsApp).
  return done(message, {
    data: access.role === "admin" ? { inviteLink: result.link } : {},
    devLink: devLinksAllowed() ? result.link : undefined,
  });
}

/** Adds an existing agency user to a client's team. */
export async function assignTeamMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await adminAccess(str(fd, "workspace_id"));
  if (!access) return fail("Only agency admins can assign the team.");
  const userId = str(fd, "user_id");
  if (!userId) return fail("Choose a team member.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_members")
    .upsert({ workspace_id: access.workspace.id, user_id: userId, role: "team_member" }, { onConflict: "workspace_id,user_id" });
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Team member assigned.");
}

export async function removeMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access?.can.inviteMembers) return fail("You don't have permission to remove people.");
  const userId = str(fd, "user_id");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", access.workspace.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return fail("That person isn't in this workspace.");
  // Client approvers manage their own team only.
  if (access.role === "approver" && member.role === "team_member") return fail("Only agency admins can change the agency team.");
  if (userId === viewer.id && access.role === "approver") return fail("Ask your agency to remove your own access.");

  const { error } = await admin.from("workspace_members").delete().eq("workspace_id", access.workspace.id).eq("user_id", userId);
  if (error) return fail(friendlyError(error));

  // A client person with no other client left can't do anything in Sayso, so
  // their login goes too: they can't sign in, and a sign-in link is refused.
  if (member.role !== "team_member") {
    const { count } = await admin.from("workspace_members").select("workspace_id", { count: "exact", head: true }).eq("user_id", userId);
    const { data: person } = await admin.from("profiles").select("side").eq("id", userId).maybeSingle();
    if (!count && person?.side === "client") {
      const removed = await deleteLogin(userId);
      if (!removed.ok) console.error("[members] removed from workspace, but the login couldn't be deleted", userId);
      refresh();
      return done(`Removed. They no longer have access to ${APP_NAME}.`);
    }
  }
  refresh();
  return done(`Removed from ${access.workspace.name}.`);
}

export async function changeMemberRole(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access?.can.inviteMembers) return fail("You don't have permission to change roles.");
  const role = str(fd, "role");
  if (role !== "approver" && role !== "viewer") return fail("Choose approver or viewer.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", access.workspace.id)
    .eq("user_id", str(fd, "user_id"))
    .in("role", ["approver", "viewer"]);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Role updated.");
}
