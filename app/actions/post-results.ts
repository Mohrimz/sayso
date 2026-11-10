"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findWorkspaceAccess, requireViewer } from "@/lib/auth";
import { done, fail, str } from "@/lib/action-helpers";
import {
  facebookPages,
  fetchFacebookResults,
  fetchInstagramResults,
  instagramAccounts,
  instagramShortcode,
  resultsMaxAge,
  RESULTS_MIN_REFRESH_MS,
  setupGap,
  viewFromRow,
  type FetchedResults,
  type Platform,
  type ResultsRow,
} from "@/lib/post-results";
import { isUuid } from "@/lib/chat";
import type { PlatformView, ResultsViews } from "@/components/post-results-card";
import type { ActionState } from "./types";

const HOUR = 60 * 60 * 1000;

/**
 * Latest results for a published post on Instagram and its Facebook Page.
 * Uses saved numbers while they're fresh; otherwise asks Make and saves the
 * answer. Anyone who can see the post can call this. `force` (the Refresh
 * button) still waits 15 minutes between lookups to protect Make's allowance.
 */
export async function refreshPostResults(itemId: string, force = false): Promise<ResultsViews> {
  await requireViewer();
  const missing: PlatformView = { state: "error", error: "Post not found." };
  if (!isUuid(itemId)) return { instagram: missing, facebook: missing };

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("content_items")
    .select("id, workspace_id, status, live_url, platforms, planned_at, published_at")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { instagram: missing, facebook: missing };
  const { data: ws } = await supabase.from("workspaces").select("instagram_account_id, facebook_page_id").eq("id", item.workspace_id).maybeSingle();
  const workspace = { instagram_account_id: ws?.instagram_account_id ?? null, facebook_page_id: ws?.facebook_page_id ?? null };
  const { data: rows } = await supabase.from("post_insights").select("*").eq("content_item_id", item.id);
  const saved = (platform: Platform) => (rows ?? []).find((r) => r.platform === platform);

  const admin = createAdminClient();
  async function update(platform: Platform, fetcher: () => Promise<FetchedResults>): Promise<PlatformView> {
    const gap = setupGap(platform, item!, workspace);
    if (gap) return gap;
    const cached = saved(platform);
    const age = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;
    if (cached && age < (force ? RESULTS_MIN_REFRESH_MS : resultsMaxAge(cached.posted_at))) return viewFromRow(cached);

    const result = await fetcher();
    const row =
      result.status === "ok"
        ? { status: "ok", media_id: result.mediaId, permalink: result.permalink, posted_at: result.postedAt, metrics: result.metrics, error: null }
        : result.status === "not_found"
          ? { status: "not_found", media_id: null, permalink: null, posted_at: null, metrics: {}, error: null }
          : // Keep the last good numbers when a refresh fails.
            {
              status: "error",
              media_id: cached?.media_id ?? null,
              permalink: cached?.permalink ?? null,
              posted_at: cached?.posted_at ?? null,
              metrics: cached?.metrics ?? {},
              error: result.error,
            };
    const { data: stored, error } = await admin
      .from("post_insights")
      .upsert({ content_item_id: item!.id, platform, workspace_id: item!.workspace_id, ...row, fetched_at: new Date().toISOString() })
      .select("*")
      .single();
    if (error || !stored) {
      console.error("[post-results] could not save", error?.message);
      return { state: "error", error: "Results couldn't be saved." };
    }
    return viewFromRow(stored as ResultsRow);
  }

  // Instagram first: its exact post time is the best way to find the matching Facebook post.
  const instagram = await update("instagram", () => fetchInstagramResults(workspace.instagram_account_id!, instagramShortcode(item.live_url)!));
  const igPostedAt = saved("instagram")?.posted_at ?? null;
  const facebook = await update("facebook", async () => {
    const latestIg = igPostedAt ?? (await supabase.from("post_insights").select("posted_at").eq("content_item_id", item.id).eq("platform", "instagram").maybeSingle()).data?.posted_at;
    if (latestIg) return fetchFacebookResults(workspace.facebook_page_id!, new Date(latestIg), 30 * 60 * 1000);
    // No Instagram twin: look around the planned (or published) time.
    const reference = item.planned_at ?? item.published_at;
    if (!reference) return { status: "not_found" };
    return fetchFacebookResults(workspace.facebook_page_id!, new Date(reference), 12 * HOUR);
  });

  return { instagram, facebook };
}

/** Links a client workspace to the Instagram account and Facebook Page its results come from. Admins only. */
export async function linkSocialAccounts(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await findWorkspaceAccess("id", str(fd, "workspace_id"));
  if (!access || access.role !== "admin") return fail("Only agency admins can change this.");
  const instagram = str(fd, "instagram_account_id");
  const facebook = str(fd, "facebook_page_id");
  if (instagram && !instagramAccounts().some((a) => a.id === instagram) && instagram !== access.workspace.instagram_account_id) {
    return fail("Choose one of the listed Instagram accounts.");
  }
  if (facebook && !facebookPages().some((p) => p.id === facebook) && facebook !== access.workspace.facebook_page_id) {
    return fail("Choose one of the listed Facebook Pages.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ instagram_account_id: instagram || null, facebook_page_id: facebook || null })
    .eq("id", access.workspace.id);
  if (error) return fail("That couldn't be saved. Please try again.");

  // Results from a different account no longer apply.
  const admin = createAdminClient();
  if ((access.workspace.instagram_account_id ?? "") !== instagram) {
    await admin.from("post_insights").delete().eq("workspace_id", access.workspace.id).eq("platform", "instagram");
  }
  if ((access.workspace.facebook_page_id ?? "") !== facebook) {
    await admin.from("post_insights").delete().eq("workspace_id", access.workspace.id).eq("platform", "facebook");
  }
  refresh();
  return done("Saved. Results will show on published posts.");
}
