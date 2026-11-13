"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findWorkspaceAccess, getViewer, requireViewer } from "@/lib/auth";
import { bool, deliverNotificationsLater, done, fail, friendlyError, optStr, str } from "@/lib/action-helpers";
import { isUuid } from "@/lib/chat";
import { getPeople } from "@/lib/queries";
import { parseMedia, signMedia, type MediaFile, type SignedMedia } from "@/lib/media";
import { todayKey, zonedInputToIso } from "@/lib/dates";
import type { ContentType, TaskStatus } from "@/lib/types";
import type { ActionState } from "./types";

// "in_review" is only reached by submitting work (submitTaskWork), not from the status menu.
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export async function createTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access?.can.managePlans) return fail("Only the agency team can create tasks.");
  const title = str(fd, "title");
  if (!title) return fail("Give the task a title.");

  // owner is "agency:<id>", "agency:", "client:<id>" or "client:" (any approver)
  const [side, ownerId] = (str(fd, "owner") || "agency:").split(":");
  const ownerSide = side === "client" ? "client" : "agency";

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    workspace_id: access.workspace.id,
    plan_id: optStr(fd, "plan_id"),
    content_item_id: optStr(fd, "content_item_id"),
    title,
    description: optStr(fd, "description"),
    owner_side: ownerSide,
    owner_id: ownerId || null,
    due_date: optStr(fd, "due_date"),
    internal: ownerSide === "agency" && bool(fd, "internal"),
    created_by: viewer.id,
  });
  if (error) return fail(friendlyError(error));
  deliverNotificationsLater();
  refresh();
  return done("Task added.");
}

export async function setTaskStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const status = str(fd, "status") as TaskStatus;
  if (!STATUSES.includes(status)) return fail("Unknown status.");
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("id, workspace_id, owner_side, status").eq("id", str(fd, "task_id")).maybeSingle();
  if (!task) return fail("Task not found.");
  const access = await findWorkspaceAccess("id", task.workspace_id);
  if (!access) return fail("Task not found.");

  // Agency tasks: team members move them between "to do" and "in progress";
  // marking done (or reopening) is an admin's call. The database checks this too.
  const isAdmin = viewer.agencyRole === "admin";
  if (access.can.isAgency && task.owner_side === "agency" && !isAdmin) {
    if (status === "done") return fail("Submit your work for review. An admin marks the task done.");
    if (task.status === "in_review" || task.status === "done") return fail("Only an admin can change a task that's in review or done.");
  }

  const { error } = access.can.isAgency
    ? await supabase
        .from("tasks")
        .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
        .eq("id", task.id)
    : await supabase.rpc("set_client_task_status", { p_task: task.id, p_status: status });
  if (error) return fail(friendlyError(error));
  refresh();
  return done();
}

export async function deleteTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  // Only agency admins delete tasks (the database enforces this too).
  if (viewer.agencyRole !== "admin") return fail("Only an agency admin can delete tasks.");
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", str(fd, "task_id"));
  if (error) return fail(friendlyError(error));
  refresh();
  return done();
}

// ---------------------------------------------------------------------------
// Submitting work and reviewing it
// ---------------------------------------------------------------------------

export type SubmitTarget = { id: string; title: string; type: ContentType; plannedAt: string | null; status: string };

/**
 * Posts the work can go on: the client's posts that are still being made. Pass
 * the task, or (for work sent without a task) the client.
 */
export async function listSubmitTargets(by: { taskId?: string; workspaceId?: string }): Promise<SubmitTarget[]> {
  const viewer = await getViewer();
  if (!viewer || viewer.side !== "agency") return [];
  const supabase = await createClient();
  let workspaceId = by?.workspaceId;
  if (by?.taskId) {
    if (!isUuid(by.taskId)) return [];
    const { data: task } = await supabase.from("tasks").select("workspace_id").eq("id", by.taskId).maybeSingle();
    workspaceId = task?.workspace_id;
  }
  if (!workspaceId || !isUuid(workspaceId)) return [];
  const { data } = await supabase
    .from("content_items")
    .select("id, title, type, planned_at, status")
    .eq("workspace_id", workspaceId)
    .in("status", ["planned", "draft", "internal_review"])
    .order("planned_at", { ascending: true, nullsFirst: false })
    .limit(200);
  return (data ?? []).map((i) => ({ id: i.id, title: i.title, type: i.type, plannedAt: i.planned_at, status: i.status }));
}

/**
 * Work a team member sends without a task on the board: it gets a task of its
 * own, assigned to them and in progress, so it goes through the same review
 * (submitTaskWork next, then the admin's Review).
 */
export async function startOwnWork(input: {
  workspaceId: string;
  title: string;
}): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const viewer = await requireViewer();
  if (viewer.side !== "agency" || !isUuid(input?.workspaceId)) return { ok: false, error: "Choose the client this work is for." };
  const title = String(input.title ?? "")
    .trim()
    .slice(0, 200);
  if (!title) return { ok: false, error: "Say what the work is." };
  const access = await findWorkspaceAccess("id", input.workspaceId);
  if (!access?.can.isAgency) return { ok: false, error: "You're not on this client's team." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: access.workspace.id,
      title,
      owner_side: "agency",
      owner_id: viewer.id,
      status: "in_progress",
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: friendlyError(error) };
  return { ok: true, taskId: data.id };
}

const POST_TYPES: ContentType[] = ["feed_post", "carousel", "reel", "story"];

/**
 * Creates the post a task's work is for, when it isn't in the plan yet. It goes
 * into the plan for its month (made as an internal draft plan if there isn't
 * one), assigned to the person doing the work, for Instagram and Facebook.
 */
export async function createPostForTask(input: {
  taskId: string;
  title: string;
  type: string;
  date: string;
}): Promise<{ ok: true; post: SubmitTarget } | { ok: false; error: string }> {
  const viewer = await requireViewer();
  if (viewer.side !== "agency" || !isUuid(input?.taskId)) return { ok: false, error: "Task not found." };
  const title = String(input.title ?? "")
    .trim()
    .slice(0, 200);
  if (!title) return { ok: false, error: "Give the post a title." };
  const type = POST_TYPES.includes(input.type as ContentType) ? (input.type as ContentType) : "feed_post";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? "")) ? input.date : "";

  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("workspace_id").eq("id", input.taskId).maybeSingle();
  if (!task) return { ok: false, error: "Task not found." };
  const access = await findWorkspaceAccess("id", task.workspace_id);
  if (!access?.can.editContent) return { ok: false, error: "Only the agency team can add posts." };
  const tz = access.workspace.time_zone;

  // The plan for the post's month (or this month), created if it doesn't exist yet.
  const month = `${(date || todayKey(tz)).slice(0, 7)}-01`;
  let { data: plan } = await supabase.from("monthly_plans").select("id").eq("workspace_id", task.workspace_id).eq("month", month).maybeSingle();
  if (!plan) {
    const created = await supabase
      .from("monthly_plans")
      .insert({ workspace_id: task.workspace_id, month, created_by: viewer.id })
      .select("id")
      .single();
    if (created.error) return { ok: false, error: friendlyError(created.error) };
    plan = created.data;
  }

  const { data: item, error } = await supabase
    .from("content_items")
    .insert({
      workspace_id: task.workspace_id,
      plan_id: plan.id,
      title,
      type,
      platforms: ["instagram", "facebook"],
      planned_at: date ? zonedInputToIso(date, tz) : null,
      assignee_id: viewer.id,
      status: "planned",
      created_by: viewer.id,
    })
    .select("id, title, type, planned_at, status")
    .single();
  if (error || !item) return { ok: false, error: friendlyError(error) };
  return { ok: true, post: { id: item.id, title: item.title, type: item.type, plannedAt: item.planned_at, status: item.status } };
}

/** Records work the browser has uploaded to the chosen post's folder, and sends it for review. */
export async function submitTaskWork(input: { taskId: string; itemId: string; files: MediaFile[]; note: string }): Promise<ActionState> {
  await requireViewer();
  const { taskId, itemId } = input ?? {};
  if (!isUuid(taskId) || !isUuid(itemId)) return fail("Choose the post this work is for.");
  const files = (Array.isArray(input.files) ? input.files : [])
    .filter((f) => typeof f?.path === "string")
    .slice(0, 20)
    .map((f) => ({ path: f.path, name: String(f.name).slice(0, 200), mime: String(f.mime).slice(0, 100), size: Number(f.size) || 0 }));
  if (!files.length) return fail("Add the files for your work.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_task_work", {
    p_task: taskId,
    p_item: itemId,
    p_files: files,
    p_note: String(input.note ?? "").slice(0, 2000),
  });
  if (error) return fail(friendlyError(error));
  deliverNotificationsLater();
  refresh();
  return done("Sent for review.");
}

export type TaskReview = {
  title: string;
  post: { id: string; title: string; href: string } | null;
  submittedBy: string;
  submittedAt: string;
  note: string | null;
  files: SignedMedia[];
  /** Earlier rounds, newest first. */
  history: { submittedAt: string; decision: string | null; reviewNote: string | null; reviewer: string | null }[];
};

/** The latest work submitted for a task, with links to its files. Agency only. */
export async function getTaskReview(taskId: string): Promise<TaskReview | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.side !== "agency" || !isUuid(taskId)) return null;
  const supabase = await createClient();
  const [{ data: task }, { data: rounds }] = await Promise.all([
    supabase.from("tasks").select("id, title, workspace_id").eq("id", taskId).maybeSingle(),
    supabase
      .from("task_submissions")
      .select("content_item_id, files, note, submitted_by, submitted_at, decision, review_note, reviewed_by")
      .eq("task_id", taskId)
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]);
  if (!task || !rounds?.length) return null;
  const latest = rounds[0];
  const [people, { data: item }, { data: workspace }] = await Promise.all([
    getPeople(rounds.flatMap((r) => [r.submitted_by, r.reviewed_by])),
    latest.content_item_id
      ? supabase.from("content_items").select("id, title").eq("id", latest.content_item_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("workspaces").select("slug").eq("id", task.workspace_id).maybeSingle(),
  ]);
  const name = (id: string | null) => (id ? (people.get(id)?.name ?? "A former member") : null);

  return {
    title: task.title,
    post: item && workspace ? { id: item.id, title: item.title, href: `/w/${workspace.slug}/content/${item.id}` } : null,
    submittedBy: name(latest.submitted_by) ?? "Someone",
    submittedAt: latest.submitted_at,
    note: latest.note,
    files: await signMedia(parseMedia(latest.files)),
    history: rounds.slice(1).map((r) => ({
      submittedAt: r.submitted_at,
      decision: r.decision,
      reviewNote: r.review_note,
      reviewer: name(r.reviewed_by),
    })),
  };
}

/** An admin marks submitted work done (it's added to the post), or asks for changes. */
export async function reviewTaskWork(input: { taskId: string; decision: "approved" | "changes_requested"; note: string }): Promise<ActionState> {
  const viewer = await requireViewer();
  if (viewer.agencyRole !== "admin") return fail("Only an agency admin can review work.");
  if (!isUuid(input?.taskId)) return fail("Task not found.");
  if (input.decision !== "approved" && input.decision !== "changes_requested") return fail("Unknown decision.");
  const note = String(input.note ?? "")
    .trim()
    .slice(0, 2000);
  if (input.decision === "changes_requested" && !note) return fail("Say what needs to change.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_task_work", { p_task: input.taskId, p_decision: input.decision, p_note: note });
  if (error) return fail(friendlyError(error));
  deliverNotificationsLater();
  refresh();
  return done(input.decision === "approved" ? "Marked done. The files are on the post." : "Changes requested.");
}
