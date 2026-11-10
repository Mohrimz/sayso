"use server";

import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/chat";
import { listChats, loadChat } from "@/lib/assistant/chats";
import { getAllowance } from "@/lib/assistant/allowance";
import { toTurns, type Allowance, type ChatSummary, type SavedChat } from "@/lib/assistant/shared";

/** Saved Sayso chats for the signed-in agency member. Row-level security keeps each chat private. */
async function agencyClient() {
  const viewer = await getViewer();
  if (!viewer || viewer.side !== "agency") return null;
  return createClient();
}

/** What's left of the signed-in person's 24-hour spending allowance. */
export async function getSaysoAllowance(): Promise<Allowance | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.side !== "agency") return null;
  return getAllowance(await createClient(), viewer);
}

export async function listSaysoChats(): Promise<ChatSummary[]> {
  const supabase = await agencyClient();
  return supabase ? listChats(supabase) : [];
}

export async function getSaysoChat(id: string): Promise<SavedChat | null> {
  if (!isUuid(id)) return null;
  const supabase = await agencyClient();
  if (!supabase) return null;
  const chat = await loadChat(supabase, id);
  return chat ? { id: chat.id, title: chat.title, turns: toTurns(chat.messages, chat.metas) } : null;
}

export async function deleteSaysoChat(id: string): Promise<{ ok: boolean }> {
  if (!isUuid(id)) return { ok: false };
  const supabase = await agencyClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from("assistant_chats").delete().eq("id", id);
  return { ok: !error };
}
