import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type { AssistantMessage } from "@/lib/assistant/run";
import type { ChatSummary, TurnMeta } from "@/lib/assistant/shared";

/**
 * Saved Sayso conversations. Row-level security keeps every chat private to
 * the person who had it, so these always run as the signed-in user.
 */

type DB = SupabaseClient<Database>;

export type StoredChat = { id: string; title: string; messages: AssistantMessage[]; metas: TurnMeta[] };

export async function listChats(supabase: DB, limit = 50): Promise<ChatSummary[]> {
  const { data } = await supabase
    .from("assistant_chats")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

export async function loadChat(supabase: DB, id: string): Promise<StoredChat | null> {
  const { data } = await supabase.from("assistant_chats").select("id, title, messages, metas").eq("id", id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    messages: Array.isArray(data.messages) ? (data.messages as unknown as AssistantMessage[]) : [],
    metas: Array.isArray(data.metas) ? (data.metas as unknown as TurnMeta[]) : [],
  };
}

/** Saves a chat after a successful answer: creates it on the first question, then updates it. */
export async function saveChat(
  supabase: DB,
  chat: { id: string | null; title: string; messages: AssistantMessage[]; metas: TurnMeta[] },
): Promise<string | null> {
  const values = {
    messages: chat.messages as unknown as NonNullable<Json>,
    metas: chat.metas as unknown as NonNullable<Json>,
    updated_at: new Date().toISOString(),
  };
  if (chat.id) {
    const { error } = await supabase.from("assistant_chats").update(values).eq("id", chat.id);
    if (error) {
      console.error("[assistant] saving chat failed", error.message);
      return null;
    }
    return chat.id;
  }
  const { data, error } = await supabase
    .from("assistant_chats")
    .insert({ ...values, title: chat.title })
    .select("id")
    .single();
  if (error) {
    console.error("[assistant] creating chat failed", error.message);
    return null;
  }
  return data.id;
}
