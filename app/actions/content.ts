"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeFiles } from "@/lib/files";
import { findWorkspaceAccess, requireViewer } from "@/lib/auth";
import { zonedInputToIso } from "@/lib/dates";
import { buildTrackedLinks, defaultUtm, isValidUrl } from "@/lib/utm";
import { PLATFORMS } from "@/lib/content";
import {
  csv,
  deliverNotificationsLater,
  done,
  fail,
  friendlyError,
  list,
  optStr,
  str,
} from "@/lib/action-helpers";
import type { ContentStatus, ContentType } from "@/lib/types";
import type { MediaFile } from "@/lib/media";
import type { ActionState } from "./types";

const TYPES: ContentType[] = ["feed_post", "carousel", "reel", "story"];
const PLATFORM_IDS: string[] = PLATFORMS.map((p) => p.id);

async function itemAccess(itemId: string) {
  const supabase = await createClient();
  const { data: item } = await supabase.from("content_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return null;
  const access = await findWorkspaceAccess("id", item.workspace_id);
  if (!access) return null;
  return { item, access, supabase };
}

/** New posts go to Instagram and Facebook (the form no longer asks where). */
const DEFAULT_PLATFORMS = ["instagram", "facebook"];

/**
 * Reads the content form. Platforms and the link are only returned when the
 * form sends them (older forms, the API): otherwise an edit keeps what the post
 * already has, and a new post gets the defaults.
 */
function readContentFields(fd: FormData, tz: string) {
  const sent = list(fd, "platforms").filter((p) => PLATFORM_IDS.includes(p));
  const platforms = fd.has("platforms") ? (sent.length ? sent : DEFAULT_PLATFORMS) : undefined;
  // "Goes live" is a date: zonedInputToIso stores a plain date at 09:00 in the client's time zone.
  const plannedInput = str(fd, "planned_at");
  const captions: Record<string, string> = { default: str(fd, "caption_default") };
  for (const platform of PLATFORM_IDS) {
    const value = str(fd, `caption_${platform}`);
    if (value && value !== captions.default) captions[platform] = value;
  }
  return {
    title: str(fd, "title"),
    type: str(fd, "type") as ContentType,
    platforms,
    planned_at: plannedInput ? zonedInputToIso(plannedInput, tz) : null,
    assignee_id: optStr(fd, "assignee_id"),
    reviewer_id: optStr(fd, "reviewer_id"),
    tags: csv(str(fd, "tags")),
    captions,
    hashtags: optStr(fd, "hashtags"),
    on_screen_text: optStr(fd, "on_screen_text"),
    link_url: fd.has("link_url") ? optStr(fd, "link_url") : undefined,
  };
}

function trackingFor(
  fields: ReturnType<typeof readContentFields>,
  fd: FormData,
  ctx: { workspaceSlug: string; month: string },
) {
  const base = defaultUtm({ workspaceSlug: ctx.workspaceSlug, month: ctx.month, title: fields.title });
  const utm = {
    medium: str(fd, "utm_medium") || base.medium,
    campaign: str(fd, "utm_campaign") || base.campaign,
    content: str(fd, "utm_content") || base.content,
  };
  return { utm, tracked_links: buildTrackedLinks(fields.link_url ?? null, fields.platforms ?? DEFAULT_PLATFORMS, utm) };
}

export async function createContentItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access?.can.editContent) return fail("Only the agency team can add content.");

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("monthly_plans")
    .select("id, month")
    .eq("id", str(fd, "plan_id"))
    .eq("workspace_id", access.workspace.id)
    .maybeSingle();
  if (!plan) return fail("Choose a month for this content.");

  const read = readContentFields(fd, access.workspace.time_zone);
  const fields = { ...read, platforms: read.platforms ?? DEFAULT_PLATFORMS, link_url: read.link_url ?? null };
  if (!fields.title) return fail("Give the content a working title.");
  if (!TYPES.includes(fields.type)) return fail("Choose a content type.");
  if (fields.link_url && !isValidUrl(fields.link_url)) return fail("The destination link must start with https://");
  const tracking = trackingFor(fields, fd, { workspaceSlug: access.workspace.slug, month: plan.month.slice(0, 7) });

  const { data: item, error } = await supabase
    .from("content_items")
    .insert({
      ...fields,
      ...tracking,
      plan_id: plan.id,
      workspace_id: access.workspace.id,
      status: "planned",
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error || !item) return fail(friendlyError(error));
  deliverNotificationsLater();
  redirect(`/w/${access.workspace.slug}/content/${item.id}`);
}

export async function updateContentItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx?.access.can.editContent) return fail("Only the agency team can edit content.");
  const fields = readContentFields(fd, ctx.access.workspace.time_zone);
  if (!fields.title) return fail("Give the content a working title.");
  if (!TYPES.includes(fields.type)) return fail("Choose a content type.");
  if (fields.link_url && !isValidUrl(fields.link_url)) return fail("The destination link must start with https://");

  const { data: plan } = await ctx.supabase.from("monthly_plans").select("month").eq("id", ctx.item.plan_id).single();
  const linkOrPlatformsSent = fields.link_url !== undefined || fields.platforms !== undefined;
  const tracking = linkOrPlatformsSent
    ? trackingFor(
        { ...fields, link_url: fields.link_url !== undefined ? fields.link_url : ctx.item.link_url, platforms: fields.platforms ?? ctx.item.platforms },
        fd,
        { workspaceSlug: ctx.access.workspace.slug, month: (plan?.month ?? "").slice(0, 7) },
      )
    : {};

  // Fields the form didn't send (undefined) are left as they are.
  const { error } = await ctx.supabase
    .from("content_items")
    .update({ ...fields, ...tracking })
    .eq("id", ctx.item.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Saved.");
}

/** Records a new media version after the browser has uploaded the files. */
export async function addContentVersion(itemId: string, media: MediaFile[], note: string): Promise<ActionState> {
  const ctx = await itemAccess(itemId);
  if (!ctx?.access.can.editContent) return fail("Only the agency team can upload content.");
  const prefix = `${ctx.item.workspace_id}/${ctx.item.id}/`;
  const clean = media
    .filter((m) => typeof m.path === "string" && m.path.startsWith(prefix) && !m.path.includes(".."))
    .map((m) => ({ path: m.path, name: String(m.name).slice(0, 200), mime: String(m.mime).slice(0, 100), size: Number(m.size) || 0 }));
  if (!clean.length) return fail("No files were uploaded.");

  const { error } = await ctx.supabase.from("content_versions").insert({
    content_item_id: ctx.item.id,
    workspace_id: ctx.item.workspace_id,
    version_number: 0, // set by the database
    media: clean,
    captions: ctx.item.captions,
    hashtags: ctx.item.hashtags,
    on_screen_text: ctx.item.on_screen_text,
    link_url: ctx.item.link_url,
    tracked_links: ctx.item.tracked_links,
    note: note.trim() || null,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return done("New version uploaded.");
}

/** Changes which photo or video comes first. keys are each file's path (or link), in the new order. */
export async function reorderMedia(itemId: string, keys: string[]): Promise<ActionState> {
  const ctx = await itemAccess(itemId);
  if (!ctx?.access.can.editContent) return fail("Only the agency team can change the order.");
  if (!Array.isArray(keys) || keys.length < 2 || keys.length > 50 || keys.some((k) => typeof k !== "string")) return fail("That order couldn't be saved.");
  const { error } = await ctx.supabase.rpc("reorder_post_media", { p_item: ctx.item.id, p_keys: keys });
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Order saved.");
}

/** Saves the caption and hashtags from the box under the preview (the same fields as the Edit form). */
export async function saveCaption(itemId: string, caption: string, hashtags: string): Promise<ActionState> {
  const ctx = await itemAccess(itemId);
  if (!ctx?.access.can.editContent) return fail("Only the agency team can edit the caption.");
  if (typeof caption !== "string" || typeof hashtags !== "string" || caption.length > 5000 || hashtags.length > 1000) return fail("That caption is too long.");
  const existing = ctx.item.captions && typeof ctx.item.captions === "object" && !Array.isArray(ctx.item.captions) ? (ctx.item.captions as Record<string, string>) : {};
  const { error } = await ctx.supabase
    .from("content_items")
    .update({ captions: { ...existing, default: caption.trim() }, hashtags: hashtags.trim() || null })
    .eq("id", ctx.item.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Caption saved.");
}

const AGENCY_MOVES: ContentStatus[] = ["planned", "draft", "internal_review", "approved", "scheduled", "published"];

export async function moveContent(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx?.access.can.editContent) return fail("Only the agency team can change the status.");
  const to = str(fd, "to") as ContentStatus;
  if (!AGENCY_MOVES.includes(to)) return fail("That status can't be set here.");
  if ((to === "published" || ctx.item.status === "published") && !ctx.access.can.markPublished) {
    return fail("Only an agency admin can publish posts. Use \"Request publishing\" instead.");
  }

  const liveUrl = optStr(fd, "live_url");
  if (liveUrl && !isValidUrl(liveUrl)) return fail("The live post link must start with https://");
  if (to === "internal_review" && ctx.item.current_version === 0) return fail("Upload the media before sending it for internal review.");

  const { error } = await ctx.supabase
    .from("content_items")
    .update({ status: to, ...(to === "published" && liveUrl ? { live_url: liveUrl } : {}) })
    .eq("id", ctx.item.id);
  if (error) return fail(friendlyError(error));
  deliverNotificationsLater();
  refresh();
  const messages: Record<string, string> = {
    planned: "Moved back to planned",
    draft: "Moved back to draft",
    internal_review: "Sent for internal review",
    approved: "Unscheduled",
    scheduled: "Marked as scheduled",
    published: "Marked as published",
  };
  if (to === "internal_review" && !ctx.access.can.sendToClient) return done("Sent for review. An admin will check it and send it to the client.");
  return done(messages[to]);
}

export async function saveLiveUrl(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx?.access.can.isAgency) return fail("Only the agency team can do that.");
  const liveUrl = optStr(fd, "live_url");
  if (liveUrl && !isValidUrl(liveUrl)) return fail("The live post link must start with https://");
  const { error } = await ctx.supabase.from("content_items").update({ live_url: liveUrl }).eq("id", ctx.item.id);
  if (error) return fail(friendlyError(error));
  refresh();
  return done("Live link saved.");
}

/** Internal review: send back with fixes, or pass and send to the client. */
export async function internalReview(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx?.access.can.sendToClient) return fail("Only an agency admin can review posts and send them to the client.");
  if (ctx.item.status !== "internal_review") return fail("This item isn't in internal review.");
  const decision = str(fd, "decision");
  const note = str(fd, "note");

  if (decision === "fixes_needed") {
    if (!note) return fail("Describe the fixes needed.");
    await ctx.supabase.from("internal_notes").insert({
      workspace_id: ctx.item.workspace_id,
      content_item_id: ctx.item.id,
      author_id: viewer.id,
      body: note,
      decision: "fixes_needed",
      version_number: ctx.item.current_version,
    });
    const { error } = await ctx.supabase.from("content_items").update({ status: "draft" }).eq("id", ctx.item.id);
    if (error) return fail(friendlyError(error));
    deliverNotificationsLater();
    refresh();
    return done("Sent back to draft with your notes.");
  }

  const deadlineLocal = str(fd, "deadline");
  const deadline = deadlineLocal ? zonedInputToIso(deadlineLocal, ctx.access.workspace.time_zone) : null;
  const { error } = await ctx.supabase.rpc("send_for_approval", {
    p_item: ctx.item.id,
    ...(deadline ? { p_deadline: deadline } : {}),
  });
  if (error) return fail(friendlyError(error));
  await ctx.supabase.from("internal_notes").insert({
    workspace_id: ctx.item.workspace_id,
    content_item_id: ctx.item.id,
    author_id: viewer.id,
    body: note,
    decision: "passed",
    version_number: ctx.item.current_version,
  });
  deliverNotificationsLater();
  refresh();
  return done("Sent to the client for approval.");
}

export async function submitApproval(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireViewer();
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx?.access.can.approve) return fail("Only client approvers can approve content.");
  const decision = str(fd, "decision") === "changes_requested" ? "changes_requested" : "approved";
  const comment = str(fd, "comment");
  if (decision === "changes_requested" && !comment) return fail("Tell the team what to change.");

  const { data: status, error } = await ctx.supabase.rpc("submit_approval", {
    p_item: ctx.item.id,
    p_decision: decision,
    p_comment: comment,
  });
  if (error) return fail(friendlyError(error));
  deliverNotificationsLater();
  refresh();
  if (decision === "changes_requested") return done("Thanks. The team has your notes and will send a new version.");
  return done(
    status === "approved" ? "Approved. Thank you!" : "Your approval is recorded. Waiting for the other approvers.",
  );
}

export async function addComment(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx) return fail("You don't have access to this content.");
  const body = str(fd, "body");
  if (!body) return fail("Write a comment first.");

  const { error } = await ctx.supabase.from("comments").insert({
    workspace_id: ctx.item.workspace_id,
    content_item_id: ctx.item.id,
    version_id: optStr(fd, "version_id"),
    parent_id: optStr(fd, "parent_id"),
    author_id: viewer.id,
    body,
  });
  if (error) return fail(friendlyError(error));
  deliverNotificationsLater();
  refresh();
  return done();
}

export async function toggleCommentResolved(fd: FormData) {
  await requireViewer();
  const supabase = await createClient();
  await supabase
    .from("comments")
    .update({ resolved: str(fd, "resolved") === "true" })
    .eq("id", str(fd, "id"));
  refresh();
}

export async function addInternalNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx?.access.can.seeInternal) return fail("Only the agency team can add internal notes.");
  const body = str(fd, "body");
  if (!body) return fail("Write a note first.");
  const { error } = await ctx.supabase.from("internal_notes").insert({
    workspace_id: ctx.item.workspace_id,
    content_item_id: ctx.item.id,
    author_id: viewer.id,
    body,
    version_number: ctx.item.current_version,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return done();
}

/** The agency team can delete a post at any stage until it's published. */
export async function deleteContentItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await itemAccess(str(fd, "item_id"));
  if (!ctx?.access.can.editContent) return fail("Only the agency team can delete posts.");
  if (ctx.item.status === "published") return fail("Published posts can't be deleted.");
  const [{ data: plan }, { data: versions }, { data: submissions }] = await Promise.all([
    ctx.supabase.from("monthly_plans").select("month").eq("id", ctx.item.plan_id).single(),
    ctx.supabase.from("content_versions").select("media").eq("content_item_id", ctx.item.id),
    ctx.supabase.from("task_submissions").select("files").eq("content_item_id", ctx.item.id),
  ]);
  const { error } = await ctx.supabase.from("content_items").delete().eq("id", ctx.item.id);
  if (error) return fail(friendlyError(error));

  // Remove the post's files, except work submitted on tasks (it stays in the task's history),
  // and the notifications that pointed at it.
  const paths = (rows: { media?: unknown; files?: unknown }[] | null, key: "media" | "files") =>
    (rows ?? []).flatMap((r) => (Array.isArray(r[key]) ? (r[key] as { path?: unknown }[]) : [])).flatMap((m) => (typeof m?.path === "string" ? [m.path] : []));
  const keep = new Set(paths(submissions, "files"));
  const prefix = `${ctx.item.workspace_id}/${ctx.item.id}/`;
  const remove = paths(versions, "media").filter((p) => p.startsWith(prefix) && !keep.has(p));
  await Promise.all([
    removeFiles("content-media", remove).catch((e) => console.error("[content] files not removed", e)),
    createAdminClient()
      .from("notifications")
      .delete()
      .like("link", `%/content/${ctx.item.id}%`)
      .then(({ error: e }) => e && console.error("[content] notifications not removed", e)),
  ]);
  redirect(`/w/${ctx.access.workspace.slug}/plan/${(plan?.month ?? "").slice(0, 7)}`);
}
