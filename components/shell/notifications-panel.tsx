"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Popover } from "radix-ui";
import { Bell, Check, CheckCheck, Settings } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { NotificationIcon } from "@/components/notification-icon";
import { CaughtUp } from "@/components/anim";
import { timeAgo } from "@/lib/dates";
import { cn, safeNext } from "@/lib/utils";

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * The bell: opens a card with recent notifications (Inbox = unread, All),
 * so people can see what's new without leaving the page. Clicking an item
 * opens what it's about and marks it read.
 */
export function NotificationsPanel({
  userId,
  unread,
  variant = "bell",
}: {
  userId: string;
  unread: number;
  variant?: "bell" | "tab";
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"inbox" | "all">("inbox");
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);
    setRows(data ?? []);
  }, [userId]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
  }

  // While the card is open, show new notifications as they arrive.
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`notifications-panel:${id.replace(/[^a-zA-Z0-9]/g, "")}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void load())
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [open, userId, id, load]);

  async function markRead(rowId: string) {
    const now = new Date().toISOString();
    setRows((current) => current?.map((r) => (r.id === rowId ? { ...r, read_at: r.read_at ?? now } : r)) ?? current);
    await createClient().from("notifications").update({ read_at: now }).eq("id", rowId).eq("user_id", userId).is("read_at", null);
    router.refresh();
  }

  async function markAll() {
    const now = new Date().toISOString();
    setRows((current) => current?.map((r) => ({ ...r, read_at: r.read_at ?? now })) ?? current);
    await createClient().from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null);
    router.refresh();
  }

  const unreadRows = (rows ?? []).filter((r) => !r.read_at);
  const visible = tab === "inbox" ? unreadRows : (rows ?? []);
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        aria-label={label}
        className={cn(
          variant === "bell"
            ? "relative inline-flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-sunken data-[state=open]:bg-accent-soft data-[state=open]:text-accent"
            : "relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted data-[state=open]:text-accent",
        )}
      >
        <Bell className="size-5" aria-hidden />
        {variant === "tab" ? <span>Alerts</span> : null}
        <AnimatePresence initial={false}>
          {unread ? (
            <motion.span
              key={unread}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 22 }}
              className={cn(
                "absolute flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-[18px] font-semibold text-white tabular-nums",
                variant === "bell" ? "top-1.5 right-1.5" : "top-1 left-1/2 ml-2",
              )}
            >
              <span aria-hidden className="animate-ping-ring absolute inset-0 -z-10 rounded-full bg-accent" />
              {unread > 9 ? "9+" : unread}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side={variant === "tab" ? "top" : "bottom"}
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="animate-pop z-50 flex w-[min(420px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/15 outline-none"
          aria-label="Notifications"
        >
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-line px-2">
            {(["inbox", "all"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cn("relative flex items-center gap-1.5 px-3 pt-3.5 pb-3 text-sm font-medium transition-colors", tab === t ? "text-ink" : "text-muted hover:text-ink")}
              >
                {t === "inbox" ? "Inbox" : "All"}
                {t === "inbox" && unreadRows.length ? (
                  <span className="rounded-full bg-sunken px-1.5 text-xs font-semibold text-ink-soft tabular-nums">{unreadRows.length}</span>
                ) : null}
                {tab === t ? (
                  <motion.span layoutId={`notif-tab-${id}`} className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" transition={{ type: "spring", stiffness: 520, damping: 40 }} />
                ) : null}
              </button>
            ))}
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
              aria-label="Email notification settings"
              title="Email notification settings"
            >
              <Settings className="size-4" aria-hidden />
            </Link>
          </div>

          {/* List */}
          <div className="max-h-[min(460px,60dvh)] overflow-y-auto overscroll-contain">
            {rows === null ? (
              <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading notifications">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="size-9 animate-pulse rounded-xl bg-sunken" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-sunken" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-sunken" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visible.length ? (
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {visible.map((r) => {
                    const isUnread = !r.read_at;
                    const content = (
                      <>
                        <NotificationIcon type={r.type} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm leading-snug", isUnread ? "font-semibold text-ink" : "text-ink-soft")}>{r.title}</span>
                          {r.body ? <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted">{r.body}</span> : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-faint">
                          {isUnread ? <span className="size-2 rounded-full bg-accent" aria-hidden /> : null}
                          {timeAgo(r.created_at)}
                        </span>
                      </>
                    );
                    return (
                      <motion.li
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                        className="group relative"
                      >
                        {r.link ? (
                          <Link
                            href={safeNext(r.link, "/notifications")}
                            onClick={() => {
                              setOpen(false);
                              if (isUnread) void markRead(r.id);
                            }}
                            className={cn("flex gap-3 px-4 py-3.5 transition-colors hover:bg-sunken", isUnread && "bg-accent-soft/30")}
                          >
                            {content}
                          </Link>
                        ) : (
                          <div className={cn("flex gap-3 px-4 py-3.5", isUnread && "bg-accent-soft/30")}>{content}</div>
                        )}
                        {isUnread ? (
                          <button
                            type="button"
                            onClick={() => void markRead(r.id)}
                            className="absolute right-3 bottom-2.5 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-soft shadow-sm transition hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                            aria-label={`Mark "${r.title}" as read`}
                          >
                            <Check className="size-3" aria-hidden /> Read
                          </button>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            ) : (
              <CaughtUp art="envelope" title={tab === "inbox" ? "You're all caught up" : "No notifications yet"}>
                {tab === "inbox" ? "New approvals, comments and messages will appear here." : null}
              </CaughtUp>
            )}
          </div>

          {/* Footer */}
          <div className="grid grid-cols-2 border-t border-line text-sm font-medium">
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={!unreadRows.length}
              className="inline-flex items-center justify-center gap-1.5 py-3 text-ink-soft transition hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckCheck className="size-4" aria-hidden /> Mark all as read
            </button>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center border-l border-line py-3 text-ink-soft transition hover:bg-sunken hover:text-ink"
            >
              View all
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
