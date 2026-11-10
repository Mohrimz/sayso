"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSaysoChat, getSaysoAllowance, getSaysoChat, listSaysoChats } from "@/app/actions/assistant";
import { DEFAULT_MODEL_MODE, type Allowance, type ChatSummary, type ChatTurn, type ModelMode } from "@/lib/assistant/shared";

type Pending = { question: string; text: string; status: string | null };
type StreamEvent =
  | { type: "status"; label: string }
  | { type: "text"; delta: string }
  | { type: "done"; chatId: string | null; title: string; turn: ChatTurn }
  | { type: "error"; message: string };

export const MAX_QUESTION = 4000;

/**
 * State for one Sayso chat window. Chats are saved on the server; the browser
 * only remembers which chat was open last, so the corner pop-up and the full
 * screen page pick up the same conversation.
 */
export function useSayso({ userId, initialChatId }: { userId: string; initialChatId?: string }) {
  const storageKey = `sayso:current-chat:${userId}`;
  const [chatId, setChatId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [mode, setModeState] = useState<ModelMode>(DEFAULT_MODEL_MODE);
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef(0);
  const modeKey = `sayso:model:${userId}`;

  // Remember each person's model choice in this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(modeKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a saved preference after mount avoids a hydration mismatch
      if (saved === "quick" || saved === "auto" || saved === "deep") setModeState(saved);
    } catch {
      // Storage blocked: use the default.
    }
  }, [modeKey]);

  const setMode = useCallback(
    (next: ModelMode) => {
      setModeState(next);
      try {
        localStorage.setItem(modeKey, next);
      } catch {
        // Storage blocked: the choice lasts until the page reloads.
      }
    },
    [modeKey],
  );

  const refreshAllowance = useCallback(async () => {
    try {
      setAllowance(await getSaysoAllowance());
    } catch {
      // Not critical: the server still enforces the limit.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches from the server; state is set after the request resolves
    void refreshAllowance();
    // Pick up a renewed allowance if the window stays open.
    const timer = window.setInterval(() => void refreshAllowance(), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [refreshAllowance]);

  const remember = useCallback(
    (id: string | null) => {
      try {
        if (id) localStorage.setItem(storageKey, id);
        else localStorage.removeItem(storageKey);
      } catch {
        // Storage blocked: the chat still works, it just won't reopen next time.
      }
    },
    [storageKey],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const openChat = useCallback(
    async (id: string) => {
      stop();
      const ticket = ++loadRef.current;
      setLoading(true);
      setError(null);
      try {
        const chat = await getSaysoChat(id);
        if (ticket !== loadRef.current) return;
        setChatId(chat?.id ?? null);
        setTitle(chat?.title ?? null);
        setTurns(chat?.turns ?? []);
        remember(chat?.id ?? null);
      } catch {
        if (ticket === loadRef.current) setError("That chat couldn't be opened. Try again.");
      } finally {
        if (ticket === loadRef.current) setLoading(false);
      }
    },
    [remember, stop],
  );

  const newChat = useCallback(() => {
    stop();
    loadRef.current++;
    setLoading(false);
    setChatId(null);
    setTitle(null);
    setTurns([]);
    setError(null);
    remember(null);
  }, [remember, stop]);

  // Reopen the chat from the URL, or the one that was open last.
  useEffect(() => {
    let id: string | null | undefined = initialChatId;
    if (!id) {
      try {
        id = localStorage.getItem(storageKey);
      } catch {
        id = null;
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading saved state after mount avoids a hydration mismatch
    if (id) void openChat(id);
  }, [initialChatId, openChat, storageKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const refreshChats = useCallback(async () => {
    try {
      setChats(await listSaysoChats());
    } catch {
      setChats((current) => current ?? []);
    }
  }, []);

  const removeChat = useCallback(
    async (id: string) => {
      setChats((list) => list?.filter((c) => c.id !== id) ?? null);
      if (id === chatId) newChat();
      const { ok } = await deleteSaysoChat(id);
      if (!ok) void refreshChats();
    },
    [chatId, newChat, refreshChats],
  );

  const ask = useCallback(
    /** Asks a question with the chosen model. "Go deeper" passes `{ deeper: true }` to re-ask with Deep. */
    async (raw: string, options: { deeper?: boolean } = {}): Promise<boolean> => {
      const question = raw.trim().slice(0, MAX_QUESTION);
      if (!question || abortRef.current || loading) return false;
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setPending({ question, text: "", status: "Thinking" });

      let finished = false;
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chatId,
            question,
            mode,
            deeper: options.deeper === true,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string; allowance?: Allowance } | null;
          if (data?.allowance) setAllowance(data.allowance);
          throw new Error(data?.error ?? "Sayso couldn't answer. Try again.");
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as StreamEvent;
            if (event.type === "status") setPending((p) => p && { ...p, status: event.label });
            else if (event.type === "text") setPending((p) => p && { ...p, text: p.text + event.delta, status: null });
            else if (event.type === "error") throw new Error(event.message);
            else if (event.type === "done") {
              finished = true;
              setTurns((t) => [...t, event.turn]);
              setTitle(event.title);
              if (event.chatId) {
                const id = event.chatId;
                setChatId(id);
                remember(id);
                setChats((list) =>
                  list ? [{ id, title: event.title, updatedAt: new Date().toISOString() }, ...list.filter((c) => c.id !== id)] : list,
                );
              }
            }
          }
        }
        if (!finished) throw new Error("The answer was interrupted. Try again.");
        return true;
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Something went wrong.");
        return false;
      } finally {
        abortRef.current = null;
        setPending(null);
        void refreshAllowance();
      }
    },
    [chatId, loading, mode, remember, refreshAllowance],
  );

  return { chatId, title, turns, loading, pending, error, chats, allowance, mode, setMode, ask, stop, openChat, newChat, refreshChats, removeChat };
}

export type SaysoState = ReturnType<typeof useSayso>;
