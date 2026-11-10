import "server-only";
import { AwsClient } from "aws4fetch";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Where Sayso keeps files: post media, the Library, chat attachments and
 * profile pictures.
 *
 * - **Cloudflare R2**, when R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   and R2_BUCKET are set. Objects are stored as `<bucket>/<path>` (plus an
 *   optional R2_KEY_PREFIX), so paths saved in the database stay the same.
 * - **Supabase Storage** otherwise (the original setup), using the same buckets.
 *
 * Everything goes through the server. Callers check who may see or change a
 * file first; the browser only ever gets short-lived links.
 */

export type Bucket = "content-media" | "workspace-files" | "chat-files" | "avatars";

export function r2Enabled() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

/** True when Instagram, Facebook and other outside services can download our file links. */
export function filesArePublic() {
  if (r2Enabled()) return true;
  try {
    const host = new URL(SUPABASE_URL).hostname;
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) && !host.endsWith(".local");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cloudflare R2 (S3-compatible), signed with aws4fetch
// ---------------------------------------------------------------------------

let r2: AwsClient | null = null;
function r2Client() {
  r2 ??= new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  return r2;
}

function r2Key(bucket: Bucket, path: string) {
  return `${process.env.R2_KEY_PREFIX ?? ""}${bucket}/${path}`;
}

function r2Url(key: string) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${encoded}`);
}

async function r2Presign(method: "GET" | "PUT", key: string, expiresIn: number, query: Record<string, string> = {}) {
  const url = r2Url(key);
  url.searchParams.set("X-Amz-Expires", String(Math.min(Math.max(expiresIn, 60), 604800)));
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await r2Client().sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------------------
// The operations the app uses
// ---------------------------------------------------------------------------

/** Short-lived links for viewing files, keyed by path. Missing files are left out. */
export async function signedUrls(bucket: Bucket, paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  if (r2Enabled()) {
    const urls = await Promise.all(unique.map((p) => r2Presign("GET", r2Key(bucket, p), expiresIn)));
    unique.forEach((p, i) => out.set(p, urls[i]));
    return out;
  }
  const { data } = await createAdminClient().storage.from(bucket).createSignedUrls(unique, expiresIn);
  for (const entry of data ?? []) if (entry.path && entry.signedUrl) out.set(entry.path, entry.signedUrl);
  return out;
}

/** One short-lived link; with `download`, the browser saves it under that name. */
export async function signedUrl(bucket: Bucket, path: string, opts: { expiresIn?: number; download?: string } = {}): Promise<string | null> {
  const expiresIn = opts.expiresIn ?? 3600;
  if (r2Enabled()) {
    return r2Presign("GET", r2Key(bucket, path), expiresIn, opts.download ? { "response-content-disposition": contentDisposition(opts.download) } : {});
  }
  const { data } = await createAdminClient()
    .storage.from(bucket)
    .createSignedUrl(path, expiresIn, opts.download ? { download: opts.download } : undefined);
  return data?.signedUrl ?? null;
}

/** Where the browser sends a file it uploads straight to storage. */
export type UploadTarget = { kind: "r2"; url: string } | { kind: "supabase"; bucket: Bucket; path: string; token: string };

export async function uploadTarget(bucket: Bucket, path: string): Promise<UploadTarget | null> {
  if (r2Enabled()) return { kind: "r2", url: await r2Presign("PUT", r2Key(bucket, path), 900) };
  const { data } = await createAdminClient().storage.from(bucket).createSignedUploadUrl(path);
  return data?.token ? { kind: "supabase", bucket, path, token: data.token } : null;
}

/** Size and type of a stored file, or null when it isn't there. */
export async function fileInfo(bucket: Bucket, path: string): Promise<{ size: number; type: string } | null> {
  if (r2Enabled()) {
    const res = await r2Client().fetch(r2Url(r2Key(bucket, path)), { method: "HEAD" });
    if (!res.ok) return null;
    return { size: Number(res.headers.get("content-length") ?? 0), type: res.headers.get("content-type") ?? "application/octet-stream" };
  }
  const slash = path.lastIndexOf("/");
  const { data } = await createAdminClient()
    .storage.from(bucket)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  const found = data?.find((f) => f.name === path.slice(slash + 1));
  if (!found) return null;
  const meta = (found.metadata ?? {}) as { size?: number; mimetype?: string };
  return { size: Number(meta.size ?? 0), type: meta.mimetype ?? "application/octet-stream" };
}

/** Saves a file from the server (scripts and server-side copies). */
export async function putFile(bucket: Bucket, path: string, body: ArrayBuffer | Uint8Array | Blob, contentType: string) {
  if (r2Enabled()) {
    const res = await r2Client().fetch(r2Url(r2Key(bucket, path)), { method: "PUT", body: body as BodyInit, headers: { "content-type": contentType } });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return;
  }
  const { error } = await createAdminClient().storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(error.message);
}

/** Deletes files. Missing files are ignored. */
export async function removeFiles(bucket: Bucket, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  if (r2Enabled()) {
    await Promise.all(unique.map((p) => r2Client().fetch(r2Url(r2Key(bucket, p)), { method: "DELETE" })));
    return;
  }
  await createAdminClient().storage.from(bucket).remove(unique);
}

/** Paths of every file directly inside a folder, e.g. someone's avatar folder. */
export async function listFolder(bucket: Bucket, folder: string): Promise<string[]> {
  const prefix = folder.replace(/\/?$/, "/");
  if (r2Enabled()) {
    const url = r2Url(`${process.env.R2_KEY_PREFIX ?? ""}${bucket}`);
    url.pathname = `/${process.env.R2_BUCKET}`;
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", r2Key(bucket, prefix));
    url.searchParams.set("delimiter", "/");
    const res = await r2Client().fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const start = r2Key(bucket, "").length;
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1]).slice(start));
  }
  const { data } = await createAdminClient().storage.from(bucket).list(prefix.slice(0, -1), { limit: 1000 });
  return (data ?? []).filter((f) => f.id).map((f) => `${prefix}${f.name}`);
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
