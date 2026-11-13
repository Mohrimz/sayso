"use server";

import { createClient } from "@/lib/supabase/server";
import { findWorkspaceAccess, requireViewer } from "@/lib/auth";
import { removeFiles, signedUrls, uploadTarget, type Bucket, type UploadTarget } from "@/lib/files";
import { attachmentPrefix, isChannel, isUuid, MAX_FILE_BYTES as CHAT_MAX_BYTES, SIGNED_URL_TTL, type ChatChannel } from "@/lib/chat";
import { MAX_FILE_BYTES as LIBRARY_MAX_BYTES, MAX_FILES_PER_UPLOAD } from "@/lib/library";

/**
 * Uploading goes: the browser asks here for a link for each file, sends the
 * file straight to storage (Cloudflare R2 or Supabase), then saves the paths
 * with the usual action (new post version, Library entry, chat message,
 * profile picture). This is where "who may upload where" is checked.
 */

export type UploadScope =
  | { scope: "content"; itemId: string }
  | { scope: "library"; workspaceId: string }
  | { scope: "chat"; workspaceId: string; channel: ChatChannel }
  | { scope: "avatar" };

export type UploadRequest = { path: string; size: number };
export type PreparedUpload = { path: string; target: UploadTarget };

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Which bucket and path prefix a scope may write to, after checking the person's access. */
async function resolveScope(input: UploadScope): Promise<{ bucket: Bucket; prefix: string; maxBytes: number } | { error: string }> {
  if (input.scope === "avatar") {
    const viewer = await requireViewer();
    return { bucket: "avatars", prefix: `${viewer.id}/`, maxBytes: AVATAR_MAX_BYTES };
  }
  if (input.scope === "content") {
    if (!isUuid(input.itemId)) return { error: "Post not found." };
    const supabase = await createClient();
    const { data: item } = await supabase.from("content_items").select("id, workspace_id").eq("id", input.itemId).maybeSingle();
    if (!item) return { error: "Post not found." };
    const access = await findWorkspaceAccess("id", item.workspace_id);
    if (!access?.can.editContent) return { error: "Only the agency team can upload content." };
    return { bucket: "content-media", prefix: `${item.workspace_id}/${item.id}/`, maxBytes: LIBRARY_MAX_BYTES };
  }
  if (!isUuid(input.workspaceId)) return { error: "Client not found." };
  if (input.scope === "library") {
    const access = await findWorkspaceAccess("id", input.workspaceId);
    if (!access?.can.uploadFiles) return { error: "You can't add files to this Library." };
    return { bucket: "workspace-files", prefix: `${input.workspaceId}/library/`, maxBytes: LIBRARY_MAX_BYTES };
  }
  // Chat: the same check the database uses for messages.
  if (!isChannel(input.channel)) return { error: "Chat not found." };
  await requireViewer();
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_access_chat", { p_ws: input.workspaceId, p_channel: input.channel });
  if (!allowed) return { error: "You can't send files in this chat." };
  return { bucket: "chat-files", prefix: attachmentPrefix(input.workspaceId, input.channel), maxBytes: CHAT_MAX_BYTES };
}

function validPath(path: string, prefix: string) {
  return typeof path === "string" && path.startsWith(prefix) && path.length > prefix.length && path.length <= 400 && !path.includes("..") && !path.includes("//");
}

/** Upload links for files the browser is about to send. */
export async function prepareUploads(
  input: UploadScope,
  files: UploadRequest[],
): Promise<{ ok: true; uploads: PreparedUpload[] } | { ok: false; error: string }> {
  if (!Array.isArray(files) || !files.length) return { ok: false, error: "No files chosen." };
  if (files.length > MAX_FILES_PER_UPLOAD) return { ok: false, error: `Up to ${MAX_FILES_PER_UPLOAD} files at a time.` };
  const scope = await resolveScope(input);
  if ("error" in scope) return { ok: false, error: scope.error };

  const uploads: PreparedUpload[] = [];
  for (const file of files) {
    if (!validPath(file.path, scope.prefix)) return { ok: false, error: "That file can't be uploaded here." };
    if (Number(file.size) > scope.maxBytes) return { ok: false, error: `Files can be up to ${Math.round(scope.maxBytes / 1024 / 1024)} MB.` };
    const target = await uploadTarget(scope.bucket, file.path);
    if (!target) return { ok: false, error: "The upload couldn't be prepared. Please try again." };
    uploads.push({ path: file.path, target });
  }
  return { ok: true, uploads };
}

/** Removes files that were uploaded but never used (e.g. a chat attachment that wasn't sent). */
export async function discardUploads(input: UploadScope, paths: string[]): Promise<void> {
  const scope = await resolveScope(input);
  if ("error" in scope) return;
  await removeFiles(
    scope.bucket,
    (Array.isArray(paths) ? paths : []).filter((p) => validPath(p, scope.prefix)),
  );
}

/** Links for chat attachments the person can see (new messages arriving live). */
export async function signChatAttachments(workspaceId: string, channel: ChatChannel, paths: string[]): Promise<Record<string, string>> {
  const scope = await resolveScope({ scope: "chat", workspaceId, channel });
  if ("error" in scope) return {};
  const allowed = (Array.isArray(paths) ? paths : []).filter((p) => validPath(p, scope.prefix));
  return Object.fromEntries(await signedUrls("chat-files", allowed, SIGNED_URL_TTL));
}
