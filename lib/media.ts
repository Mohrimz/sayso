import "server-only";
import { signedUrl, signedUrls } from "@/lib/files";

export type MediaFile = {
  path?: string; // object in the content-media bucket
  url?: string; // external or demo file
  name: string;
  mime: string;
  size?: number;
};

export type SignedMedia = MediaFile & { src: string; kind: "image" | "video" | "file" };

export function parseMedia(value: unknown): MediaFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter((m): m is MediaFile => Boolean(m && typeof m === "object" && ("path" in m || "url" in m)));
}

function kindOf(mime: string): SignedMedia["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

/**
 * Short-lived links for post media (Cloudflare R2 or Supabase, see lib/files).
 * Callers pass media from versions the viewer can read (row-level security
 * means clients only get versions that were sent to them), so the links never
 * show anything they couldn't already see.
 */
export async function signMedia(files: MediaFile[], expiresIn = 60 * 60): Promise<SignedMedia[]> {
  const signed = await signedUrls(
    "content-media",
    files.filter((f) => f.path).map((f) => f.path!),
    expiresIn,
  );
  return files
    .map((f) => ({ ...f, kind: kindOf(f.mime), src: f.path ? (signed.get(f.path) ?? "") : (f.url ?? "") }))
    .filter((f) => f.src);
}

export type MediaDownload = { name: string; url: string; mime: string; size?: number; kind: SignedMedia["kind"] };

/**
 * Links that save a post's files under readable names (for published posts).
 * Same rule as signMedia: only pass media from versions the viewer can read.
 */
export async function mediaDownloads(files: MediaFile[], expiresIn = 60 * 60): Promise<MediaDownload[]> {
  const used = new Set<string>();
  const unique = (name: string) => {
    const clean = name.replace(/[\/:*?"<>|]+/g, "-").trim() || "file";
    let candidate = clean;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = clean.replace(/(\.[^./]+)?$/, ` (${n})$1`);
    used.add(candidate.toLowerCase());
    return candidate;
  };
  const links = await Promise.all(
    files.map(async (f): Promise<MediaDownload | null> => {
      const name = unique(f.name);
      const url = f.path ? await signedUrl("content-media", f.path, { expiresIn, download: name }).catch(() => null) : (f.url ?? null);
      if (!url) return null;
      const link: MediaDownload = { name, url, mime: f.mime, kind: kindOf(f.mime) };
      if (f.size) link.size = f.size;
      return link;
    }),
  );
  return links.filter((l): l is MediaDownload => l !== null);
}
