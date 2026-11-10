// Small Cloudflare R2 helper for scripts (the app uses lib/files.ts).
// Objects are stored as <R2_KEY_PREFIX><bucket>/<path>, matching lib/files.ts.
import { AwsClient } from "aws4fetch";

export function r2Enabled() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

let client;
function r2() {
  client ??= new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  return client;
}

function objectUrl(bucket, path) {
  const key = `${process.env.R2_KEY_PREFIX ?? ""}${bucket}/${path}`;
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Size of an object in R2, or null when it isn't there. */
export async function r2Size(bucket, path) {
  const res = await r2().fetch(objectUrl(bucket, path), { method: "HEAD" });
  return res.ok ? Number(res.headers.get("content-length") ?? 0) : null;
}

export async function r2Put(bucket, path, body, contentType) {
  const res = await r2().fetch(objectUrl(bucket, path), { method: "PUT", body, headers: { "content-type": contentType || "application/octet-stream" } });
  if (!res.ok) throw new Error(`R2 upload failed for ${bucket}/${path}: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
}

/** Checks the key works: writes, reads and deletes a small test object. */
export async function r2SelfTest() {
  const path = `.sayso-check/${Date.now()}.txt`;
  await r2Put("check", path, "ok", "text/plain");
  const size = await r2Size("check", path);
  await r2().fetch(objectUrl("check", path), { method: "DELETE" });
  return size === 2;
}
