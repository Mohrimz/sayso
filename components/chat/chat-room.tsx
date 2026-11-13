"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { discardUploads, signChatAttachments } from "@/app/actions/files";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertDialog, DropdownMenu, Popover } from "radix-ui";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ArrowDown, Copy, CornerUpLeft, Lock, Pencil, UserRound, SmilePlus, MessagesSquare, MoreHorizontal, RotateCw, Trash2, UploadCloud, Volume2, VolumeX, X } from "lucide-react";
import { useMessageSound } from "@/lib/message-sound";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { deleteMessage, editMessage, sendMessage, toggleReaction, type SendResult } from "@/app/actions/chat";
import { Avatar, buttonClass } from "@/components/ui";
import {
  CHAT_PAGE_SIZE,
  chatHref,
  MESSAGE_COLUMNS,
  newId,
  REACTIONS,
  toChatMessage,
  type ChatAttachment,
  type ChatChannel,
  type ChatData,
  type ChatMessage,
  type ChatPerson,
} from "@/lib/chat";
import { formatDay, formatTime, zonedDayKey } from "@/lib/dates";
import { avatarUrl } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { Composer, type ComposerHandle } from "./composer";
import { Attachments, MessageText, TypingDots } from "./message-parts";
import type { MentionedPerson } from "./mention-profile";

type Row = ChatMessage & { pending?: boolean; failed?: string };
/** A reply's quote. "loaded" means the original is on screen, so the quote can jump to it. */
type Quote = {
  id: string;
  name: string;
  text: string;
  loaded: boolean;
  /** Set when the quoted message is in another conversation (a private reply quoting the client chat). */
  from?: string;
  /** Opens the quoted message where it lives. */
  href?: string;
};

/** One line standing in for a message: its text, or what it attached. */
function messagePreview(m: ChatMessage): string {
  const text = m.body.replace(/\s+/g, " ").trim();
  if (text) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  const n = m.attachments.length;
  if (!n) return "Message";
  const kind = m.attachments.every((a) => a.mime.startsWith("image/")) ? "photo" : m.attachments.every((a) => a.mime.startsWith("video/")) ? "video" : "file";
  return n === 1 ? `Sent a ${kind}` : `Sent ${n} ${kind}s`;
}
type Entry =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; row: Row; first: boolean; last: boolean };

const GROUP_GAP_MS = 5 * 60 * 1000;
const noSubscribe = () => () => {};

/** Unsent messages stay at the bottom; everything else is in server time order. */
function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const pa = a.pending || a.failed ? 1 : 0;
    const pb = b.pending || b.failed ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

function upsert(rows: Row[], incoming: Row): Row[] {
  const i = rows.findIndex((r) => r.id === incoming.id);
  if (i === -1) return sortRows([...rows, incoming]);
  const next = rows.slice();
  next[i] = incoming;
  return sortRows(next);
}

function previousDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

function groups(a: Row, b: Row, tz: string) {
  return (
    a.author_id === b.author_id &&
    !a.deleted_at &&
    !b.deleted_at &&
    zonedDayKey(a.created_at, tz) === zonedDayKey(b.created_at, tz) &&
    Date.parse(b.created_at) - Date.parse(a.created_at) < GROUP_GAP_MS
  );
}

function buildEntries(rows: Row[], tz: string, today: string, unreadFrom: string | null): Entry[] {
  const yesterday = previousDay(today);
  const entries: Entry[] = [];
  let day = "";
  rows.forEach((row, i) => {
    const key = zonedDayKey(row.created_at, tz);
    if (key !== day) {
      day = key;
      entries.push({ kind: "day", key: `day-${key}`, label: key === today ? "Today" : key === yesterday ? "Yesterday" : formatDay(key) });
    }
    if (row.id === unreadFrom) entries.push({ kind: "unread", key: "unread" });
    const prev = rows[i - 1];
    const next = rows[i + 1];
    entries.push({
      kind: "message",
      key: row.id,
      row,
      first: !(prev && row.id !== unreadFrom && groups(prev, row, tz)),
      last: !(next && next.id !== unreadFrom && groups(row, next, tz)),
    });
  });
  return entries;
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

const firstName = (name: string) => name.split(/\s+/)[0] || name;

export function ChatRoom({
  workspace,
  channel,
  viewer,
  initial,
  channels,
  unread: initialUnread,
  serverToday,
}: {
  workspace: { id: string; slug: string; name: string; timeZone: string };
  channel: ChatChannel;
  viewer: { id: string; name: string; isAgency: boolean; isAdmin: boolean };
  initial: ChatData;
  /** The conversations this person can switch between, in tab order. */
  channels: ChatChannel[];
  /** Unread messages in the other conversations. */
  unread: Partial<Record<ChatChannel, number>>;
  serverToday: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [people, setPeople] = useState(initial.people);
  const [signed, setSigned] = useState(initial.signed);
  const [readers, setReaders] = useState(initial.readers);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [online, setOnline] = useState<string[]>([]);
  const [newBelow, setNewBelow] = useState(0);
  const [unread, setUnread] = useState(initialUnread);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<Row | null>(null);
  // The message being replied to (shown above the message box until sent or cancelled).
  const [replyingTo, setReplyingTo] = useState<Row | null>(null);
  // Replied-to messages that are older than what's loaded, fetched for their quote.
  const [quoted, setQuoted] = useState<Record<string, ChatMessage | null>>({});
  // Which conversation each fetched quote lives in (a private reply quotes the client chat).
  const [quotedChannel, setQuotedChannel] = useState<Record<string, ChatChannel>>({});
  // True when the message being replied to is from the client chat ("Reply privately").
  const [privateReply, setPrivateReply] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [flash, setFlash] = useState<string | null>(null);
  // Messages that were already there (first load, earlier pages) appear without animation.
  const [quiet, setQuiet] = useState(() => new Set(initial.messages.map((m) => m.id)));

  // First unread message from someone else, fixed for this visit.
  const [unreadFrom] = useState<string | null>(() => {
    const since = initial.lastReadAt ? Date.parse(initial.lastReadAt) : -Infinity;
    return initial.messages.find((m) => m.author_id !== viewer.id && !m.deleted_at && Date.parse(m.created_at) > since)?.id ?? null;
  });

  // Times show in the reader's own time zone once the page is running in the
  // browser; the server render uses the client's zone so the two match.
  const tz = useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone || workspace.timeZone, () => workspace.timeZone);
  const today = useSyncExternalStore(noSubscribe, () => zonedDayKey(new Date().toISOString(), tz), () => serverToday);
  // Message times in US Pacific and Sri Lanka time: "19:30 PT · 09:00 LK".
  const clock = useMemo(() => ({ format: (date: Date) => formatTime(date.toISOString(), tz) }), [tz]);

  const list = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const nearBottom = useRef(true);
  const restoreFromBottom = useRef<number | null>(null);
  const didInit = useRef(false);
  const rowsRef = useRef(rows);
  const typingChannel = useRef<RealtimeChannel | null>(null);
  const typingReady = useRef(false);
  const lastTypingSent = useRef(0);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const isTeam = channel === "team";
  const isDirect = channel === "direct";
  const entries = useMemo(() => buildEntries(rows, tz, today, unreadFrom), [rows, tz, today, unreadFrom]);
  const participants = initial.participants.map((id) => people[id]).filter((p): p is ChatPerson => Boolean(p));
  const others = participants.filter((p) => p.id !== viewer.id);
  const onlineOthers = others.filter((p) => online.includes(p.id));
  // Everyone else who is typing right now, for the bubbles at the bottom of the conversation.
  const typingPeople = Object.keys(typing)
    .filter((id) => id !== viewer.id)
    .map((id) => ({ id, name: people[id]?.name ?? "Someone", avatar: people[id]?.avatar ?? null }));
  const typingNames = Object.keys(typing)
    .filter((id) => id !== viewer.id)
    .map((id) => firstName(people[id]?.name ?? "Someone"));

  // ---------------------------------------------------------------------------
  // Scrolling: stay pinned to the newest message unless the reader scrolled up.
  // ---------------------------------------------------------------------------
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (!didInit.current) {
      didInit.current = true;
      const divider = el.querySelector<HTMLElement>("[data-unread-divider]");
      if (divider && divider.offsetTop > el.clientHeight * 0.6) el.scrollTop = divider.offsetTop - 12;
      else el.scrollTop = el.scrollHeight;
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      return;
    }
    if (restoreFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current;
      restoreFromBottom.current = null;
      return;
    }
    if (nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [rows, typingNames.length]);

  function scrollToBottom(smooth = true) {
    const el = list.current;
    if (!el) return;
    nearBottom.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewBelow(0);
  }

  function keepPinned() {
    const el = list.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // Read markers: opening the chat (or receiving a message while it's on
  // screen) marks it read, and a heartbeat tells the server someone is here
  // so they aren't also sent a notification.
  // ---------------------------------------------------------------------------
  const markRead = useEffectEvent(() => {
    if (document.visibilityState !== "visible") return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      // Query builders are lazy: the request is only sent once it's awaited.
      void (async () => {
        const { error } = await createClient().rpc("mark_chat_read", { p_ws: workspace.id, p_channel: channel });
        if (error) console.warn("[chat] couldn't mark as read", error.message);
      })();
    }, 400);
  });

  // ---------------------------------------------------------------------------
  // Loading people and file links that arrive with new messages
  // ---------------------------------------------------------------------------
  async function ensurePeople(ids: (string | null)[]) {
    const missing = [...new Set(ids.filter((id): id is string => Boolean(id) && !people[id!]))];
    if (!missing.length) return;
    const { data } = await createClient().from("profiles").select("id, full_name, email, side, avatar_path, job_title").in("id", missing);
    if (!data?.length) return;
    setPeople((current) => {
      const next = { ...current };
      for (const p of data) {
        next[p.id] = { id: p.id, name: p.full_name || p.email.split("@")[0], side: p.side, avatar: avatarUrl(p.avatar_path), jobTitle: p.job_title };
      }
      return next;
    });
  }

  // Replies to messages older than what's loaded: fetch those originals for their quotes.
  const wantedQuotes = [...new Set(rows.map((r) => r.reply_to).filter((id): id is string => Boolean(id)))]
    .filter((id) => !(id in quoted) && !rows.some((r) => r.id === id))
    .sort()
    .join(",");
  useEffect(() => {
    if (!wantedQuotes) return;
    const ids = wantedQuotes.split(",");
    let cancelled = false;
    void (async () => {
      const { data } = await createClient().from("messages").select(`${MESSAGE_COLUMNS}, channel`).in("id", ids);
      if (cancelled) return;
      const found = (data ?? []).map(toChatMessage);
      setQuotedChannel((current) => ({ ...current, ...Object.fromEntries((data ?? []).map((m) => [m.id, m.channel])) }));
      // Ones that don't come back are gone (or not ours to see): remembered as null.
      setQuoted((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, found.find((m) => m.id === id) ?? null])) }));
      void ensurePeople(found.map((m) => m.author_id));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids still missing
  }, [wantedQuotes]);

  // "Reply privately": the Direct chat opens with ?reply=<client chat message>, quoted above the message box.
  const replyParam = channel === "direct" ? searchParams.get("reply") : null;
  useEffect(() => {
    if (!replyParam) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("id", replyParam)
        .eq("workspace_id", workspace.id)
        .eq("channel", "client")
        .maybeSingle();
      if (cancelled) return;
      if (!data || data.deleted_at) {
        toast.error("That message isn't available any more.");
      } else {
        const message = toChatMessage(data);
        setQuoted((current) => ({ ...current, [message.id]: message }));
        setQuotedChannel((current) => ({ ...current, [message.id]: "client" }));
        setReplyingTo(message);
        setPrivateReply(true);
        void ensurePeople([message.author_id]);
        composer.current?.focus();
      }
      // Drop ?reply= so a refresh doesn't start the reply again.
      router.replace(pathname, { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per private reply
  }, [replyParam]);

  // A private reply's quote links back here with ?m=<message>: scroll to it and highlight it.
  const jumpParam = channel === "client" ? searchParams.get("m") : null;
  useEffect(() => {
    if (!jumpParam) return;
    const timer = window.setTimeout(() => {
      if (list.current?.querySelector(`[data-message="${jumpParam}"]`)) jumpTo(jumpParam);
      else toast("That message is further back in the chat.");
      router.replace(pathname, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per link
  }, [jumpParam]);

  async function ensureSigned(files: ChatAttachment[]) {
    const missing = [...new Set(files.map((f) => f.path).filter((p) => !signed[p]))];
    if (!missing.length) return;
    const found = await signChatAttachments(workspace.id, channel, missing).catch(() => ({}) as Record<string, string>);
    if (Object.keys(found).length) setSigned((current) => ({ ...found, ...current }));
  }

  const receive = useEffectEvent((raw: Record<string, unknown>, event: "INSERT" | "UPDATE") => {
    const rowChannel = raw.channel as ChatChannel;
    const authorId = (raw.author_id as string | null) ?? null;
    if (rowChannel !== channel) {
      if (event === "INSERT" && authorId !== viewer.id && channels.includes(rowChannel)) setUnread((u) => ({ ...u, [rowChannel]: (u[rowChannel] ?? 0) + 1 }));
      return;
    }
    const message = toChatMessage(raw as Parameters<typeof toChatMessage>[0]);
    const known = rowsRef.current.some((r) => r.id === message.id);
    setRows((current) => upsert(current, message));
    if (event === "INSERT" && !known && authorId !== viewer.id) {
      if (!nearBottom.current) setNewBelow((n) => n + 1);
      if (authorId) {
        setTyping((current) => {
          if (!(authorId in current)) return current;
          const next = { ...current };
          delete next[authorId];
          return next;
        });
      }
      markRead();
    }
    void ensurePeople([authorId]);
    void ensureSigned(message.attachments);
  });

  const receiveRead = useEffectEvent((raw: Record<string, unknown>) => {
    // Read receipts are for the agency only (clients don't receive them anyway).
    if (!viewer.isAgency) return;
    if (raw.channel !== channel || raw.user_id === viewer.id || typeof raw.user_id !== "string") return;
    setReaders((current) => ({ ...current, [raw.user_id as string]: String(raw.last_read_at) }));
  });

  /** Fetches anything missed while the connection was down or the tab asleep. */
  const catchUp = useEffectEvent(async () => {
    const newest = [...rowsRef.current].reverse().find((r) => !r.pending && !r.failed);
    let query = createClient()
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("workspace_id", workspace.id)
      .eq("channel", channel)
      .order("created_at", { ascending: true })
      .limit(100);
    if (newest) query = query.gt("created_at", newest.created_at);
    const { data } = await query;
    for (const raw of data ?? []) receive({ ...raw, channel }, "INSERT");
  });

  // Database changes: new messages, deletions and read markers.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    const filter = `workspace_id=eq.${workspace.id}`;
    void (async () => {
      // Join as the signed-in user, or row-level security rejects the filters.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      ch = supabase
        .channel(`chat-db:${workspace.id}:${channel}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) => receive(p.new, "INSERT"))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (p) => receive(p.new, "UPDATE"))
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads", filter }, (p) => receiveRead(p.new as Record<string, unknown>))
        .subscribe((status) => {
          // Anything posted before this (re)connection is fetched directly.
          if (status === "SUBSCRIBED") void catchUp();
        });
    })();
    return () => {
      cancelled = true;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [workspace.id, channel]);

  // Typing indicators and who's here, on a private channel only people in
  // this conversation can join.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      ch = supabase.channel(`chat:${workspace.id}:${channel}`, {
        config: { private: true, broadcast: { self: false }, presence: { key: viewer.id } },
      });
      ch.on("broadcast", { event: "typing" }, ({ payload }) => {
        const id = typeof payload?.id === "string" ? payload.id : null;
        if (!id || id === viewer.id) return;
        setTyping((current) => {
          const next = { ...current };
          if (payload.stop) delete next[id];
          else next[id] = Date.now() + 5000;
          return next;
        });
      })
        .on("presence", { event: "sync" }, () => {
          if (ch) setOnline(Object.keys(ch.presenceState()));
        })
        .subscribe((status) => {
          typingReady.current = status === "SUBSCRIBED";
          if (status === "SUBSCRIBED" && ch) void ch.track({ at: new Date().toISOString() });
        });
      typingChannel.current = ch;
    })();
    return () => {
      cancelled = true;
      typingReady.current = false;
      typingChannel.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [workspace.id, channel, viewer.id]);

  // Typing indicators fade after a few seconds without news.
  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    if (!typingCount) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((current) => {
        const live = Object.entries(current).filter(([, until]) => until > now);
        return live.length === Object.keys(current).length ? current : Object.fromEntries(live);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typingCount]);

  // Mark read now, when the tab comes back, and every minute while it's open.
  useEffect(() => {
    markRead();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markRead();
        void catchUp();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const heartbeat = setInterval(() => markRead(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(heartbeat);
      if (readTimer.current) clearTimeout(readTimer.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function announceTyping(stop = false) {
    const ch = typingChannel.current;
    if (!ch || !typingReady.current) return;
    const now = Date.now();
    if (!stop && now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = stop ? 0 : now;
    void ch.send({ type: "broadcast", event: "typing", payload: { id: viewer.id, ...(stop ? { stop: true } : {}) } });
  }

  async function deliver(row: Row) {
    let result: SendResult;
    try {
      result = await sendMessage({ id: row.id, workspaceId: workspace.id, channel, body: row.body, attachments: row.attachments, mentions: row.mentions, replyTo: row.reply_to });
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    if (result.ok) {
      const { message, signed: links } = result;
      // Keep any local previews (no flicker); fill in links for everything else.
      setSigned((current) => ({ ...links, ...current }));
      setRows((current) => upsert(current, message));
    } else {
      const error = result.error;
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, pending: false, failed: error } : r)));
    }
  }

  function send(body: string, attachments: ChatAttachment[], previews: Record<string, string>, mentions: string[] = []) {
    const row: Row = {
      id: newId(),
      author_id: viewer.id,
      body,
      attachments,
      mentions,
      reply_to: replyingTo?.id ?? null,
      reactions: {},
      edited_at: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      pending: true,
    };
    setReplyingTo(null);
    setPrivateReply(false);
    if (Object.keys(previews).length) setSigned((current) => ({ ...current, ...previews }));
    nearBottom.current = true;
    setNewBelow(0);
    setRows((current) => sortRows([...current, row]));
    announceTyping(true);
    void deliver(row);
  }

  function retry(row: Row) {
    const again = { ...row, pending: true, failed: undefined };
    setRows((current) => current.map((r) => (r.id === row.id ? again : r)));
    void deliver(again);
  }

  function discard(row: Row) {
    setRows((current) => current.filter((r) => r.id !== row.id));
    if (row.attachments.length) void discardUploads({ scope: "chat", workspaceId: workspace.id, channel }, row.attachments.map((a) => a.path));
  }

  async function confirmDelete() {
    const row = confirming;
    setConfirming(null);
    if (!row) return;
    const before = rowsRef.current.find((r) => r.id === row.id);
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, body: "", attachments: [], deleted_at: new Date().toISOString() } : r)));
    const result = await deleteMessage(row.id);
    if (!result.ok) {
      if (before) setRows((current) => current.map((r) => (r.id === row.id ? before : r)));
      toast.error(result.error ?? "That message couldn't be deleted.");
    }
  }

  /** What a reply shows above its text: who it answers and the start of that message. */
  function quoteFor(row: Row): Quote | undefined {
    if (!row.reply_to) return undefined;
    const target = rows.find((r) => r.id === row.reply_to) ?? quoted[row.reply_to];
    if (target === undefined) return { id: row.reply_to, name: "", text: "Loading…", loaded: false };
    if (target === null || target.deleted_at) return { id: row.reply_to, name: "", text: "Message deleted", loaded: false };
    const author = target.author_id === viewer.id ? "You" : ((target.author_id && people[target.author_id]?.name) || "Former member");
    const quote: Quote = { id: target.id, name: author, text: messagePreview(target), loaded: rows.some((r) => r.id === target.id) };
    // Quoted from the client chat (a private reply): links there instead of jumping within this chat.
    const home = quotedChannel[target.id];
    if (home && home !== channel) {
      quote.from = "Client chat";
      quote.href = `/w/${workspace.slug}/chat?m=${target.id}`;
    }
    return quote;
  }

  /** Scrolls to a quoted message and highlights it briefly. */
  function jumpTo(id: string) {
    const el = list.current?.querySelector(`[data-message="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
    window.setTimeout(() => setFlash((current) => (current === id ? null : current)), 1600);
  }

  /** Adds or removes the viewer's reaction straight away, then saves it. */
  async function react(row: Row, emoji: string) {
    const flip = (r: Row): Row => {
      const people = r.reactions[emoji] ?? [];
      const next = people.includes(viewer.id) ? people.filter((p) => p !== viewer.id) : [...people, viewer.id];
      const reactions = { ...r.reactions, [emoji]: next };
      if (!next.length) delete reactions[emoji];
      return { ...r, reactions };
    };
    setRows((current) => current.map((r) => (r.id === row.id ? flip(r) : r)));
    const result = await toggleReaction(row.id, emoji).catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!result.ok) {
      setRows((current) => current.map((r) => (r.id === row.id ? flip(r) : r)));
      toast.error(result.error ?? "That reaction couldn't be saved.");
    }
  }

  /** Saves new text for one of the viewer's own messages. Shows it straight away; puts the old text back if saving fails. */
  async function saveEdit(row: Row, body: string): Promise<boolean> {
    const text = body.trim();
    if (text === row.body) return true;
    if (!text && !row.attachments.length) {
      toast.error("Write a message, or delete it instead.");
      return false;
    }
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, body: text, edited_at: new Date().toISOString() } : r)));
    const result = await editMessage(row.id, text).catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!result.ok) {
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, body: row.body, edited_at: row.edited_at } : r)));
      toast.error(result.error ?? "That message couldn't be changed.");
      return false;
    }
    return true;
  }

  function startReply(row: Row) {
    setReplyingTo(row);
    setPrivateReply(false);
    composer.current?.focus();
  }

  // Admins and the client can take a client chat message into their private Direct chat.
  const canReplyPrivately = channel === "client" && channels.includes("direct");
  function replyPrivately(row: Row) {
    router.push(`/w/${workspace.slug}/chat/direct?reply=${row.id}`);
  }

  async function loadOlder() {
    const el = list.current;
    const oldest = rowsRef.current.find((r) => !r.pending && !r.failed);
    if (!el || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    const { data, error } = await createClient()
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("workspace_id", workspace.id)
      .eq("channel", channel)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(CHAT_PAGE_SIZE + 1);
    setLoadingOlder(false);
    if (error) {
      toast.error("Couldn't load earlier messages.");
      return;
    }
    const older = (data ?? []).slice(0, CHAT_PAGE_SIZE).map(toChatMessage);
    restoreFromBottom.current = el.scrollHeight - el.scrollTop;
    setQuiet((current) => new Set([...current, ...older.map((m) => m.id)]));
    setHasMore((data ?? []).length > CHAT_PAGE_SIZE);
    setRows((current) => sortRows([...older.filter((o) => !current.some((r) => r.id === o.id)), ...current]));
    void ensurePeople(older.map((m) => m.author_id));
    void ensureSigned(older.flatMap((m) => m.attachments));
  }

  function onScroll() {
    const el = list.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom.current && newBelow) setNewBelow(0);
    if (el.scrollTop < 40 && hasMore && !loadingOlder) void loadOlder();
  }

  // Drag files anywhere onto the chat to attach them.
  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      composer.current?.addFiles(Array.from(e.dataTransfer.files));
      composer.current?.focus();
    },
  };

  // ---------------------------------------------------------------------------
  // Copy
  // ---------------------------------------------------------------------------
  const clientNames = participants.filter((p) => p.side === "client").map((p) => firstName(p.name));
  const title = isTeam ? "Team only" : isDirect ? (viewer.isAgency ? `${workspace.name} · Direct` : "Direct with the agency admin") : viewer.isAgency ? workspace.name : "Your agency team";
  const subtitle = typingNames.length
    ? null
    : onlineOthers.length
      ? `${joinNames(onlineOthers.map((p) => firstName(p.name)))} ${onlineOthers.length === 1 ? "is" : "are"} here now`
      : isTeam
        ? `Private to the agency. ${workspace.name} can't see this.`
        : isDirect
          ? viewer.isAgency
            ? `Only admins and ${clientNames.length ? joinNames(clientNames) : "the client"} see this. Your team doesn't.`
            : "Only you and the agency's admins see this, not the rest of the team."
          : viewer.isAgency
          ? clientNames.length
            ? `With ${joinNames(clientNames)} and your team`
            : "No one from the client has joined yet"
          : `Everyone in ${workspace.name} and the agency team can read this`;

  const placeholder = isTeam
    ? "Message the team (the client can't see this)"
    : isDirect
      ? viewer.isAgency
        ? `Message ${workspace.name} directly (your team can't see this)`
        : "Message the admin directly"
      : viewer.isAgency
        ? `Message ${workspace.name}`
        : "Message the team";

  // Read status, for the agency only (clients never see who read what). It sits
  // under the viewer's own latest message, wherever that is in the conversation:
  // "Seen by Maya and Sam", or "Not seen yet" until someone else opens the chat.
  const lastMine = viewer.isAgency ? rows.findLast((r) => r.author_id === viewer.id && !r.pending && !r.failed && !r.deleted_at) : undefined;
  const seenBy = lastMine
    ? Object.entries(readers)
        .filter(([id, at]) => id !== viewer.id && Date.parse(at) >= Date.parse(lastMine.created_at))
        .map(([id]) => people[id]?.name)
        .filter((n): n is string => Boolean(n))
        .map(firstName)
    : [];
  const receipt = lastMine ? (seenBy.length ? `Seen by ${joinNames(seenBy)}` : "Not seen yet") : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Chat</h1>
          <SoundToggle />
        </div>
        {channels.length > 1 ? (
          <nav className="inline-flex shrink-0 rounded-xl bg-sunken p-1" aria-label="Conversations">
            {channels.map((c) => {
              const active = c === channel;
              const count = active ? 0 : (unread[c] ?? 0);
              return (
                <Link
                  key={c}
                  href={chatHref(workspace.slug, c)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition",
                    active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {c === "team" ? <Lock className="size-3.5" aria-hidden /> : c === "direct" ? <UserRound className="size-3.5" aria-hidden /> : null}
                  {c === "team" ? "Team only" : c === "direct" ? "Direct" : viewer.isAgency ? "Client chat" : "Team chat"}
                  {count ? (
                    <span className="min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] leading-[18px] font-semibold text-white tabular-nums">
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>

      <section
        aria-label={isTeam ? "Team-only chat" : isDirect ? "Direct chat" : "Chat"}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-surface",
          isTeam ? "border-violet-200" : "border-line",
        )}
        {...dragHandlers}
      >
        <header className={cn("flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4", isTeam ? "border-violet-100 bg-violet-50/70" : "border-line")}>
          {isTeam ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <Lock className="size-4" aria-hidden />
            </span>
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MessagesSquare className="size-[18px]" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{title}</p>
            <p className={cn("flex items-center gap-1.5 truncate text-xs", typingNames.length ? "text-accent" : "text-muted")} aria-live="polite">
              {typingNames.length ? (
                <>
                  <TypingDots />
                  {joinNames(typingNames)} {typingNames.length === 1 ? "is" : "are"} typing
                </>
              ) : (
                subtitle
              )}
            </p>
          </div>
          <PeopleStack people={participants} online={online} viewerId={viewer.id} />
        </header>

        <div ref={list} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-3 sm:px-5" role="log" aria-label="Messages">
          {hasMore ? (
            <div className="flex justify-center py-2">
              <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className={buttonClass("ghost", "sm")}>
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          ) : null}

          {rows.length ? (
            entries.map((entry) => {
              if (entry.kind === "day") {
                return (
                  <div key={entry.key} className="sticky top-0 z-10 flex justify-center py-2">
                    <span className="rounded-full border border-line bg-surface/95 px-2.5 py-0.5 text-[11px] font-medium text-muted shadow-sm backdrop-blur">
                      {entry.label}
                    </span>
                  </div>
                );
              }
              if (entry.kind === "unread") {
                return (
                  <div key={entry.key} data-unread-divider className="my-3 flex items-center gap-2" role="separator" aria-label="New messages">
                    <span className="h-px flex-1 bg-accent/40" />
                    <span className="rounded-full bg-accent px-2 py-px text-[10px] font-semibold tracking-wide text-white uppercase">New</span>
                  </div>
                );
              }
              return (
                <MessageRow
                  key={entry.key}
                  entry={entry}
                  person={entry.row.author_id ? people[entry.row.author_id] : undefined}
                  mentioned={entry.row.mentions.flatMap((id) => {
                    const p = people[id];
                    if (!p?.name) return [];
                    // The full profile page is for agency admins only.
                    return [{ ...p, me: id === viewer.id, here: online.includes(id), profileHref: viewer.isAdmin ? `/people/${id}` : null }];
                  })}
                  mine={entry.row.author_id === viewer.id}
                  showSide={!isTeam}
                  clock={clock}
                  signed={signed}
                  canDelete={entry.row.author_id === viewer.id || viewer.isAdmin}
                  animate={!quiet.has(entry.row.id)}
                  quote={quoteFor(entry.row)}
                  highlighted={flash === entry.row.id}
                  onReply={() => startReply(entry.row)}
                  onReplyPrivately={
                    canReplyPrivately && entry.row.author_id && entry.row.author_id !== viewer.id ? () => replyPrivately(entry.row) : undefined
                  }
                  viewerId={viewer.id}
                  nameOf={(id) => (id === viewer.id ? "You" : (people[id]?.name ?? "Former member"))}
                  onReact={(emoji) => void react(entry.row, emoji)}
                  onJump={jumpTo}
                  onMediaLoad={keepPinned}
                  onDelete={() => setConfirming(entry.row)}
                  onEdit={(text) => saveEdit(entry.row, text)}
                  receipt={lastMine?.id === entry.row.id ? receipt : null}
                  onRetry={() => retry(entry.row)}
                  onDiscard={() => discard(entry.row)}
                />
              );
            })
          ) : (
            <EmptyChat isTeam={isTeam} isDirect={isDirect} isAgency={viewer.isAgency} workspaceName={workspace.name} />
          )}

          {/* Someone is typing: a bubble with moving dots, where their message will appear. */}
          <AnimatePresence initial={false}>
            {typingPeople.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-end gap-2 overflow-hidden"
                data-typing={p.id}
              >
                <div className="w-8 shrink-0 pt-3">
                  <Avatar name={p.name} src={p.avatar} />
                </div>
                <div className="mt-3">
                  <p className="mb-1 px-1 text-xs font-semibold text-ink">{p.name}</p>
                  <div className="inline-flex h-9 items-center rounded-2xl bg-sunken px-4 text-muted" role="status" aria-label={`${p.name} is typing`}>
                    <TypingDots large />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {newBelow ? (
            <motion.button
              type="button"
              onClick={() => scrollToBottom()}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-[88px] left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-lg sm:bottom-[104px]"
            >
              <ArrowDown className="size-3.5" aria-hidden />
              {newBelow === 1 ? "1 new message" : `${newBelow} new messages`}
            </motion.button>
          ) : null}
        </AnimatePresence>

        {replyingTo ? (
          <div className="mx-3 mb-1 flex items-center gap-2 rounded-xl border-l-[3px] border-accent bg-sunken px-3 py-2 sm:mx-5">
            {privateReply ? <Lock className="size-4 shrink-0 text-accent" aria-hidden /> : <CornerUpLeft className="size-4 shrink-0 text-accent" aria-hidden />}
            <p className="min-w-0 flex-1 text-[13px]">
              <span className="font-semibold text-ink">
                Replying {privateReply ? "privately " : ""}to{" "}
                {replyingTo.author_id === viewer.id ? "yourself" : ((replyingTo.author_id && people[replyingTo.author_id]?.name) || "Former member")}
              </span>
              {privateReply ? <span className="text-muted"> · from the client chat</span> : null}
              <span className="block truncate text-muted">{messagePreview(replyingTo)}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setReplyingTo(null);
                setPrivateReply(false);
              }}
              className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
              aria-label="Cancel reply"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <Composer
          ref={composer}
          workspaceId={workspace.id}
          channel={channel}
          placeholder={placeholder}
          people={participants.filter((p) => p.id !== viewer.id)}
          onSend={send}
          onTyping={() => announceTyping()}
        />

        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/90">
            <p className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
              <UploadCloud className="size-5" aria-hidden /> Drop files to attach them
            </p>
          </div>
        ) : null}
      </section>

      <AlertDialog.Root open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <AlertDialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-xl">
            <AlertDialog.Title className="text-base font-semibold text-ink">Delete this message?</AlertDialog.Title>
            <AlertDialog.Description className="mt-1 text-sm text-muted">
              It will be removed for everyone{confirming?.attachments.length ? ", along with its files" : ""}. This can&apos;t be undone.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel className={buttonClass("secondary", "md")}>Cancel</AlertDialog.Cancel>
              <AlertDialog.Action className={buttonClass("danger", "md")} onClick={() => void confirmDelete()}>
                Delete
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function MessageRow({
  entry,
  person,
  mentioned,
  mine,
  showSide,
  clock,
  signed,
  canDelete,
  animate,
  quote,
  highlighted,
  onReply,
  onReplyPrivately,
  onJump,
  viewerId,
  nameOf,
  onReact,
  onMediaLoad,
  onDelete,
  onEdit,
  receipt,
  onRetry,
  onDiscard,
}: {
  /** The message this one replies to, shown as a small quote above it. */
  quote?: Quote;
  /** Briefly true after someone jumps here from a reply's quote. */
  highlighted: boolean;
  onReply: () => void;
  /** Takes this client chat message into the private Direct chat (admins and the client only). */
  onReplyPrivately?: () => void;
  onJump: (id: string) => void;
  viewerId: string;
  nameOf: (id: string) => string;
  onReact: (emoji: string) => void;
  entry: Extract<Entry, { kind: "message" }>;
  person?: ChatPerson;
  /** People @mentioned in this message; "me" marks the viewer. Tapping one opens their profile card. */
  mentioned: MentionedPerson[];
  mine: boolean;
  showSide: boolean;
  clock: { format: (date: Date) => string };
  signed: Record<string, string>;
  canDelete: boolean;
  animate: boolean;
  onMediaLoad: () => void;
  onDelete: () => void;
  /** Saves new text for the viewer's own message; resolves to false if it couldn't be saved. */
  onEdit: (text: string) => Promise<boolean>;
  /** "Seen by …" or "Not seen yet", on the viewer's latest message (agency only). */
  receipt?: string | null;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const { row, first, last } = entry;
  const name = person?.name ?? "Former member";
  const time = clock.format(new Date(row.created_at));
  const deleted = Boolean(row.deleted_at);
  const hasBody = row.body.length > 0;
  const [picking, setPicking] = useState(false);
  // The text being edited (null when not editing).
  const [draft, setDraft] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const finishEdit = async () => {
    if (draft === null || savingEdit) return;
    setSavingEdit(true);
    const ok = await onEdit(draft);
    setSavingEdit(false);
    if (ok) setDraft(null);
  };

  const menu =
    !deleted && !row.pending && !row.failed ? (
      <div className="flex shrink-0 items-center self-center">
      <button
        type="button"
        onClick={onReply}
        className="inline-flex size-7 items-center justify-center rounded-full text-faint opacity-0 transition group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
        aria-label="Reply"
        title="Reply"
      >
        <CornerUpLeft className="size-4" aria-hidden />
      </button>
      <Popover.Root open={picking} onOpenChange={setPicking}>
        <Popover.Trigger
          className="inline-flex size-7 items-center justify-center rounded-full text-faint opacity-0 transition group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-60"
          aria-label="React"
          title="React"
        >
          <SmilePlus className="size-4" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="top" sideOffset={6} className="animate-pop z-50 flex gap-0.5 rounded-full border border-line bg-surface p-1 shadow-xl shadow-black/10">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setPicking(false);
                  onReact(emoji);
                }}
                className={cn("flex size-9 items-center justify-center rounded-full text-xl transition hover:scale-125 hover:bg-sunken", row.reactions[emoji]?.includes(viewerId) && "bg-accent-soft")}
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="inline-flex size-7 shrink-0 items-center justify-center self-center rounded-full text-faint opacity-0 transition group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-60"
          aria-label="Message options"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align={mine ? "end" : "start"}
            sideOffset={4}
            className="animate-pop z-50 min-w-40 rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10"
          >
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-sunken data-[highlighted]:text-ink"
              onSelect={onReply}
            >
              <CornerUpLeft className="size-4" aria-hidden /> Reply
            </DropdownMenu.Item>
            {onReplyPrivately ? (
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-sunken data-[highlighted]:text-ink"
                onSelect={onReplyPrivately}
              >
                <Lock className="size-4" aria-hidden /> Reply privately
              </DropdownMenu.Item>
            ) : null}
            {mine ? (
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-sunken data-[highlighted]:text-ink"
                onSelect={() => setDraft(row.body)}
              >
                <Pencil className="size-4" aria-hidden /> Edit
              </DropdownMenu.Item>
            ) : null}
            {hasBody ? (
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-sunken data-[highlighted]:text-ink"
                onSelect={() => {
                  void navigator.clipboard?.writeText(row.body).then(() => toast.success("Copied"));
                }}
              >
                <Copy className="size-4" aria-hidden /> Copy text
              </DropdownMenu.Item>
            ) : null}
            {canDelete ? (
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft"
                onSelect={onDelete}
              >
                <Trash2 className="size-4" aria-hidden /> Delete
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      </div>
    ) : null;

  const reacted = Object.entries(row.reactions).filter(([, ids]) => ids.length);
  const reactionChips = !deleted && reacted.length ? (
    <div className={cn("mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
      {reacted.map(([emoji, ids]) => {
        const byMe = ids.includes(viewerId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            title={ids.map(nameOf).join(", ")}
            aria-label={`${emoji} ${ids.length}: ${ids.map(nameOf).join(", ")}. ${byMe ? "Remove your reaction" : "Add yours"}`}
            aria-pressed={byMe}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] leading-5 transition",
              byMe ? "border-accent/50 bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-soft hover:bg-sunken",
            )}
          >
            <span>{emoji}</span>
            <span className="text-xs font-medium tabular-nums">{ids.length}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  const quoteCard = quote && !deleted && quote.href ? (
    // Quoted from the client chat: opens the original there.
    <Link
      href={quote.href}
      className="mb-0.5 block max-w-full rounded-xl border-l-[3px] border-accent/70 bg-sunken/70 px-2.5 py-1.5 text-left text-xs hover:bg-sunken"
      aria-label={`In reply to ${quote.name} in the ${quote.from?.toLowerCase()}: ${quote.text}`}
    >
      <span className="flex items-center gap-1 font-semibold text-ink-soft">
        <Lock className="size-3 shrink-0 text-faint" aria-hidden />
        {quote.name} · {quote.from}
      </span>
      <span className="line-clamp-2 break-words text-muted">{quote.text}</span>
    </Link>
  ) : quote && !deleted ? (
    <button
      type="button"
      onClick={() => quote.loaded && onJump(quote.id)}
      disabled={!quote.loaded}
      className={cn(
        "mb-0.5 block max-w-full rounded-xl border-l-[3px] border-accent/70 bg-sunken/70 px-2.5 py-1.5 text-left text-xs",
        quote.loaded && "cursor-pointer hover:bg-sunken",
      )}
      aria-label={quote.name ? `In reply to ${quote.name}: ${quote.text}` : quote.text}
    >
      {quote.name ? <span className="block font-semibold text-ink-soft">{quote.name}</span> : null}
      <span className={cn("line-clamp-2 break-words text-muted", !quote.name && "italic")}>{quote.text}</span>
    </button>
  ) : null;

  const bubble = deleted ? (
    <div className="rounded-2xl border border-dashed border-line px-3 py-1.5 text-[13px] text-faint italic">Message deleted</div>
  ) : (
    <div className={cn("flex min-w-0 flex-col gap-1.5", mine ? "items-end" : "items-start")}>
      {quoteCard}
      {draft !== null ? (
        <div className="w-[min(100%,420px)] min-w-[240px] rounded-2xl border border-accent/50 bg-surface p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft(null);
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void finishEdit();
              }
            }}
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            maxLength={4000}
            autoFocus
            aria-label="Edit your message"
            className="block w-full resize-none bg-transparent px-1.5 py-1 text-[15px] leading-snug text-ink outline-none sm:text-sm"
          />
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span className="mr-auto pl-1.5 text-[11px] text-faint">Enter to save · Esc to cancel</span>
            <button type="button" onClick={() => setDraft(null)} disabled={savingEdit} className={buttonClass("ghost", "sm")}>
              Cancel
            </button>
            <button type="button" onClick={() => void finishEdit()} disabled={savingEdit} className={buttonClass("primary", "sm")}>
              {savingEdit ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : hasBody ? (
        <div
          title={row.edited_at ? `${time} (edited)` : time}
          className={cn(
            "max-w-full rounded-2xl px-3.5 py-2",
            mine ? "bg-accent text-white" : "bg-sunken text-ink",
            !mine && mentioned.some((m) => m.me) && "ring-2 ring-accent/35",
            mine ? [!first && "rounded-tr-md", !last && "rounded-br-md"] : [!first && "rounded-tl-md", !last && "rounded-bl-md"],
            row.pending && "opacity-70",
          )}
        >
          <MessageText text={row.body} mine={mine} mentions={mentioned} />
          {row.edited_at ? <span className={cn("mt-0.5 block text-right text-[10px]", mine ? "text-white/70" : "text-faint")}>edited</span> : null}
        </div>
      ) : null}
      <Attachments files={row.attachments} signed={signed} mine={mine} onMediaLoad={onMediaLoad} />
    </div>
  );

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      data-message={row.id}
      className={cn(
        "group flex gap-2 rounded-xl transition-colors duration-700",
        mine ? "justify-end" : "justify-start",
        first || quote ? "mt-3" : "mt-0.5",
        highlighted && "bg-accent-soft",
      )}
    >
      {!mine ? <div className="w-8 shrink-0 pt-5">{first ? <Avatar name={name} src={person?.avatar} /> : null}</div> : null}
      <div className={cn("flex max-w-[85%] min-w-0 flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
        {first && !mine ? (
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs">
            <span className="font-semibold text-ink">{name}</span>
            {showSide && person?.side === "agency" ? (
              <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold text-accent-ink">Agency</span>
            ) : null}
            <span className="text-faint">{time}</span>
          </div>
        ) : null}
        <div className="flex max-w-full items-center gap-1">
          {mine ? menu : null}
          {bubble}
          {!mine ? menu : null}
        </div>
        {reactionChips}
        {row.failed ? (
          <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 px-1 text-[11px]" role="alert">
            <span className="text-danger">Not sent. {row.failed}</span>
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline">
              <RotateCw className="size-3" aria-hidden /> Retry
            </button>
            <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 text-muted hover:text-ink">
              <X className="size-3" aria-hidden /> Remove
            </button>
          </div>
        ) : mine && (last || row.pending || receipt) ? (
          <p className="mt-1 px-1 text-right text-[11px] text-faint" data-receipt={receipt ? "" : undefined}>
            {row.pending ? "Sending…" : time}
            {receipt && !row.pending ? <span className={receipt.startsWith("Seen") ? "text-muted" : undefined}> · {receipt}</span> : null}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

function PeopleStack({ people, online, viewerId }: { people: ChatPerson[]; online: string[]; viewerId: string }) {
  if (!people.length) return null;
  const sorted = [...people].sort((a, b) => Number(online.includes(b.id)) - Number(online.includes(a.id)));
  const shown = sorted.slice(0, 3);
  const extra = people.length - shown.length;
  const label = people
    .map((p) => `${p.name}${p.jobTitle ? ` (${p.jobTitle})` : ""}${p.id === viewerId ? ", you" : ""}${online.includes(p.id) ? ", here now" : ""}`)
    .join("; ");
  return (
    <div className="flex shrink-0 items-center" title={label} aria-label={`In this chat: ${label}`} role="img">
      <div className="flex -space-x-1">
        {shown.map((p) => (
          <span key={p.id} className="relative rounded-full ring-2 ring-surface">
            <Avatar name={p.name} src={p.avatar} size="sm" />
            {online.includes(p.id) ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" /> : null}
          </span>
        ))}
      </div>
      {extra > 0 ? <span className="ml-1.5 text-xs font-medium text-muted">+{extra}</span> : null}
    </div>
  );
}

function EmptyChat({ isTeam, isDirect, isAgency, workspaceName }: { isTeam: boolean; isDirect: boolean; isAgency: boolean; workspaceName: string }) {
  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center px-6 py-10 text-center">
      <span className={cn("flex size-14 items-center justify-center rounded-2xl", isTeam ? "bg-violet-100 text-violet-700" : "bg-accent-soft text-accent")}>
        {isTeam ? <Lock className="size-6" aria-hidden /> : <MessagesSquare className="size-6" aria-hidden />}
      </span>
      <p className="mt-4 text-[15px] font-semibold text-ink">{isTeam ? "Talk about this client privately" : isDirect ? "A private line" : "Start the conversation"}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {isTeam
          ? `Only your agency team sees these messages. ${workspaceName} never does.`
          : isDirect
            ? isAgency
              ? `Only agency admins and ${workspaceName} see these messages. Team members don't.`
              : "Only you and the agency's admins see these messages. Use it for anything you'd rather not share with the whole team."
            : isAgency
            ? `Messages here go to everyone at ${workspaceName} who uses the portal, and to your team.`
            : "Ask a question, share an idea or send photos. Everyone on the agency team working with you will see it."}
      </p>
    </div>
  );
}

/** Turns the new-message chime on or off for this device. */
function SoundToggle() {
  const [on, setOn] = useMessageSound();
  const label = on ? "Message sound on. Tap to mute" : "Message sound off. Tap to turn on";
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
    >
      {on ? <Volume2 className="size-[18px]" aria-hidden /> : <VolumeX className="size-[18px]" aria-hidden />}
    </button>
  );
}
