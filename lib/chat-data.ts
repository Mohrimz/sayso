import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAgencyAssignees, getPeople, getWorkspaceMembers } from "@/lib/queries";
import type { WorkspaceAccess } from "@/lib/auth";
import { signedUrls } from "@/lib/files";
import {
  CHAT_PAGE_SIZE,
  MESSAGE_COLUMNS,
  SIGNED_URL_TTL,
  toChatMessage,
  type ChatChannel,
  type ChatData,
  type ChatPerson,
} from "@/lib/chat";

/**
 * Links for attachment paths. Callers pass paths from messages the viewer can
 * read (row-level security), so they're already allowed to see them.
 */
export async function signChatFiles(paths: string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await signedUrls("chat-files", paths, SIGNED_URL_TTL));
}

export async function loadChat(access: WorkspaceAccess, channel: ChatChannel): Promise<ChatData> {
  const supabase = await createClient();
  const ws = access.workspace;

  const [{ data: rows }, { data: reads }, members, agency] = await Promise.all([
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("workspace_id", ws.id)
      .eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(CHAT_PAGE_SIZE + 1),
    supabase.from("chat_reads").select("user_id, last_read_at").eq("workspace_id", ws.id).eq("channel", channel),
    getWorkspaceMembers(ws.id),
    getAgencyAssignees(ws.id),
  ]);

  const hasMore = (rows ?? []).length > CHAT_PAGE_SIZE;
  const messages = (rows ?? []).slice(0, CHAT_PAGE_SIZE).reverse().map(toChatMessage);

  // Who's in the conversation: the team chat has no clients, and the direct chat has no team members.
  const clients = channel === "team" ? [] : members.filter((m) => m.side === "client");
  const staff = channel === "direct" ? agency.filter((a) => a.isAdmin) : agency;
  const toChatPerson = (p: { id: string; name: string; side: ChatPerson["side"]; avatar: string | null; jobTitle: string | null }): ChatPerson => ({
    id: p.id,
    name: p.name,
    side: p.side,
    avatar: p.avatar,
    jobTitle: p.jobTitle,
  });
  const roster: ChatPerson[] = [...clients.map(toChatPerson), ...staff.map(toChatPerson)];
  const people: Record<string, ChatPerson> = Object.fromEntries(roster.map((p) => [p.id, p]));

  // Authors who are no longer on the roster (e.g. removed from the client).
  const missing = messages.map((m) => m.author_id).filter((id): id is string => Boolean(id) && !people[id!]);
  if (missing.length) {
    for (const [id, p] of await getPeople(missing)) people[id] = toChatPerson(p);
  }

  // Read receipts ("Seen by") are for the agency only; row-level security also
  // limits clients to their own marker.
  const seesReceipts = access.viewer.side === "agency";
  const readers: Record<string, string> = {};
  let lastReadAt: string | null = null;
  for (const r of reads ?? []) {
    if (r.user_id === access.viewer.id) lastReadAt = r.last_read_at;
    else if (seesReceipts) readers[r.user_id] = r.last_read_at;
  }

  const signed = await signChatFiles(messages.flatMap((m) => m.attachments.map((a) => a.path)),
  );

  return { messages, hasMore, people, participants: roster.map((p) => p.id), lastReadAt, readers, signed };
}
