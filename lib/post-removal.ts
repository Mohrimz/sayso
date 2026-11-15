import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { instagramShortcode, resultsConfigured, runScenario } from "@/lib/post-results";

/**
 * Finds published posts that are no longer on Instagram (deleted or archived
 * there) and takes them off the plan.
 *
 * Instagram never says when a post is deleted, so this asks Make for the
 * client's latest 50 Instagram posts (about 4 Make operations) and compares.
 * It's run when someone opens a plan or a published post, at most once per
 * CHECK_EVERY_MS per client, to stay inside Make's monthly allowance.
 */
export const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;
const LISTED = 50;

export type RecentPost = { shortcode: string; postedAt: number };
export type Candidate = { id: string; shortcode: string; postedAt: number | null };

/**
 * Which candidates are missing. A post only counts as missing when it's recent
 * enough that it should be in the list: if Instagram returned a full page of
 * 50, anything older than the oldest of them can't be judged. An empty or
 * failed answer never removes anything.
 */
export function findRemoved(candidates: Candidate[], recent: RecentPost[]): string[] {
  if (!recent.length) return [];
  const listed = new Set(recent.map((p) => p.shortcode));
  const complete = recent.length < LISTED;
  const oldest = Math.min(...recent.map((p) => p.postedAt));
  return candidates
    .filter((c) => !listed.has(c.shortcode))
    .filter((c) => complete || (c.postedAt !== null && c.postedAt > oldest))
    .map((c) => c.id);
}

/** Checks one client. Returns how many posts were taken off the plan. */
export async function checkRemovedPosts(workspaceId: string, { minGapMs = CHECK_EVERY_MS } = {}): Promise<number> {
  if (!resultsConfigured()) return 0;
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("instagram_account_id, posts_checked_at").eq("id", workspaceId).maybeSingle();
  if (!ws?.instagram_account_id) return 0;
  if (ws.posts_checked_at && Date.now() - Date.parse(ws.posts_checked_at) < minGapMs) return 0;

  const { data: items } = await admin
    .from("content_items")
    .select("id, live_url, published_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .is("removed_at", null)
    .eq("keep_on_plan", false);
  const withCode = (items ?? []).flatMap((i) => {
    const shortcode = instagramShortcode(i.live_url);
    return shortcode ? [{ ...i, shortcode }] : [];
  });
  if (!withCode.length) return 0;

  // Claim this check, so two visitors at once don't both ask Make.
  const cutoff = new Date(Date.now() - minGapMs).toISOString();
  const { data: claimed } = await admin
    .from("workspaces")
    .update({ posts_checked_at: new Date().toISOString() })
    .eq("id", workspaceId)
    .or(`posts_checked_at.is.null,posts_checked_at.lt.${cutoff}`)
    .select("id");
  if (!claimed?.length) return 0;

  const result = await runScenario({ platform: "instagram_recent", account_id: ws.instagram_account_id });
  if ("error" in result) return 0;
  const recent = result.rows.flatMap((r) => {
    const shortcode = typeof r.shortcode === "string" ? r.shortcode : "";
    const postedAt = Date.parse(String(r.posted_at ?? ""));
    return shortcode && Number.isFinite(postedAt) ? [{ shortcode, postedAt }] : [];
  });

  // When it went out on Instagram: the time Instagram reported, else when it was marked published.
  const { data: insights } = await admin
    .from("post_insights")
    .select("content_item_id, posted_at")
    .eq("platform", "instagram")
    .in("content_item_id", withCode.map((i) => i.id));
  const postedOn = new Map((insights ?? []).map((r) => [r.content_item_id, r.posted_at]));
  const candidates = withCode.map((i) => {
    const at = Date.parse(postedOn.get(i.id) ?? i.published_at ?? "");
    return { id: i.id, shortcode: i.shortcode, postedAt: Number.isFinite(at) ? at : null };
  });

  const removed = findRemoved(candidates, recent);
  if (!removed.length) return 0;
  const { error } = await admin
    .from("content_items")
    .update({ removed_at: new Date().toISOString(), removed_from: "instagram" })
    .in("id", removed)
    .is("removed_at", null);
  if (error) {
    console.error("[post-removal] couldn't flag removed posts", error.message);
    return 0;
  }
  return removed.length;
}

/** Runs the check after the page has been sent, so nobody waits for Make. */
export function checkRemovedPostsLater(workspaceId: string, opts?: { minGapMs?: number }) {
  return checkRemovedPosts(workspaceId, opts).catch((error) => {
    console.error("[post-removal] check failed", error);
    return 0;
  });
}
