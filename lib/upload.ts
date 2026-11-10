"use client";

import { createClient } from "@/lib/supabase/client";
import { prepareUploads, type PreparedUpload, type UploadScope } from "@/app/actions/files";

type Target = PreparedUpload["target"];

/** Sends one file to the link the server prepared. Returns an error message, or null when it worked. */
export async function sendToTarget(target: Target, file: Blob, contentType: string): Promise<string | null> {
  try {
    if (target.kind === "r2") {
      const res = await fetch(target.url, { method: "PUT", body: file, headers: { "content-type": contentType || "application/octet-stream" } });
      return res.ok ? null : `Upload failed (${res.status}).`;
    }
    const { error } = await createClient().storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, file, { contentType });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : "Upload failed.";
  }
}

/**
 * Uploads files to the given storage paths (checked on the server for this
 * scope). Each file reports back as it finishes. Returns the paths that failed,
 * with why.
 */
export async function uploadFiles(
  scope: UploadScope,
  items: { path: string; file: Blob; type?: string }[],
  onDone?: (path: string, error: string | null) => void,
): Promise<{ error?: string; failed: Map<string, string> }> {
  const failed = new Map<string, string>();
  if (!items.length) return { failed };
  const prepared = await prepareUploads(
    scope,
    items.map((i) => ({ path: i.path, size: i.file.size })),
  );
  if (!prepared.ok) {
    for (const i of items) {
      failed.set(i.path, prepared.error);
      onDone?.(i.path, prepared.error);
    }
    return { error: prepared.error, failed };
  }
  const targets = new Map(prepared.uploads.map((u) => [u.path, u.target]));
  for (const item of items) {
    const target = targets.get(item.path);
    const error = target ? await sendToTarget(target, item.file, item.type || item.file.type || "application/octet-stream") : "The upload couldn't be prepared.";
    if (error) failed.set(item.path, error);
    onDone?.(item.path, error);
  }
  return { failed };
}
