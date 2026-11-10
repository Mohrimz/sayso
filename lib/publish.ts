import "server-only";
import { filesArePublic } from "@/lib/files";
import { captionFor } from "@/lib/content";

/**
 * Publishing approved posts to Instagram and Facebook through the agency's
 * Make.com scenario "Sayso · Publish post (Instagram + Facebook)". Each call
 * publishes to one platform. Instagram and Facebook download the media
 * themselves, so files are passed as short-lived signed links, which only works
 * when storage is on the internet (the live site), not on a local copy.
 *
 * Settings: MAKE_API_TOKEN, MAKE_ZONE, MAKE_PUBLISH_SCENARIO_ID.
 */

export type PublishPlatform = "instagram" | "facebook";
export type PublishKind = "photo" | "carousel" | "reel";
export type PublishFile = { url: string; mime: string };

export function publishingConfigured() {
  return Boolean(process.env.MAKE_API_TOKEN && process.env.MAKE_PUBLISH_SCENARIO_ID);
}

/** Which kind of post a content type becomes, or why it can't be published automatically. */
export function publishKind(type: string, files: PublishFile[]): { kind: PublishKind } | { reason: string } {
  const videos = files.filter((f) => f.mime.startsWith("video/"));
  const images = files.filter((f) => f.mime.startsWith("image/"));
  if (type === "story") return { reason: "Stories can't be published automatically yet. Post it in the app, then mark it as published." };
  if (type === "reel") {
    return videos.length ? { kind: "reel" } : { reason: "A reel needs a video file." };
  }
  if (files.length >= 2) return { kind: "carousel" };
  if (images.length === 1) return { kind: "photo" };
  if (videos.length === 1) return { kind: "reel" };
  return { reason: "Upload the photo or video first." };
}

/** Caption for a platform, with the hashtags added if they aren't in it already. */
export function publishCaption(captions: unknown, hashtags: string | null, platform: PublishPlatform) {
  const caption = captionFor(captions, platform).trim();
  const tags = (hashtags ?? "").trim();
  if (!tags || caption.includes(tags)) return caption;
  return caption ? `${caption}\n\n${tags}` : tags;
}

/** Instagram only accepts JPEG photos through its publishing API. */
export function instagramPhotoProblem(files: PublishFile[]): string | null {
  const bad = files.find((f) => f.mime.startsWith("image/") && f.mime !== "image/jpeg");
  return bad ? "Instagram only accepts JPG photos for automatic publishing. Upload JPG versions, or post it by hand." : null;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

/** Whether Instagram and Facebook could download this file (a storage file needs public storage). */
function reachable(file: { path?: string; url?: string }) {
  if (file.path) return filesArePublic();
  try {
    const url = new URL(file.url ?? "");
    return url.protocol === "https:" && !LOCAL_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export type PublishTarget = { platform: PublishPlatform; accountId: string };
export type PublishPlan =
  | { ok: true; kind: PublishKind; targets: PublishTarget[]; manual: string[] }
  | { ok: false; reason: string };

/**
 * Whether an approved post can be published automatically, and where to.
 * `media` is the approved version's files; `manual` lists the other platforms
 * on the post (TikTok etc.) that still need posting by hand.
 */
export function publishPlan(
  item: { type: string; platforms: string[] },
  workspace: { instagram_account_id: string | null; facebook_page_id: string | null },
  media: { path?: string; url?: string; mime: string }[],
  platformLabel: (id: string) => string,
): PublishPlan {
  if (!publishingConfigured()) return { ok: false, reason: "Automatic publishing isn't switched on for this site yet." };
  const wanted = item.platforms.filter((p): p is PublishPlatform => p === "instagram" || p === "facebook");
  const manual = item.platforms.filter((p) => p !== "instagram" && p !== "facebook").map(platformLabel);
  if (!wanted.length) return { ok: false, reason: "This post isn't set to go on Instagram or Facebook." };

  const targets: PublishTarget[] = [];
  for (const platform of wanted) {
    const accountId = platform === "instagram" ? workspace.instagram_account_id : workspace.facebook_page_id;
    if (!accountId) {
      return { ok: false, reason: `Link this client's ${platform === "instagram" ? "Instagram account" : "Facebook Page"} in Settings first.` };
    }
    targets.push({ platform, accountId });
  }

  const files = media.filter((m) => m.mime.startsWith("image/") || m.mime.startsWith("video/"));
  const kind = publishKind(item.type, files.map((f) => ({ url: "", mime: f.mime })));
  if ("reason" in kind) return { ok: false, reason: kind.reason };
  if (kind.kind === "carousel" && files.length > 10) return { ok: false, reason: "A carousel can have at most 10 photos or videos." };
  if (kind.kind === "reel" && !files.some((f) => f.mime === "video/mp4" || f.mime === "video/quicktime")) {
    return { ok: false, reason: "Instagram and Facebook need the reel as an MP4 or MOV video." };
  }
  if (targets.some((t) => t.platform === "instagram") && kind.kind !== "reel") {
    const problem = instagramPhotoProblem(files.map((f) => ({ url: "", mime: f.mime })));
    if (problem) return { ok: false, reason: problem };
  }
  if (targets.some((t) => t.platform === "facebook") && kind.kind === "carousel" && files.some((f) => f.mime.startsWith("video/"))) {
    return { ok: false, reason: "Facebook can't post photos and videos together automatically. Post it by hand." };
  }
  if (!files.every(reachable)) {
    return {
      ok: false,
      reason: "Instagram and Facebook can't download files stored on this computer. Publish from the live site, or switch file storage to Cloudflare R2.",
    };
  }
  return { ok: true, kind: kind.kind, targets, manual };
}

export type PublishOutcome = { ok: true; postId: string; permalink: string | null } | { ok: false; error: string };

type MakeBody = {
  outputs?: Record<string, unknown>;
  result?: { outputs?: Record<string, unknown> };
  executionId?: string;
  statusUrl?: string;
  status?: string;
  message?: string;
  detail?: string;
};

function outputsOf(body: MakeBody | null) {
  return body?.outputs ?? body?.result?.outputs ?? null;
}

/**
 * Publishes one post to one platform and returns the new post's ID and link.
 * Reels can take a few minutes to process, so if Make hasn't finished when it
 * replies, we keep checking the run until it does.
 */
export async function publishTo(
  platform: PublishPlatform,
  input: { kind: PublishKind; accountId: string; caption: string; files: PublishFile[] },
): Promise<PublishOutcome> {
  if (!publishingConfigured()) return { ok: false, error: "Publishing isn't set up on this site yet." };
  const zone = process.env.MAKE_ZONE || "eu1.make.com";
  const headers = { Authorization: `Token ${process.env.MAKE_API_TOKEN}`, "Content-Type": "application/json" };

  const image = input.files.find((f) => f.mime.startsWith("image/"));
  const video = input.files.find((f) => f.mime.startsWith("video/"));
  const data: Record<string, string> = {
    platform,
    kind: input.kind,
    caption: input.caption,
    [platform === "instagram" ? "account_id" : "page_id"]: input.accountId,
  };
  if (image) data.image_url = image.url;
  if (video) data.video_url = video.url;
  if (input.kind === "carousel" || (platform === "facebook" && input.kind === "photo")) {
    data.payload = JSON.stringify({
      files: input.files.map((f) =>
        f.mime.startsWith("video/") ? { media_type: "VIDEO", video_url: f.url } : { media_type: "IMAGE", image_url: f.url },
      ),
      photos: input.files.filter((f) => f.mime.startsWith("image/")).map((f) => ({ type: "url", url: f.url })),
    });
  }

  let body: MakeBody | null = null;
  try {
    const res = await fetch(`https://${zone}/api/v2/scenarios/${process.env.MAKE_PUBLISH_SCENARIO_ID}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data, responsive: true }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    body = (await res.json().catch(() => null)) as MakeBody | null;
    if (!res.ok) {
      console.error("[publish] Make returned", res.status, body?.detail ?? body?.message);
      return { ok: false, error: res.status === 401 || res.status === 403 ? "Make rejected the API token." : "Make couldn't start publishing." };
    }
  } catch (error) {
    console.error("[publish] request failed", error);
    return { ok: false, error: "Make didn't respond. Check Instagram and Facebook before trying again, in case it went out." };
  }

  let outputs = outputsOf(body);
  // Still running (long reels): check the run until it finishes, for up to 3 minutes.
  if (!outputs?.post_id && body?.executionId) {
    const statusUrl =
      body.statusUrl ?? `https://${zone}/api/v2/scenarios/${process.env.MAKE_PUBLISH_SCENARIO_ID}/executions/${body.executionId}`;
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const check = (await fetch(statusUrl, { headers, cache: "no-store" }).then((r) => r.json()).catch(() => null)) as MakeBody | null;
      const status = String(check?.status ?? "").toUpperCase();
      outputs = outputsOf(check) ?? outputs;
      if (outputs?.post_id) break;
      if (status && status !== "RUNNING" && status !== "PENDING" && status !== "QUEUED") {
        if (status !== "SUCCESS") return { ok: false, error: `${platform === "instagram" ? "Instagram" : "Facebook"} didn't accept the post. Check the file and caption, then try again.` };
        break;
      }
    }
  }

  const postId = typeof outputs?.post_id === "string" && outputs.post_id ? outputs.post_id : null;
  if (!postId) {
    return {
      ok: false,
      error: `${platform === "instagram" ? "Instagram" : "Facebook"} didn't confirm the post. Check the account before trying again, in case it went out.`,
    };
  }
  const link = typeof outputs?.permalink === "string" && /^https:\/\//.test(outputs.permalink) && !outputs.permalink.endsWith("/reel/") ? outputs.permalink : null;
  return { ok: true, postId, permalink: link };
}
