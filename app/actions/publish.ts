"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findWorkspaceAccess } from "@/lib/auth";
import { deliverNotificationsLater, done, fail, friendlyError, str } from "@/lib/action-helpers";
import { platformLabel } from "@/lib/content";
import { parseMedia, signMedia } from "@/lib/media";
import { publishCaption, publishPlan, publishTo, type PublishOutcome, type PublishTarget } from "@/lib/publish";
import { isUuid } from "@/lib/chat";
import type { ActionState } from "./types";

/** Team member: ask the agency admins to publish an approved post (they get a notification and an email). */
export async function requestPublish(_: ActionState, fd: FormData): Promise<ActionState> {
  const itemId = str(fd, "item_id");
  if (!isUuid(itemId)) return fail("Post not found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_publish", { p_item: itemId });
  if (error) return fail(friendlyError(error));
  deliverNotificationsLater();
  refresh();
  return done("Sent. The admins will publish it.");
}

/** Posts being published by this server right now, so a double click can't post twice. */
const inFlight = new Set<string>();

const NAMES = { instagram: "Instagram", facebook: "Facebook" } as const;

/**
 * Publishes an approved (or scheduled) post to the client's Instagram and
 * Facebook straight away, using the version the client approved, then marks
 * it as published with the live link. Agency team only.
 */
export async function publishNow(_: ActionState, fd: FormData): Promise<ActionState> {
  const itemId = str(fd, "item_id");
  if (!isUuid(itemId)) return fail("Post not found.");
  const supabase = await createClient();
  const { data: item } = await supabase.from("content_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return fail("Post not found.");
  const access = await findWorkspaceAccess("id", item.workspace_id);
  if (!access?.can.markPublished) return fail("Only an agency admin can publish posts. Use \"Request publishing\" instead.");
  if (item.status !== "approved" && item.status !== "scheduled") {
    return fail(item.status === "published" ? "This post has already been published." : "Only posts the client has approved can be published.");
  }

  // The version the client approved: the latest one sent to them.
  const { data: version } = await supabase
    .from("content_versions")
    .select("media, captions, hashtags")
    .eq("content_item_id", item.id)
    .not("sent_to_client_at", "is", null)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return fail("There's no approved version to publish.");

  const media = parseMedia(version.media);
  const plan = publishPlan(item, access.workspace, media, platformLabel);
  if (!plan.ok) return fail(plan.reason);

  if (inFlight.has(item.id)) return fail("This post is already being published. Give it a minute.");
  inFlight.add(item.id);
  try {
    // Links stay valid for an hour: long enough for Instagram and Facebook to download them.
    const signed = await signMedia(media.filter((m) => m.mime.startsWith("image/") || m.mime.startsWith("video/")), 60 * 60);
    if (!signed.length) return fail("The files couldn't be prepared. Please try again.");
    const files = signed.map((f) => ({ url: f.src, mime: f.mime }));

    const outcomes = await Promise.all(
      plan.targets.map(async (target): Promise<[PublishTarget, PublishOutcome]> => [
        target,
        await publishTo(target.platform, {
          kind: plan.kind,
          accountId: target.accountId,
          caption: publishCaption(version.captions, version.hashtags, target.platform),
          files,
        }),
      ]),
    );
    const posted = outcomes.filter((o): o is [PublishTarget, Extract<PublishOutcome, { ok: true }>] => o[1].ok);
    const failed = outcomes.filter((o): o is [PublishTarget, Extract<PublishOutcome, { ok: false }>] => !o[1].ok);
    if (!posted.length) {
      return fail(failed.map(([t, o]) => (failed.length > 1 ? `${NAMES[t.platform]}: ${o.error}` : o.error)).join(" "));
    }

    // Instagram's link comes first: results are read from it.
    const link =
      posted.find(([t]) => t.platform === "instagram")?.[1].permalink ?? posted.find(([t]) => t.platform === "facebook")?.[1].permalink ?? item.live_url;
    const { error } = await supabase
      .from("content_items")
      .update({ status: "published", live_url: link ?? null })
      .eq("id", item.id);
    if (error) {
      console.error("[publish] went out but the status wasn't saved", item.id, error.message);
      return fail(`It's live on ${posted.map(([t]) => NAMES[t.platform]).join(" and ")}, but the status couldn't be updated (${friendlyError(error)}). Mark it as published by hand.`);
    }
    deliverNotificationsLater();
    refresh();

    const where = posted.map(([t]) => NAMES[t.platform]).join(" and ");
    const notes = [
      ...failed.map(([t, o]) => `${NAMES[t.platform]} didn't go out: ${o.error}`),
      ...(plan.manual.length ? [`Post it on ${plan.manual.join(", ")} by hand.`] : []),
    ];
    return done(`Published on ${where}.${notes.length ? ` ${notes.join(" ")}` : ""}`, failed.length ? { data: { warning: "1" } } : undefined);
  } finally {
    inFlight.delete(item.id);
  }
}
