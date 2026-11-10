"use server";

import { createClient } from "@/lib/supabase/server";
import { removeFiles } from "@/lib/files";
import { findWorkspaceAccess, requireViewer } from "@/lib/auth";
import { deliverNotificationsLater, friendlyError } from "@/lib/action-helpers";
import { signChatFiles } from "@/lib/chat-data";
import {
  attachmentPrefix,
  MAX_MENTIONS,
  isChannel,
  isUuid,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  MESSAGE_COLUMNS,
  toChatMessage,
  type ChatAttachment,
  type ChatMessage,
} from "@/lib/chat";

export type SendResult =
  | { ok: true; message: ChatMessage; signed: Record<string, string> }
  | { ok: false; error: string };

/**
 * Posts a message. The browser picks the id, so its optimistic copy and the
 * realtime echo are recognised as the same message, and a retry after a lost
 * response can't post twice.
 */
export async function sendMessage(input: {
  id: string;
  workspaceId: string;
  channel: string;
  body: string;
  attachments: ChatAttachment[];
  /** People @mentioned. The database keeps only people who can read this chat. */
  mentions?: string[];
}): Promise<SendResult> {
  const viewer = await requireViewer();
  const { id, workspaceId, channel } = input ?? {};
  if (!isUuid(id) || !isUuid(workspaceId) || !isChannel(channel)) return { ok: false, error: "That message couldn't be sent." };

  const access = await findWorkspaceAccess("id", workspaceId);
  if (!access) return { ok: false, error: "You don't have access to this chat." };
  if (channel === "team" && !access.can.isAgency) return { ok: false, error: "Only the agency team can use the team chat." };

  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.` };

  const prefix = attachmentPrefix(workspaceId, channel);
  const raw = Array.isArray(input.attachments) ? input.attachments : [];
  if (raw.length > MAX_FILES_PER_MESSAGE) return { ok: false, error: `You can attach up to ${MAX_FILES_PER_MESSAGE} files at once.` };
  const attachments: ChatAttachment[] = raw
    .filter((a) => a && typeof a.path === "string" && a.path.startsWith(prefix) && !a.path.includes(".."))
    .map((a) => ({
      path: a.path,
      name: String(a.name ?? "file").slice(0, 200),
      mime: String(a.mime ?? "application/octet-stream").slice(0, 100),
      size: Math.min(Math.max(Number(a.size) || 0, 0), MAX_FILE_BYTES),
    }));
  if (attachments.length !== raw.length) return { ok: false, error: "One of the files doesn't belong to this chat." };
  if (!body && !attachments.length) return { ok: false, error: "Write a message first." };
  const mentions = [...new Set((Array.isArray(input.mentions) ? input.mentions : []).filter(isUuid))].slice(0, MAX_MENTIONS);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ id, workspace_id: workspaceId, channel, author_id: viewer.id, body, attachments, mentions })
    .select(MESSAGE_COLUMNS)
    .single();

  let row = data;
  if (error) {
    // A retry of a message that did go through the first time.
    if (error.code !== "23505") return { ok: false, error: friendlyError(error) };
    const { data: existing } = await supabase.from("messages").select(MESSAGE_COLUMNS).eq("id", id).maybeSingle();
    if (!existing || existing.author_id !== viewer.id) return { ok: false, error: "That message couldn't be sent." };
    row = existing;
  }
  if (!row) return { ok: false, error: "That message couldn't be sent." };

  deliverNotificationsLater();
  const message = toChatMessage(row);
  const signed = await signChatFiles(message.attachments.map((a) => a.path));
  return { ok: true, message, signed };
}

/** Deletes a message (authors, or agency admins) and removes its files. */
export async function deleteMessage(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireViewer();
  if (!isUuid(id)) return { ok: false, error: "Message not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_message", { p_id: id });
  if (error) return { ok: false, error: friendlyError(error) };

  const paths = Array.isArray(data)
    ? data.map((a) => (a && typeof a === "object" && "path" in a ? String(a.path) : "")).filter(Boolean)
    : [];
  if (paths.length) {
    await removeFiles("chat-files", paths).catch((e) => console.error("[chat] could not remove files", e));
  }
  return { ok: true };
}
