import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { NotificationIcon } from "@/components/notification-icon";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/dates";
import { safeNext, cn } from "@/lib/utils";
import { Button, Card, PageHeader } from "@/components/ui";
import { CaughtUp, Stagger, StaggerItem } from "@/components/anim";
import { NotificationLink } from "@/components/notification-link";
import { markAllRead } from "@/app/actions/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread. Tap one to open it.` : "You're all caught up."}
        actions={
          unread ? (
            <form action={markAllRead}>
              <Button type="submit" size="sm">Mark all as read</Button>
            </form>
          ) : null
        }
      />
      <Card className="overflow-hidden">
        {notifications.length ? (
          <Stagger as="ul" className="divide-y divide-line">
            {notifications.map((n) => {
              const row = (
                <span className={cn("flex items-start gap-3 px-4 py-3.5 transition-colors sm:px-5", !n.read_at && "bg-accent-soft/40")}>
                  <NotificationIcon type={n.type} unread={!n.read_at} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", n.read_at ? "text-ink-soft" : "font-semibold text-ink")}>{n.title}</span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{n.body}</span> : null}
                    <span className="mt-1 block text-xs text-faint">{timeAgo(n.created_at)}</span>
                  </span>
                  {n.link ? <ChevronRight className="mt-2.5 size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden /> : null}
                </span>
              );
              return (
                <StaggerItem as="li" key={n.id}>
                  {n.link ? (
                    <NotificationLink id={n.id} href={safeNext(n.link, "/notifications")} unread={!n.read_at} className="group hover:bg-sunken">
                      {row}
                    </NotificationLink>
                  ) : (
                    row
                  )}
                </StaggerItem>
              );
            })}
          </Stagger>
        ) : (
          <CaughtUp art="envelope" title="No notifications yet">Approvals, comments and new tasks will show up here.</CaughtUp>
        )}
      </Card>
    </div>
  );
}
