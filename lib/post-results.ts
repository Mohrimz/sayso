import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PlatformView, ResultsViews } from "@/components/post-results-card";

/**
 * Results for published posts, fetched through the agency's Make.com account.
 *
 * One Make scenario ("Sayso · Post results (Instagram + Facebook)") answers
 * both kinds of request:
 *   - Instagram: an account ID and the post's link code, returning insights
 *     (views, reach, likes, comments, shares, saves). About 3 Make operations.
 *   - Facebook Page: a Page ID and a time window, returning engagement
 *     (reactions, comments, shares) for Page posts made in that window. Make's
 *     Facebook app can't read Page views or reach. About 6 operations.
 * Results are cached in post_insights and refreshed when someone opens the
 * post, less often as the post gets older, to stay inside Make's allowance.
 *
 * Settings (server-only, from the environment):
 *   MAKE_API_TOKEN            Make API token with scenarios:run (secret)
 *   MAKE_ZONE                 e.g. eu1.make.com
 *   MAKE_RESULTS_SCENARIO_ID  the results scenario's ID
 *   INSTAGRAM_ACCOUNTS        "<instagram id>:<label>,..." for the client settings picker
 *   FACEBOOK_PAGES            "<page id>:<label>,..." for the client settings picker
 */

export type Platform = "instagram" | "facebook";
export type PostMetrics = Record<string, number>;

/** Nobody can force a refresh more often than this (protects the Make allowance). */
export const RESULTS_MIN_REFRESH_MS = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** How long saved results stay fresh: newer posts change faster. */
export function resultsMaxAge(postedAt: string | null | undefined): number {
  const age = postedAt ? Date.now() - Date.parse(postedAt) : 0;
  if (age < 3 * 24 * HOUR) return 6 * HOUR;
  if (age < 14 * 24 * HOUR) return 24 * HOUR;
  return 72 * HOUR;
}

export function resultsConfigured() {
  return Boolean(process.env.MAKE_API_TOKEN && process.env.MAKE_RESULTS_SCENARIO_ID);
}

function parseAccounts(value: string | undefined): { id: string; label: string }[] {
  return (value ?? "")
    .split(",")
    .map((entry) => {
      const at = entry.indexOf(":");
      const id = (at === -1 ? entry : entry.slice(0, at)).trim();
      const label = at === -1 ? id : entry.slice(at + 1).trim();
      return { id, label: label || id };
    })
    .filter((a) => /^\d{5,30}$/.test(a.id));
}

/** Instagram accounts the agency's Make connection can read, for the settings picker. */
export function instagramAccounts() {
  return parseAccounts(process.env.INSTAGRAM_ACCOUNTS);
}

/** Facebook Pages the agency's Make connection can read, for the settings picker. */
export function facebookPages() {
  return parseAccounts(process.env.FACEBOOK_PAGES);
}

/** The code in an Instagram post link: instagram.com/p/CODE, /reel/CODE or /tv/CODE. */
export function instagramShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const match = /^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/.exec(u.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export type FetchedResults =
  | { status: "ok"; mediaId: string | null; permalink: string | null; postedAt: string | null; metrics: PostMetrics }
  | { status: "not_found" }
  | { status: "error"; error: string };

type Row = Record<string, unknown>;

/** Runs the Make results scenario and returns its rows. */
async function runScenario(data: Record<string, string>): Promise<{ rows: Row[] } | { error: string }> {
  if (!resultsConfigured()) return { error: "Results aren't set up yet." };
  const zone = process.env.MAKE_ZONE || "eu1.make.com";
  try {
    const res = await fetch(`https://${zone}/api/v2/scenarios/${process.env.MAKE_RESULTS_SCENARIO_ID}/run`, {
      method: "POST",
      headers: { Authorization: `Token ${process.env.MAKE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data, responsive: true }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { outputs?: { results?: unknown }; result?: { outputs?: { results?: unknown } }; message?: string; detail?: string }
      | null;
    if (!res.ok) {
      console.error("[post-results] Make returned", res.status, body?.detail ?? body?.message);
      return { error: res.status === 401 || res.status === 403 ? "Make rejected the API token." : "Make couldn't be reached." };
    }
    // { executionId, outputs: { results: [...] } }; items may arrive as JSON strings.
    const raw = body?.outputs?.results ?? body?.result?.outputs?.results;
    const rows = (Array.isArray(raw) ? raw : [])
      .map((item) => {
        if (typeof item === "string") {
          try {
            return JSON.parse(item) as Row;
          } catch {
            return null;
          }
        }
        return item && typeof item === "object" ? (item as Row) : null;
      })
      .filter((row): row is Row => row !== null);
    return { rows };
  } catch (error) {
    console.error("[post-results] request failed", error);
    return { error: "Make didn't respond in time." };
  }
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/** Insights for one Instagram post, found by its link code among the account's latest 50. */
export async function fetchInstagramResults(accountId: string, shortcode: string): Promise<FetchedResults> {
  const result = await runScenario({ platform: "instagram", account_id: accountId, shortcode });
  if ("error" in result) return { status: "error", error: result.error };
  if (!result.rows.length) return { status: "not_found" };
  const metrics: PostMetrics = {};
  for (const row of result.rows) {
    const key = String(row.metric ?? "");
    const value = Number(row.value);
    if (key && Number.isFinite(value)) metrics[key] = value;
  }
  const first = result.rows[0];
  return { status: "ok", mediaId: text(first.media_id), permalink: text(first.permalink), postedAt: text(first.posted_at), metrics };
}

/**
 * Engagement for the Facebook Page post made closest to `around`, within
 * `windowMs` either side. Cross-posted content goes out within seconds of the
 * Instagram post, so that time is the best guide when we have it.
 */
export async function fetchFacebookResults(pageId: string, around: Date, windowMs: number): Promise<FetchedResults> {
  const result = await runScenario({
    platform: "facebook",
    page_id: pageId,
    since: new Date(around.getTime() - windowMs).toISOString(),
    until: new Date(around.getTime() + windowMs).toISOString(),
  });
  if ("error" in result) return { status: "error", error: result.error };
  const closest = result.rows
    .filter((row) => text(row.posted_at))
    .sort((a, b) => Math.abs(Date.parse(String(a.posted_at)) - around.getTime()) - Math.abs(Date.parse(String(b.posted_at)) - around.getTime()))[0];
  if (!closest) return { status: "not_found" };
  const metrics: PostMetrics = {};
  for (const key of ["reactions", "comments", "shares"]) {
    const value = Number(closest[key]);
    metrics[key] = Number.isFinite(value) ? value : 0;
  }
  return { status: "ok", mediaId: text(closest.post_id), permalink: text(closest.permalink), postedAt: text(closest.posted_at), metrics };
}

export type ResultsRow = {
  platform: string;
  status: string;
  metrics: unknown;
  permalink: string | null;
  posted_at: string | null;
  fetched_at: string;
  error: string | null;
};

/** The card's view of a saved row. Failed refreshes keep showing the last good numbers. */
export function viewFromRow(row: ResultsRow): PlatformView {
  const metrics = (row.metrics && typeof row.metrics === "object" ? row.metrics : {}) as PostMetrics;
  if (row.status === "not_found") return { state: "not_found", fetchedAt: row.fetched_at };
  if (row.status === "error") {
    return Object.keys(metrics).length
      ? { state: "ok", metrics, permalink: row.permalink, fetchedAt: row.fetched_at, warning: row.error ?? "Couldn't refresh just now." }
      : { state: "error", error: row.error ?? "Results couldn't be loaded.", fetchedAt: row.fetched_at };
  }
  return { state: "ok", metrics, permalink: row.permalink, fetchedAt: row.fetched_at };
}

export type ResultsItem = { id: string; status: string; live_url: string | null; platforms: string[] };
export type ResultsWorkspace = { instagram_account_id: string | null; facebook_page_id: string | null };

/** Why a platform has no results to fetch, if it doesn't. */
export function setupGap(platform: Platform, item: ResultsItem, ws: ResultsWorkspace): PlatformView | null {
  if (item.status !== "published") return { state: "not_published" };
  if (platform === "instagram") {
    if (!item.platforms.includes("instagram")) return { state: "not_used" };
    if (!resultsConfigured()) return { state: "not_configured" };
    if (!ws.instagram_account_id) return { state: "not_linked" };
    if (!instagramShortcode(item.live_url)) return { state: "no_link" };
    return null;
  }
  if (!item.platforms.includes("facebook")) return { state: "not_used" };
  if (!resultsConfigured()) return { state: "not_configured" };
  if (!ws.facebook_page_id) return { state: "not_linked" };
  return null;
}

/**
 * What the post page shows first, from saved results only (never calls Make),
 * and whether the card should fetch fresh numbers once it's on screen.
 */
export async function initialResultsView(item: ResultsItem, ws: ResultsWorkspace): Promise<{ views: ResultsViews; stale: boolean }> {
  const gaps = { instagram: setupGap("instagram", item, ws), facebook: setupGap("facebook", item, ws) };
  if (gaps.instagram && gaps.facebook) return { views: { instagram: gaps.instagram, facebook: gaps.facebook }, stale: false };

  const supabase = await createClient();
  const { data: rows } = await supabase.from("post_insights").select("*").eq("content_item_id", item.id);
  let stale = false;
  const viewFor = (platform: Platform): PlatformView => {
    const gap = gaps[platform];
    if (gap) return gap;
    const row = (rows ?? []).find((r) => r.platform === platform);
    if (!row) {
      stale = true;
      return { state: "pending" };
    }
    if (Date.now() - Date.parse(row.fetched_at) > resultsMaxAge(row.posted_at)) stale = true;
    return viewFromRow(row);
  };
  return { views: { instagram: viewFor("instagram"), facebook: viewFor("facebook") }, stale };
}
