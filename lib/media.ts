import "server-only";
import { signedUrls } from "@/lib/files";

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
