import type { Metadata } from "next";
import Link from "next/link";
import { Lock, MessagesSquare, Paperclip } from "lucide-react";
import { getMyWorkspaces, requireAgency } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/queries";
import { chatHref, type ChatChannel } from "@/lib/chat";
import { timeAgo } from "@/lib/dates";
import { Avatar, Card } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/anim";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbox" };

type Thread = {
  key: string;
  slug: string;
  name: string;
  channel: ChatChannel;
  unread: number;
  lastAt: string | null;
  preview: string | null;
  hasFiles: boolean;
};

/** Agency inbox: every client conversation, unread first, then newest. */
export default async function InboxPage() {
  const viewer = await requireAgency();
  const supabase = await createClient();
  const [workspaces, { data: summaries }] = await Promise.all([getMyWorkspaces(), supabase.rpc("chat_threads")]);

  const byKey = new Map((summaries ?? []).map((s) => [`${s.workspace_id}:${s.channel}`, s]));
  const people = await getPeople((summaries ?? []).map((s) => s.last_author));

  const threads: Thread[] = workspaces.flatMap((w) =>
    (["client", "team"] as const)
      .map((channel): Thread | null => {
        const s = byKey.get(`${w.id}:${channel}`);
        // Team chats only show up once someone has used them.
        if (!s && channel === "team") return null;
        const author = s?.last_author ? (s.last_author === viewer.id ? "You" : (people.get(s.last_author)?.name.split(" ")[0] ?? "Someone")) : null;
        const text = s ? (s.last_deleted ? "Message deleted" : s.last_body || (s.last_files ? (s.last_files === 1 ? "Sent a file" : `Sent ${s.last_files} files`) : "")) : null;
        return {
          key: `${w.id}:${channel}`,
          slug: w.slug,
          name: w.name,
          channel,
          unread: s?.unread ?? 0,
          lastAt: s?.last_at ?? null,
          preview: s ? `${author ? `${author}: ` : ""}${text}` : null,
          hasFiles: Boolean(s && !s.last_body && s.last_files),
        };
      })
      .filter((t): t is Thread => t !== null),
  );

  threads.sort((a, b) => {
    if (Boolean(a.unread) !== Boolean(b.unread)) return a.unread ? -1 : 1;
    if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
    if (a.lastAt || b.lastAt) return a.lastAt ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const unreadTotal = threads.reduce((sum, t) => sum + t.unread, 0);
  const unreadChats = threads.filter((t) => t.unread).length;

  return (
    <div className="mx-auto max-w-3xl">
      <RealtimeRefresh channel="inbox" watch={[{ table: "messages" }]} />
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          {unreadTotal
            ? `${unreadTotal} unread ${unreadTotal === 1 ? "message" : "messages"} in ${unreadChats} ${unreadChats === 1 ? "chat" : "chats"}`
            : "You're all caught up."}
        </p>
      </div>

      <Card className="overflow-hidden">
        {threads.length ? (
          <Stagger as="ul" className="divide-y divide-line">
            {threads.map((t) => (
              <StaggerItem as="li" key={t.key}>
                <Link
                  href={chatHref(t.slug, t.channel)}
                  className={cn("flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sunken sm:px-5", t.unread && "bg-accent-soft/40")}
                >
                  <span className="relative shrink-0">
                    <Avatar name={t.name} />
                    {t.channel === "team" ? (
                      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-surface">
                        <Lock className="size-2.5" aria-hidden />
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("truncate text-sm text-ink", t.unread ? "font-semibold" : "font-medium")}>{t.name}</span>
                      {t.channel === "team" ? <span className="shrink-0 text-xs font-medium text-violet-700">Team only</span> : null}
                      <span className="ml-auto shrink-0 text-xs text-faint">{t.lastAt ? timeAgo(t.lastAt) : ""}</span>
                    </span>
                    <span className={cn("mt-0.5 flex items-center gap-1 text-[13px]", t.unread ? "text-ink-soft" : "text-muted")}>
                      {t.hasFiles ? <Paperclip className="size-3 shrink-0" aria-hidden /> : null}
                      <span className="truncate">{t.preview ?? "No messages yet. Say hello."}</span>
                    </span>
                  </span>
                  {t.unread ? (
                    <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">
                      {t.unread > 99 ? "99+" : t.unread}
                    </span>
                  ) : null}
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <MessagesSquare className="size-6" aria-hidden />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-ink">No clients yet</p>
            <p className="mt-1 text-sm text-muted">Each client you add gets a chat here.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
