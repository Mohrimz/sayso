"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findWorkspaceAccess, requireViewer } from "@/lib/auth";
import { isMonthParam } from "@/lib/dates";
import { done, fail, friendlyError, lines, optStr, str } from "@/lib/action-helpers";
import type { KeyDate, PlanStatus } from "@/lib/types";
import type { ActionState } from "./types";

async function planAccess(planId: string) {
  const supabase = await createClient();
  const { data: plan } = await supabase.from("monthly_plans").select("id, workspace_id, month, status").eq("id", planId).maybeSingle();
  if (!plan) return null;
  const access = await findWorkspaceAccess("id", plan.workspace_id);
  if (!access?.can.managePlans) return null;
  return { plan, access, supabase };
}

export async function createPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access?.can.managePlans) return fail("Only the agency team can create plans.");
  const month = str(fd, "month");
  if (!isMonthParam(month)) return fail("Choose a month.");

  const supabase = await createClient();
  const { error } = await supabase.from("monthly_plans").insert({
    workspace_id: access.workspace.id,
    month: `${month}-01`,
    status: "draft",
    created_by: viewer.id,
  });
  if (error && error.code !== "23505") return fail(friendlyError(error));
  redirect(`/w/${access.workspace.slug}/plan/${month}`);
}

/** "2026-11-26 Thanksgiving" (or "2026-11-26 | Thanksgiving") per line. */
function parseKeyDates(text: string): KeyDate[] {
  return lines(text)
    .map((line) => {
      const match = /^(\d{4}-\d{2}-\d{2})\s*[|:\-–—]?\s*(.*)$/.exec(line);
      return match ? { date: match[1], label: match[2].trim() || "Key date" } : null;
    })
    .filter((d): d is KeyDate => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function updatePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await planAccess(str(fd, "plan_id"));
  if (!ctx) return fail("Only the agency team can edit plans.");
  const { error } = await ctx.supabase
    .from("monthly_plans")
    .update({
      themes: optStr(fd, "themes"),
      goals: optStr(fd, "goals"),
      key_dates: parseKeyDates(str(fd, "key_dates")),
    })
    .eq("id", ctx.plan.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Plan saved.");
}

export async function setPlanStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await planAccess(str(fd, "plan_id"));
  if (!ctx) return fail("Only the agency team can change the plan.");
  const status = str(fd, "status") as PlanStatus;
  if (!["draft", "active", "closed"].includes(status)) return fail("Unknown status.");
  // Sharing a month with the client, or hiding it again, is for agency admins.
  if ((ctx.plan.status === "draft") !== (status === "draft") && !ctx.access.can.sharePlan) {
    return fail("Only an agency admin can share this month with the client.");
  }
  const { error } = await ctx.supabase.from("monthly_plans").update({ status }).eq("id", ctx.plan.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done(status === "active" ? "Shared with the client." : status === "closed" ? "Month closed." : "Hidden from the client.");
}

export async function postProgressUpdate(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const ctx = await planAccess(str(fd, "plan_id"));
  if (!ctx) return fail("Only the agency team can post updates.");
  const body = str(fd, "body");
  if (!body) return fail("Write a short update first.");
  const { error } = await ctx.supabase
    .from("progress_updates")
    .insert({ workspace_id: ctx.plan.workspace_id, plan_id: ctx.plan.id, author_id: viewer.id, body });
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Update posted.");
}

export async function deleteProgressUpdate(fd: FormData) {
  await requireViewer();
  const supabase = await createClient();
  await supabase.from("progress_updates").delete().eq("id", str(fd, "id"));
  refresh();
}
