import { AtSign, BadgeCheck, BadgePercent, Bell, CheckCircle2, CircleAlert, FileCheck2, Images, ListTodo, MessageCircle, MessagesSquare, Send, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const KINDS: Record<string, { icon: typeof Bell; tint: string }> = {
  approval_requested: { icon: Send, tint: "bg-accent-soft text-accent" },
  approved: { icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-700" },
  publish_requested: { icon: Send, tint: "bg-emerald-50 text-emerald-700" },
  review_requested: { icon: FileCheck2, tint: "bg-blue-50 text-blue-700" },
  files_added: { icon: Images, tint: "bg-violet-50 text-violet-700" },
  offer: { icon: BadgePercent, tint: "bg-amber-50 text-amber-700" },
  profile_incomplete: { icon: UserRound, tint: "bg-amber-50 text-amber-700" },
  profile_complete: { icon: BadgeCheck, tint: "bg-emerald-50 text-emerald-700" },
  changes_requested: { icon: CircleAlert, tint: "bg-orange-50 text-orange-700" },
  comment: { icon: MessageCircle, tint: "bg-sky-50 text-sky-700" },
  message: { icon: MessagesSquare, tint: "bg-sky-50 text-sky-700" },
  mention: { icon: AtSign, tint: "bg-accent-soft text-accent" },
  task_assigned: { icon: ListTodo, tint: "bg-amber-50 text-amber-700" },
  task_submitted: { icon: FileCheck2, tint: "bg-blue-50 text-blue-700" },
  task_reviewed: { icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-700" },
};

/** Round icon for a notification type, with an unread dot. */
export function NotificationIcon({ type, unread, className }: { type: string; unread?: boolean; className?: string }) {
  const kind = KINDS[type] ?? { icon: Bell, tint: "bg-sunken text-muted" };
  const Icon = kind.icon;
  return (
    <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-xl", kind.tint, className)}>
      <Icon className="size-4" aria-hidden />
      {unread ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-accent" aria-label="Unread" /> : null}
    </span>
  );
}
