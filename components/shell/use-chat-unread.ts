"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { chatKey, type ChatChannel } from "@/lib/chat";

/**
 * Unread chat counts for the navigation badges, kept live.
 *
 * Starts from the server's counts (keyed "<workspace id>:<channel>"), adds one
 * for each new message someone else posts, and zeroes a conversation while
 * it's open (the chat page marks it read on the server).
 */
export function useChatUnread(initial: Record<string, number>, viewerId: string, viewing: string | null) {
  const [state, setState] = useState({ base: initial, counts: initial });

  // Fresh server counts (after a refresh) replace the local tally.
  let counts = state.counts;
  if (state.base !== initial) {
    counts = viewing ? { ...initial, [viewing]: 0 } : initial;
    setState({ base: initial, counts });
  } else if (viewing && counts[viewing]) {
    counts = { ...counts, [viewing]: 0 };
    setState({ base: initial, counts });
  }

  const onMessage = useEffectEvent((row: { workspace_id?: string; channel?: ChatChannel; author_id?: string | null }) => {
    if (!row.workspace_id || !row.channel || row.author_id === viewerId) return;
    const key = chatKey(row.workspace_id, row.channel);
    if (key === viewing) return;
    setState((s) => ({ ...s, counts: { ...s.counts, [key]: (s.counts[key] ?? 0) + 1 } }));
  });

  useEffect(() => {
    if (!viewerId) return;
    const supabase = createClient();
    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    void (async () => {
      // Join as the signed-in user: row-level security then limits this to
      // conversations the viewer can read.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      ch = supabase
        .channel(`chat-unread:${viewerId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onMessage(p.new))
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [viewerId]);

  return counts;
}

/** Which conversation a path shows, as a chatKey, or null. */
export function viewingChat(pathname: string, workspaces: { id: string; slug: string }[]): string | null {
  const match = /^\/w\/([^/]+)\/chat(\/team)?\/?$/.exec(pathname);
  if (!match) return null;
  const ws = workspaces.find((w) => w.slug === match[1]);
  return ws ? chatKey(ws.id, match[2] ? "team" : "client") : null;
}
